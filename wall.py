"""Agora wall: tell the agent what you want, watch real listings land as cutouts on one grey wall.

Run:   python3 wall.py   then open http://localhost:8001
Check: python3 wall.py --check   (no network; tests the pure helpers)
MCP:   POST http://localhost:8001/mcp   (tool find_offers, for other AI agents)

Pipeline: DeepSeek reads the request (product, condition, budget, delivery) -> Context.dev Search finds pages that
sell it -> Context.dev reads each page and returns offers as JSON -> cutout.m (macOS Vision) lifts the object out of each photo ->
DeepSeek picks the best offer. Every model token and every page read is streamed to the browser's live log.
Reuses post_json / load_env / SITES from agora.py. Stdlib only; the cutout needs macOS 14+, anywhere else
the wall shows the photos as they are. The page itself is wall.html.
"""
import glob, ipaddress, json, os, re, shutil, subprocess, sys, tempfile, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import threading

import agora

PORT = 8001
N_SITES = 8            # ponytail: this Context.dev key allows 10 requests/min: 2 web searches + 8 reads is one whole minute
N_QUERIES = 2
MIN_FOUND = 4          # fewer discovered pages than this: top up with the known marketplaces
MAX_OFFERS = 12        # per site
MAX_CHAT_OFFERS = 80
MAX_IMAGE_BYTES = 8_000_000
READ_TIMEOUT_MS = 40_000
FALLBACK_SITES = ["tori", "kleinanzeigen", "marktplaats", "blocket", "rebuy"]
MAX_ABOUT = 400        # what the browser remembers about the user (earlier searches, opened items)
CONDITIONS = ("new", "used", "refurbished")
ALLOWED_IMAGES = set()  # photo URLs we sent to the browser; /cut serves only these
CUTOUT_SRC = os.path.join(agora.HERE, "cutout.m")
CUTOUT_BIN = os.path.join(agora.HERE, ".cutout-bin")
CUTOUT_TIMEOUT_S = 8   # a normal cutout takes under a second; a stuck one must not hold a worker (and the photos queued behind it)
STUCK_DIR = os.environ.get("AGORA_STUCK_DIR", "")  # debugging aid, off unless set
WARM_AFTER_S = 15      # the cutout engine goes cold when idle: its first run then takes ~4 s, and several cold runs at once all time out
WARM_TIMEOUT_S = 30
SLOW_PHOTO_S = 1.5     # photos slower than this get a log line saying which step took the time
PHOTO_TIMEOUT_S = 8    # downloading the photo from the site
CUTS = {}  # photo URL -> (content type, bytes). ponytail: unbounded memory cache; cap it if the server runs for days
DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"
# ponytail: rough fixed rates so offers in six currencies compare; fetch ECB daily rates when money decisions depend on it
RATES_EUR = {"EUR": 1, "SEK": 0.088, "NOK": 0.085, "DKK": 0.134, "PLN": 0.235, "GBP": 1.17, "CHF": 1.06, "CZK": 0.04}

# The sites in research/platform-tests.md returned listings, but these exact search URLs are not re-tested yet.
EXTRA_SITES = {
    "ebay_de":   ("DE", "mixed", "https://www.ebay.de/sch/i.html?_nkw={q}"),
    "leboncoin": ("FR", "used",  "https://www.leboncoin.fr/recherche?text={q}"),
    "wallapop":  ("ES", "used",  "https://es.wallapop.com/app/search?keywords={q}"),
    "subito":    ("IT", "used",  "https://www.subito.it/annunci-italia/vendita/usato/?q={q}"),
    "willhaben": ("AT", "used",  "https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz?keyword={q}"),
}
SITES = {**agora.SITES, **EXTRA_SITES}
# Pages that rank for "X for sale" but list nothing we can read as offers.
SKIP_DOMAINS = ("facebook.com", "reddit.com", "youtube.com", "wikipedia.org", "pinterest.com", "instagram.com", "tiktok.com",
                "quora.com", "twitter.com", "x.com", "linkedin.com")
TLD_COUNTRY = {"de": "DE", "nl": "NL", "fi": "FI", "se": "SE", "at": "AT", "fr": "FR", "it": "IT", "es": "ES", "be": "BE", "pl": "PL",
               "dk": "DK", "no": "NO", "uk": "GB", "ch": "CH", "ie": "IE", "pt": "PT", "cz": "CZ"}

OFFER_SCHEMA = {
    "type": "object", "required": ["offers"], "additionalProperties": False,
    "properties": {"offers": {"type": "array", "items": {
        "type": "object", "additionalProperties": False,
        "required": ["title", "price", "currency", "listingUrl", "imageUrl"],
        "properties": {
            "title": {"type": "string"},
            "price": {"type": "number"},
            "currency": {"type": "string", "description": "ISO code, e.g. EUR, SEK"},
            "listingUrl": {"type": "string"},
            "imageUrl": {"type": "string", "description": "URL of the listing's main photo"},
            "location": {"type": "string", "description": "Seller's town, if shown"},
            "condition": {"type": "string", "description": "new, used or refurbished, if the listing says"},
            "delivery": {"type": "string", "description": "Delivery or pickup text as shown, e.g. 'Free delivery Thu 14 Nov', 'Pickup only'"},
        }}}},
}

BAR_SYSTEM = (
    "You are Agora, a shopping agent for second-hand and new goods in Europe. You live inside a search bar: the user types, you "
    "answer underneath, and they keep typing until the search is right. Reply with JSON only: "
    '{"say":"one short sentence, at most 90 characters: say what you will look for, or ask for the ONE most useful missing '
    'detail (budget, condition, country, pickup or shipping). Never more than one question",'
    '"request":"the whole request as you understand it, one line, at most 120 characters",'
    '"product":"short product name in English","condition":"new"|"used"|"refurbished"|"any",'
    '"max_price_eur":number or null,"delivery":"what the user said about delivery or pickup, else null",'
    '"queries":["exactly 2 web search queries that find pages LISTING this product for sale, in two different European '
    "languages or countries that fit the user (their own country first when known), like 'VW Polo gebraucht kaufen' and "
    "'tweedehands VW Polo te koop'\"]}"
)

ADVISE_SYSTEM = (
    "You are Agora, a shopping agent. You get the user's request and the offers now on their screen, one JSON object per line "
    "(eur = price converted to euros). Reply with JSON only, keys in this order: "
    '{"thinking":"1-2 short sentences","say":"at most 2 sentences to the user: which offer you would pick and why '
    '(price, condition, delivery), or say plainly that nothing fits. Name an offer by its title, never by its id","best":"<offer id or null>",'
    '"hide":["ids that are not the product itself or that break a limit the user stated"],'
    '"search":"a full new request, only when the user now wants a different product or different sites, else null"}. '
    "Judge only from the listed fields; an empty delivery field means the page did not say."
)

BRAIN_SYSTEM = (
    "You are the brain of Agora's shopping guide: a character who talks with the user by voice while Agora reads European "
    "second-hand and shop sites live. You get the whole conversation so far as it was heard and spoken (speech transcripts, so "
    "expect small errors), whether a search is running, the offers now loaded "
    "(one JSON object per line, eur = price in euros; there may be none) and what just happened. Decide what the guide does next. "
    # lang comes first on purpose: naming the user's language before writing keeps say in it. Without it, an English request
    # over Dutch offers was answered in Dutch 4 times of 6; with it, 0 of 6 (and Finnish stayed Finnish)
    'Reply with JSON only: {"lang":"the language of the user\'s own lines in the conversation, as its English name (the '
    'offers\' language does not count)","action":"search"|"answer"|"ask",'
    '"request":"for search: the whole request in one line, at most 120 characters: product, budget, condition, place. Else empty",'
    '"say":"what the guide says aloud, in the user\'s language (the language of their own words and of the request, '
    "whatever language the offers are written in): at most 2 short spoken sentences, no lists, no ids, no links. "
    "search: one short line that you go and look. answer: the answer; name an offer by what it is, its price and its site. "
    'ask: the ONE most useful question",'
    '"show":[{"id":"<offer id>","why":"at most 6 words"}]}. '
    "search: the user wants a product, or new limits (another budget, condition or country) that the loaded offers cannot answer. "
    "A product name alone is enough to search: ask first only when you cannot tell which product is meant. "
    "answer: whatever the loaded offers can answer (cheapest, nearest, which one fits, compare, under a price): put up to 3 of "
    "them in show, best first. Small talk and general shopping questions are also answer, briefly, with show empty. "
    "While a search is running, never start it again for the same thing: answer that you are still reading the sites. "
    "When a search just finished, the action is answer: choose up to 3 offers that fit the request best (the product itself, "
    "not accessories or parts; inside the budget and condition asked), best first, and say what, price and where. "
    "If none fit, say so plainly. Only name offers from the list. Never invent an offer, a price or a site. "
    "The user's words reach you through speech recognition, which mishears names: when a city, brand or model in them does not "
    "exist but sounds like one that does (Tikburg -> Tilburg, Samsun Galaxy -> Samsung Galaxy, Dedika -> Dedica), use the real "
    "name in request and in say, without mentioning it."
)
BRAIN_ACTIONS = ("search", "answer", "ask")
MAX_SHOW = 3

MCP_TOOL = {
    "name": "find_offers",
    "description": "Search European marketplaces live (new, refurbished and used) for a product. Takes about 20-40 seconds. "
                   "Returns offers with price, condition, site, country, delivery text and links, plus the agent's pick.",
    "inputSchema": {"type": "object", "required": ["request"], "properties": {"request": {
        "type": "string", "description": "What to buy, in natural language. May include condition, budget, delivery needs "
                                         "and site names, e.g. 'used espresso machine under 200 EUR on marktplaats and ebay'."}}},
}


def site_url(site, query):
    words = query.strip().split()
    return SITES[site][2].format(q=urllib.parse.quote_plus(query.strip()), dash="-".join(urllib.parse.quote(w) for w in words))


def public_https(url):
    """True for https URLs on a named public host. Blocks IP literals and local names."""
    try:
        p = urllib.parse.urlsplit(url)
        host = p.hostname or ""
    except ValueError:
        return False
    if p.scheme != "https" or "." not in host or host.endswith((".local", ".internal", ".localhost")):
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        return True


def text_of(obj, key, limit):
    return obj[key].strip()[:limit] if isinstance(obj.get(key), str) else ""


def number_of(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0 else None


def valid_plan(obj, q):
    """The model's plan is untrusted: keep known sites, or named sites with a public https search URL."""
    obj = obj if isinstance(obj, dict) else {}
    searches, seen = [], set()
    for s in obj.get("searches") if isinstance(obj.get("searches"), list) else []:
        if not isinstance(s, dict) or not isinstance(s.get("site"), str) or not text_of(s, "query", 81) or len(s["query"].strip()) > 80:
            continue
        site, query = s["site"], s["query"].strip()
        if site in SITES:
            country, kind, url = SITES[site][0], SITES[site][1], site_url(site, query)
        elif public_https(str(s.get("url") or "")):
            url = s["url"]
            site = (urllib.parse.urlsplit(url).hostname or "").removeprefix("www.")[:40]
            c = str(s.get("country") or "").upper()
            country, kind = (c if len(c) == 2 and c.isascii() and c.isalpha() else ""), "mixed"
        else:
            continue
        if site not in seen:
            seen.add(site)
            searches.append({"site": site, "query": query, "country": country, "kind": kind, "url": url})
    return {"thinking": text_of(obj, "thinking", 400), "product": text_of(obj, "product", 60) or q[:60],
            "condition": obj.get("condition") if obj.get("condition") in CONDITIONS else "any",
            "max_price_eur": number_of(obj.get("max_price_eur")), "delivery": text_of(obj, "delivery", 120),
            "searches": searches[:N_SITES]}


def valid_offers(raw, s):
    """Scraped data is untrusted: keep offers with a title, a positive price and https links. s = one planned search."""
    out = []
    for o in raw if isinstance(raw, list) else []:
        if not isinstance(o, dict):
            continue
        title, price = text_of(o, "title", 120), number_of(o.get("price"))
        url = urllib.parse.urljoin(s["url"], str(o.get("listingUrl") or ""))
        image = urllib.parse.urljoin(s["url"], str(o.get("imageUrl") or ""))
        if not title or price is None or not public_https(url) or not public_https(image) or "\u2026" in url + image:
            continue
        cur = str(o.get("currency") or "").upper()
        cur = cur if len(cur) == 3 and cur.isascii() and cur.isalpha() else "EUR"
        cond = text_of(o, "condition", 20).lower()
        out.append({"title": title, "price": price, "currency": cur,
                    "eur": round(price * RATES_EUR[cur]) if cur in RATES_EUR else None,
                    "url": url, "image": image, "location": text_of(o, "location", 80), "delivery": text_of(o, "delivery", 100),
                    "site": s["site"], "country": s["country"], "kind": cond if cond in CONDITIONS else s["kind"]})
    return out[:MAX_OFFERS]


MD_LINK = re.compile(r"!?\[([^\]]*)\]\([^)]*\)")  # [text](url) -> text
RAW_TASTE = 900      # characters of raw page text sent to the browser per site
LINKED_IMAGE = re.compile(r"\[!\[[^\]]*\]\((https://[^)\s]+)\)[^\]]*\]\((https?://[^)\s]+)\)")


def fix_images(raw, markdown, base):
    """The extractor sometimes returns the listing link, or a cut-off link, as the photo. The page's own markdown
    has each photo wrapped in its listing link, so take the photo from there when the listing matches."""
    by_path = {}
    for img, link in LINKED_IMAGE.findall(markdown if isinstance(markdown, str) else ""):
        by_path.setdefault(urllib.parse.urlsplit(link).path, img)
    out = []
    for o in raw if isinstance(raw, list) else []:
        if isinstance(o, dict):
            path = urllib.parse.urlsplit(urllib.parse.urljoin(base, str(o.get("listingUrl") or ""))).path
            image = str(o.get("imageUrl") or "")
            ipath = urllib.parse.urlsplit(urllib.parse.urljoin(base, image)).path
            bad = not image or "\u2026" in image or ipath == path or ipath.endswith((".html", ".htm"))
            o = {**o, "imageUrl": by_path.get(path, "")} if bad else o  # no photo at all drops the offer: the wall is photos
        out.append(o)
    return out


def valid_advice(obj, ids):
    obj = obj if isinstance(obj, dict) else {}
    hide = [i for i in obj.get("hide") if i in ids] if isinstance(obj.get("hide"), list) else []
    best = obj.get("best") if obj.get("best") in ids and obj.get("best") not in hide else None
    return {"say": text_of(obj, "say", 400), "best": best, "hide": hide, "search": text_of(obj, "search", 200)}


def chat_offers(raw):
    """Offers come back from the browser for follow-up questions: keep only plain, short fields."""
    out = []
    for o in raw if isinstance(raw, list) else []:
        if isinstance(o, dict) and text_of(o, "id", 8) and text_of(o, "title", 120) and number_of(o.get("price")) is not None:
            out.append({"id": text_of(o, "id", 8), "title": text_of(o, "title", 120), "price": o["price"], "eur": number_of(o.get("eur")),
                        **{k: text_of(o, k, 100) for k in ("currency", "kind", "site", "country", "delivery", "location")}})
    return out[:MAX_CHAT_OFFERS]


def deepseek_key(env):
    key = os.environ.get("DEEPSEEK_API_KEY") or env.get("DEEPSEEK_API_KEY")
    if key:
        return key
    try:
        return open(agora.DEEPSEEK_KEY_FILE).read().strip()
    except OSError:
        raise RuntimeError(f"No DeepSeek key: set DEEPSEEK_API_KEY in .env or put it in {agora.DEEPSEEK_KEY_FILE}")


TALK_SYSTEM = (
    "You are Agora's shopping assistant: you help people buy second-hand, refurbished and new goods across European marketplaces. "
    "Have a normal, friendly conversation in plain text (no markdown, no lists unless asked), in the user's language, short answers. "
    "Give real advice: what to look for, fair prices, risks, which of the offers on screen fits. Only name offers that are in the list "
    "you are given. When the user wants you to look for something and you know enough, end your reply with one last line "
    "'SEARCH: <the whole request in one line>' and the site will offer to run it. Never write that line otherwise."
)
MAX_TURNS, MAX_TURN_CHARS = 20, 1000
BRAIN_TURNS = 60  # the voice guide sends the whole talk as it was heard and spoken: short lines, about 30 exchanges


def valid_turns(raw, limit=MAX_TURNS):
    """The conversation comes back from the browser: keep the last short user/assistant turns only."""
    turns = [{"role": t["role"], "content": t["content"].strip()[:MAX_TURN_CHARS]} for t in (raw if isinstance(raw, list) else [])
             if isinstance(t, dict) and t.get("role") in ("user", "assistant") and isinstance(t.get("content"), str) and t["content"].strip()]
    return turns[-limit:]


def talk(env, q, turns, offers, emit):
    """The AI assistant: an ordinary conversation, streamed token by token as 'think' events with src 'talk'."""
    seen = ("\n\nOffers on the user's screen right now:\n" + "\n".join(json.dumps(o, ensure_ascii=False) for o in offers)) if offers else ""
    deepseek_stream(env, [{"role": "system", "content": TALK_SYSTEM + seen}, *turns, {"role": "user", "content": q}], emit, "talk", False, False)
    emit({"type": "done"})


def deepseek_json(env, system, user, emit, src, think=True):
    """One JSON-mode completion. think=False turns the model's reasoning off: about 1 s instead of 5-10 s."""
    try:
        return json.loads(deepseek_stream(env, [{"role": "system", "content": system}, {"role": "user", "content": user}], emit, src, think, True))
    except ValueError:
        raise RuntimeError("DeepSeek did not return JSON")


def deepseek_stream(env, messages, emit, src, think, as_json):
    """One streamed completion. Every token is emitted as it arrives, so the page shows the model working. Returns the text."""
    req = urllib.request.Request(
        DEEPSEEK_URL, headers={"Content-Type": "application/json", "Authorization": "Bearer " + deepseek_key(env)},
        data=json.dumps({"model": agora.DEEPSEEK_MODEL, "stream": True, **({"response_format": {"type": "json_object"}} if as_json else {}),
                         **({} if think else {"thinking": {"type": "disabled"}}), "messages": messages}).encode())
    text = []
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            for raw in r:
                line = raw.decode("utf-8", "replace").strip()
                if not line.startswith("data:") or line.endswith("[DONE]"):
                    continue
                try:
                    delta = (json.loads(line[5:]).get("choices") or [{}])[0].get("delta") or {}
                except ValueError:
                    continue
                for key in ("reasoning_content", "content"):
                    if delta.get(key):
                        emit({"type": "think", "src": src, "delta": delta[key]})
                if delta.get("content"):
                    text.append(delta["content"])
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"DeepSeek HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:160]}")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise RuntimeError(f"DeepSeek unreachable: {e}")
    return "".join(text)


def valid_ready(obj, q):
    """What the bar agent understood. Untrusted (model output, and sent back by the browser): only short plain fields pass."""
    obj = obj if isinstance(obj, dict) else {}
    raw = obj.get("queries") if isinstance(obj.get("queries"), list) else []
    queries = [x.strip()[:80] for x in raw if isinstance(x, str) and x.strip()][:N_QUERIES]
    return {"say": text_of(obj, "say", 160), "request": text_of(obj, "request", 200) or q[:200], "product": text_of(obj, "product", 60) or q[:60],
            "condition": obj.get("condition") if obj.get("condition") in CONDITIONS else "any",
            "max_price_eur": number_of(obj.get("max_price_eur")), "delivery": text_of(obj, "delivery", 120),
            "queries": queries or [q[:70] + " for sale", q[:70] + " gebraucht kaufen"]}


def bar_agent(env, q, about, emit=lambda e: None):
    """The agent in the search bar: one fast call (reasoning off, about 1 s) that says what it understood and how it will search."""
    user = q + (f"\n\nWhat we know about this user (use it only when it fits): {about}" if about else "")
    try:
        return valid_ready(deepseek_json(env, BAR_SYSTEM, user, emit, "plan", think=False), q)
    except RuntimeError as e:
        print(f"bar agent failed: {e}", flush=True)
        return valid_ready({}, q)


def pick_pages(found, queries, kind):
    """found = one result list per query, from Context.dev Search. One page per site, best ranks first, alternating between the queries."""
    out, seen = [], set()
    for rank in range(max((len(r) for r in found), default=0)):
        for qi, results in enumerate(found):
            r = results[rank] if rank < len(results) else None
            url = r.get("url") if isinstance(r, dict) else None
            if not isinstance(url, str) or not public_https(url):
                continue
            host = (urllib.parse.urlsplit(url).hostname or "").removeprefix("www.")
            if host in seen or any(host == d or host.endswith("." + d) for d in SKIP_DOMAINS):
                continue
            seen.add(host)
            out.append({"site": host[:40], "query": queries[qi], "country": TLD_COUNTRY.get(host.rsplit(".", 1)[-1], ""), "kind": kind, "url": url})
    return out[:N_SITES]


def web_search(env, query):
    """One Context.dev web search. Returns (results, credits, status)."""
    status, j = agora.post_json("https://api.context.dev/v1/web/search",
                                {"query": query, "numResults": 15, "descriptionMaxCharacters": 60, "tags": ["agora-wall"]},
                                {"Authorization": "Bearer " + env["CONTEXT_DEV_API_KEY"]}, 30)
    j = j if isinstance(j, dict) else {}
    meta = j.get("key_metadata") if isinstance(j.get("key_metadata"), dict) else {}
    return (j.get("results") if isinstance(j.get("results"), list) else []), meta.get("credits_consumed") or 0, status


def read_site(env, s, p):
    """One Context.dev read with schema extraction. s = one planned search, p = the plan. Returns (offers, log)."""
    only = "" if p["condition"] == "any" else f" Only {p['condition']} items."
    t = time.time()
    status, j = agora.post_json(
        "https://api.context.dev/v1/web/scrape",
        {"url": s["url"], "formats": {"json": True, "markdown": True}, "markdownParams": {"includeImages": True}, "maxAgeMs": 0, **({"sharedParams": {"country": s["country"]}} if s["country"] else {}),
         "jsonParams": {"schema": OFFER_SCHEMA, "instructions":
                        f"List up to {MAX_OFFERS} for-sale listings from the search results that are the product itself: "
                        f"'{p['product']}'.{only} Skip accessories, spare parts, wanted ads and adverts."},
         "timeoutOpts": {"milliseconds": READ_TIMEOUT_MS, "behavior": "fail"}, "tags": ["agora-wall"]},
        {"Authorization": "Bearer " + env["CONTEXT_DEV_API_KEY"]}, READ_TIMEOUT_MS / 1000 + 15)
    j = j if isinstance(j, dict) else {}
    out = j.get("json") if isinstance(j.get("json"), dict) else {}
    md = j.get("markdown") if isinstance(j.get("markdown"), dict) else {}
    offers = valid_offers(fix_images((out.get("data") or {}).get("offers") if isinstance(out.get("data"), dict) else None, md.get("data"), s["url"]), s)
    meta = j.get("key_metadata") if isinstance(j.get("key_metadata"), dict) else {}
    log = {"site": s["site"], "secs": round(time.time() - t, 1), "status": status, "n": len(offers), "ok": bool(offers),
           "credits": meta.get("credits_consumed"), "credits_left": meta.get("credits_remaining")}
    page = md.get("data") if isinstance(md.get("data"), str) else ""
    log["chars"] = len(page)  # what the browser shows as "the mess": how much page went in, and a taste of it
    log["raw"] = " ".join(MD_LINK.sub(r"\1", page).split())[:RAW_TASTE]
    if not offers:
        reason = "rate limit: 10 reads/min on this key" if status == 429 else (
            j.get("message") or out.get("message") or ("no matching listings" if status == 200 else f"HTTP {status}"))
        log["note"] = str(reason)[:160]
    return offers, log


def advise(env, request, offers, emit, src):
    """DeepSeek looks at the offers on screen and picks one. Returns advice, or None with an error event."""
    brief = [{k: o.get(k) for k in ("id", "title", "price", "currency", "eur", "kind", "site", "country", "delivery", "location")} for o in offers]
    try:
        raw = deepseek_json(env, ADVISE_SYSTEM, request + "\n\nOffers:\n" + "\n".join(json.dumps(b, ensure_ascii=False) for b in brief), emit, src)
    except RuntimeError as e:
        emit({"type": "error", "text": f"the agent could not judge the offers: {e}"})
        return None
    advice = valid_advice(raw, {o["id"] for o in offers})
    emit({"type": "agent", **advice})
    return advice


def valid_brain(obj, ids, q, found=False):
    """What the guide's brain decided. Untrusted model output: a known action, short text, only ids of offers we sent."""
    obj = obj if isinstance(obj, dict) else {}
    action = "answer" if found or obj.get("action") not in BRAIN_ACTIONS else obj["action"]
    show = {}  # id -> why, in the model's order, each offer once
    for s in obj.get("show") if isinstance(obj.get("show"), list) else []:
        if isinstance(s, dict) and s.get("id") in ids:
            show.setdefault(s["id"], text_of(s, "why", 60))
    return {"action": action, "request": (text_of(obj, "request", 200) or q[:200]) if action == "search" else "",
            "say": text_of(obj, "say", 400),
            "show": [{"id": i, "why": w} for i, w in show.items()][:MAX_SHOW] if action == "answer" else []}


def brain(env, q, turns, offers, busy, found):
    """The guide's brain: one fast call (reasoning off) that turns what the user said, or a search that just finished
    (found), into the next move: search, answer from the loaded offers, or ask. Raises RuntimeError when DeepSeek fails."""
    said = "\n".join(f"{t['role']}: {t['content']}" for t in turns) or "(nothing yet)"
    listed = "\n".join(json.dumps(o, ensure_ascii=False) for o in offers) or "(none)"
    now = f'The search for "{q}" just finished. Choose the offers that fit and tell the user.' if found else f"The user just said: {q}"
    user = f"Conversation so far:\n{said}\n\nA search is running: {'yes' if busy else 'no'}\n\nOffers loaded:\n{listed}\n\n{now}"
    return valid_brain(deepseek_json(env, BRAIN_SYSTEM, user, lambda e: None, "brain", think=False), {o["id"] for o in offers}, q, found)


def search(env, q, emit, ready=None, about="", pick=True):
    """The whole pipeline for one request. Returns {plan, offers, pick} (the MCP tool returns this).
    ready = what the bar agent already worked out in the browser; without it the agent is asked first."""
    p = valid_ready(ready, q) if ready else bar_agent(env, q, about, emit)
    kind = p["condition"] if p["condition"] != "any" else ""
    emit({"type": "plan", **p})
    emit({"type": "find_start", "queries": p["queries"]})
    t = time.time()
    with ThreadPoolExecutor(len(p["queries"])) as ex:
        got = list(ex.map(lambda x: web_search(env, x), p["queries"]))
    pages = pick_pages([g[0] for g in got], p["queries"], kind)
    found = len(pages)
    if found < MIN_FOUND:  # the web search came back thin (or hit the request limit): read the marketplaces we know
        known = valid_plan({"searches": [{"site": s, "query": p["product"]} for s in FALLBACK_SITES]}, q)["searches"]
        pages = (pages + known)[:N_SITES]
    emit({"type": "find_done", "n": found, "added": len(pages) - found, "secs": round(time.time() - t, 1),
          "credits": sum(g[1] for g in got), "limit": any(g[2] == 429 for g in got)})
    offers = []
    for s in pages:
        emit({"type": "read_start", **s})
    with ThreadPoolExecutor(max(len(pages), 1)) as ex:
        for f in as_completed([ex.submit(read_site, env, s, p) for s in pages]):
            got_offers, log = f.result()
            emit({"type": "read_done", **log})
            for o in got_offers:
                o["id"] = f"o{len(offers) + 1}"
                offers.append(o)
                ALLOWED_IMAGES.add(o["image"])
                emit({"type": "offer", **o})
    pick = advise(env, p["request"], offers, emit, "pick") if offers and pick else None  # regular search: no opinion asked for
    emit({"type": "done"})
    return {"plan": p, "offers": offers, "pick": pick}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None  # a redirect could point the proxy at a private address


IMAGE_OPENER = urllib.request.build_opener(NoRedirect)


def fetch_image(url):
    """Returns (content_type, bytes) of a listing photo."""
    # ponytail: host is checked by name only; resolve and check the IP if this ever leaves localhost
    if url not in ALLOWED_IMAGES or not public_https(url):
        raise ValueError("not an image from this search")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (agora-wall)", "Accept": "image/*"})
    with IMAGE_OPENER.open(req, timeout=PHOTO_TIMEOUT_S) as r:
        ctype = r.headers.get_content_type()
        data = r.read(MAX_IMAGE_BYTES + 1)
    if not ctype.startswith("image/") or len(data) > MAX_IMAGE_BYTES:
        raise ValueError(f"not a usable image ({ctype}, {len(data)} bytes)")
    return ctype, data


def build_cutout():
    """Compiles cutout.m when missing or stale. Returns True when the cutout tool is usable."""
    if sys.platform != "darwin" or not os.path.exists(CUTOUT_SRC):
        return False
    if os.path.exists(CUTOUT_BIN) and os.path.getmtime(CUTOUT_BIN) >= os.path.getmtime(CUTOUT_SRC):
        return True
    done = subprocess.run(["/usr/bin/clang", "-fobjc-arc", "-O2", CUTOUT_SRC, "-o", CUTOUT_BIN] +
                          [a for f in ("Foundation", "Vision", "CoreImage", "CoreVideo", "CoreGraphics") for a in ("-framework", f)],
                          capture_output=True, text=True)
    if done.returncode:
        print("cutout tool did not compile, showing photos as they are:\n" + done.stderr[-600:], flush=True)
    return done.returncode == 0


WARM_LOCK = threading.Lock()
LAST_CUT = [0.0]  # when a cutout last finished


def warm_cutout():
    """Wakes the cutout engine with one run on its own when it has been idle. Everyone else waits on the lock meanwhile,
    so the photos of a new search never start cold side by side."""
    with WARM_LOCK:
        if time.time() - LAST_CUT[0] < WARM_AFTER_S:
            return
        sample = next(iter(sorted(glob.glob(os.path.join(agora.HERE, "shelf", "*.png")))), None)
        if sample:
            t = time.time()
            with tempfile.TemporaryDirectory() as d:
                try:
                    subprocess.run([CUTOUT_BIN, sample, os.path.join(d, "warm.png")], capture_output=True, timeout=WARM_TIMEOUT_S)
                except (subprocess.TimeoutExpired, OSError) as e:
                    print(f"cutout warm-up failed: {e}", flush=True)
            print(f"cutout engine warmed in {time.time() - t:.1f}s", flush=True)
        LAST_CUT[0] = time.time()


def cut_image(url, can_cut):
    """Returns (content_type, bytes): the object as a cropped transparent PNG, or the photo itself if lifting fails."""
    if url in CUTS:
        return CUTS[url]
    t = time.time()
    ctype, data = fetch_image(url)
    got, size = time.time(), len(data)
    if can_cut:
        warm_cutout()
        with tempfile.TemporaryDirectory() as d:
            src, out = os.path.join(d, "photo"), os.path.join(d, "cut.png")
            with open(src, "wb") as f:
                f.write(data)
            done = None
            try:
                done = subprocess.run([CUTOUT_BIN, src, out], capture_output=True, text=True, timeout=CUTOUT_TIMEOUT_S)
            except (subprocess.TimeoutExpired, OSError) as e:
                print(f"cutout failed for {url[:100]}: {str(e)[-40:]}", flush=True)
                if STUCK_DIR:  # keep the bytes that got stuck, to run the tool on them by hand
                    os.makedirs(STUCK_DIR, exist_ok=True)
                    shutil.copy(src, os.path.join(STUCK_DIR, f"{time.time():.3f}"))
            if done and done.returncode == 0:
                with open(out, "rb") as f:
                    ctype, data = "image/png", f.read()
            elif done:  # 2 = no object found; anything else is a real failure worth a log line
                print(f"cutout exit {done.returncode} for {url[:100]} {done.stderr.strip()[:200]}", flush=True)
            LAST_CUT[0] = time.time()
    if time.time() - t > SLOW_PHOTO_S:
        print(f"slow photo: download {got - t:.1f}s ({size // 1024} KB), cutout {time.time() - got:.1f}s ({len(data) // 1024} KB) {url[:90]}", flush=True)
    CUTS[url] = (ctype, data)
    return CUTS[url]


CUT_POOL = ThreadPoolExecutor(6)  # ponytail: 6 cutouts at a time (8 cores here), first found first cut
CUT_JOBS = {}  # photo URL -> Future. ponytail: never emptied, same ceiling as CUTS
CUT_LOCK = threading.Lock()


def cut_soon(url, can_cut):
    """Starts lifting a photo in the background (once per URL) and returns its Future. Called when an offer is found,
    so the cutout is usually ready before the browser asks for it."""
    with CUT_LOCK:
        job = CUT_JOBS.get(url)
        if job is None or (job.done() and job.exception()):  # a failed photo gets another try when asked again
            job = CUT_JOBS[url] = CUT_POOL.submit(cut_image, url, can_cut)
        return job


def mcp_reply(env, msg):
    """Minimal MCP over HTTP (JSON-RPC, one message per POST). Returns the reply dict, or None for a notification."""
    if not isinstance(msg, dict) or not isinstance(msg.get("method"), str):
        return {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Send one JSON-RPC message per request"}}
    mid, method = msg.get("id"), msg["method"]
    params = msg.get("params") if isinstance(msg.get("params"), dict) else {}
    if mid is None:
        return None
    if method == "initialize":
        result = {"protocolVersion": params.get("protocolVersion") if isinstance(params.get("protocolVersion"), str) else "2025-06-18",
                  "capabilities": {"tools": {}}, "serverInfo": {"name": "agora", "version": "0.1"}}
    elif method == "ping":
        result = {}
    elif method == "tools/list":
        result = {"tools": [MCP_TOOL]}
    elif method == "tools/call":
        request = (params.get("arguments") or {}).get("request") if isinstance(params.get("arguments"), dict) else None
        if params.get("name") != MCP_TOOL["name"] or not isinstance(request, str) or not request.strip() or len(request) > 300:
            return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32602, "message": 'Call find_offers with {"request": "<what to buy>"} (max 300 characters)'}}
        try:
            found = search(env, request.strip(), lambda e: None)
            result = {"content": [{"type": "text", "text": json.dumps(found, ensure_ascii=False)}], "isError": False}
        except Exception as e:  # a tool failure is a result the calling agent can read, not a protocol error
            print(f"mcp search failed: {e!r}", flush=True)
            result = {"content": [{"type": "text", "text": "Search failed: " + str(e)[:200]}], "isError": True}
    else:
        return {"jsonrpc": "2.0", "id": mid, "error": {"code": -32601, "message": f"Unknown method {method}"}}
    return {"jsonrpc": "2.0", "id": mid, "result": result}


class Handler(BaseHTTPRequestHandler):
    env = {}
    can_cut = False

    def send_bytes(self, status, ctype, body, cache="no-store"):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self.end_headers()
        self.wfile.write(body)

    def say(self, status, text):
        self.send_bytes(status, "text/plain; charset=utf-8", text.encode())

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path)
        if path.path == "/":
            try:
                with open(os.path.join(agora.HERE, "wall.html"), "rb") as f:
                    return self.send_bytes(200, "text/html; charset=utf-8", f.read())
            except OSError as e:
                print(f"wall.html unreadable: {e}", flush=True)
                return self.say(500, "wall.html is missing next to wall.py")
        if path.path.startswith("/shelf/"):  # start-screen products harvested by shelf.py
            name = path.path[len("/shelf/"):]
            if not re.fullmatch(r"[\w-]+\.(png|json)", name):
                return self.say(404, "Not found")
            try:
                with open(os.path.join(agora.HERE, "shelf", name), "rb") as f:
                    return self.send_bytes(200, "image/png" if name.endswith(".png") else "application/json", f.read())
            except OSError:
                return self.say(404, "Not found")
        if path.path.startswith("/web/"):  # Albert's price line (web/: his line.js, core.js, flags.js, line.css, marks, flags)
            name = path.path[len("/web/"):]
            if not re.fullmatch(r"js/[\w-]+\.js|css/[\w-]+\.css|assets/[\w-]+\.(svg|json)|assets/flags/[a-z]{2}\.svg|assets/shelf/[\w-]+\.png", name):
                return self.say(404, "Not found")
            kind = {"js": "text/javascript", "css": "text/css", "svg": "image/svg+xml", "json": "application/json", "png": "image/png"}[name.rsplit(".", 1)[1]]
            try:
                with open(os.path.join(agora.HERE, "web", *name.split("/")), "rb") as f:
                    return self.send_bytes(200, kind if kind == "image/png" else kind + "; charset=utf-8", f.read())
            except OSError:
                return self.say(404, "Not found")
        if path.path == "/cut":
            url = (urllib.parse.parse_qs(path.query).get("u") or [""])[0]
            try:
                ctype, data = cut_soon(url, self.can_cut).result()
            except (ValueError, urllib.error.URLError, TimeoutError, OSError) as e:
                print(f"photo failed: {url[:120]} {e}", flush=True)
                return self.say(502, "Could not load this photo")
            return self.send_bytes(200, ctype, data, "private, max-age=3600")
        self.say(404, "Not found")

    def stream(self, work):
        """Runs work(emit); each event goes to the browser as one JSON line."""
        self.send_response(200)  # HTTP/1.0 response without length: lines stream until we close
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

        def emit(event):
            if event.get("type") != "think":
                print(json.dumps(event, ensure_ascii=False)[:200], flush=True)
            if event.get("type") == "plan" and self.can_cut:
                CUT_POOL.submit(warm_cutout)  # the sites take seconds to answer: wake the cutout engine meanwhile
            if event.get("type") == "offer":
                cut_soon(event["image"], self.can_cut)  # head start: lift the photo while the card is still on its way
            try:
                self.wfile.write((json.dumps(event) + "\n").encode())
                self.wfile.flush()
            except OSError:
                pass  # browser went away; keep the server log

        try:
            work(emit)
        except Exception as e:  # report every failure to the user instead of a dead page
            print(f"request failed: {e!r}", flush=True)
            emit({"type": "error", "text": "something broke: " + str(e)[:160]})

    def do_POST(self):
        # Other websites must not spend our credits through the visitor's browser.
        origin = self.headers.get("Origin")
        if origin and urllib.parse.urlsplit(origin).hostname not in ("localhost", "127.0.0.1"):
            return self.say(403, "Requests from other sites are not allowed")
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(min(n, 200_000)) or b"{}")
        except ValueError:
            return self.say(400, "Body must be JSON")
        if self.path == "/mcp":
            reply = mcp_reply(self.env, body)
            return self.send_bytes(202, "application/json", b"") if reply is None else \
                self.send_bytes(200, "application/json", json.dumps(reply).encode())
        q = body.get("q") if isinstance(body, dict) else None
        if not isinstance(q, str) or not q.strip() or len(q) > 300:
            return self.say(400, 'Send {"q": "what you want"} (max 300 characters)')
        about = text_of(body, "about", MAX_ABOUT)
        if self.path == "/search":
            ready = body.get("ready") if isinstance(body.get("ready"), dict) else None
            return self.stream(lambda emit: search(self.env, q.strip(), emit, ready, about, body.get("pick") is not False))
        if self.path == "/agent":
            return self.send_bytes(200, "application/json", json.dumps(bar_agent(self.env, q.strip(), about)).encode())
        if self.path == "/chat":
            turns, offers = valid_turns(body.get("messages")), chat_offers(body.get("offers"))
            return self.stream(lambda emit: talk(self.env, q.strip(), turns, offers, emit))
        if self.path == "/brain":  # the voice guide (guide/): what to do with what the user just said
            turns, offers = valid_turns(body.get("messages"), BRAIN_TURNS), chat_offers(body.get("offers"))
            try:
                move = brain(self.env, q.strip(), turns, offers, body.get("busy") is True, body.get("event") == "found")
            except RuntimeError as e:
                print(f"brain failed: {e}", flush=True)
                return self.say(502, "The guide's brain did not answer")
            print("brain " + json.dumps(move, ensure_ascii=False)[:200], flush=True)
            return self.send_bytes(200, "application/json", json.dumps(move).encode())
        self.say(404, "Not found")

    def log_message(self, *a):
        pass


def check():
    p = valid_plan({"thinking": "t", "product": " Espresso machine ", "condition": "used", "max_price_eur": 200, "delivery": None,
                    "searches": [{"site": "tori", "query": " kahvinkeitin "}, {"site": "tori", "query": "x"}, {"site": "nope", "query": "x"},
                                 {"site": "vinted", "query": ""}, "junk",
                                 {"site": "catawiki", "country": "nl", "url": "https://www.catawiki.com/en/s?q=espresso", "query": "espresso"},
                                 {"site": "evil", "url": "http://10.0.0.1/s?q=x", "query": "x"}]}, "q")
    assert [s["site"] for s in p["searches"]] == ["tori", "catawiki.com"], p["searches"]
    assert p["searches"][0]["url"].endswith("q=kahvinkeitin") and p["searches"][1]["country"] == "NL"
    assert (p["product"], p["condition"], p["max_price_eur"], p["delivery"]) == ("Espresso machine", "used", 200, "")
    empty = valid_plan("junk", "a request")
    assert empty["searches"] == [] and empty["product"] == "a request" and empty["condition"] == "any" and empty["max_price_eur"] is None
    assert len(valid_plan({"searches": [{"site": s, "query": "x"} for s in SITES]}, "q")["searches"]) == N_SITES
    assert all(s in SITES for s in FALLBACK_SITES)
    assert valid_turns([{"role": "user", "content": " hi "}, {"role": "system", "content": "x"}, {"role": "assistant", "content": 5}, "junk"]) == [{"role": "user", "content": "hi"}]
    assert valid_turns("junk") == [] and len(valid_turns([{"role": "user", "content": "a" * 5000}] * 50)) == MAX_TURNS
    assert len(valid_turns([{"role": "user", "content": "a"}] * 99, BRAIN_TURNS)) == BRAIN_TURNS
    r = valid_ready({"say": "s", "request": "", "condition": "weird", "max_price_eur": "9", "queries": [" a ", 7, "", "b", "c"]}, "vw polo")
    assert (r["request"], r["condition"], r["max_price_eur"], r["queries"]) == ("vw polo", "any", None, ["a", "b"])
    assert valid_ready("junk", "vw polo")["queries"] == ["vw polo for sale", "vw polo gebraucht kaufen"]
    found = [[{"url": "https://www.autoscout24.de/lst/vw/polo"}, {"url": "https://www.facebook.com/marketplace/x"}, {"url": "https://www.autoscout24.de/other"}, 7],
             [{"url": "https://www.marktplaats.nl/l/auto-s/volkswagen/"}, {"url": "http://insecure.nl/x"}, {"url": "https://m.facebook.com/x"}, {"url": "https://reverb.com/c"}]]
    pages = pick_pages(found, ["q1", "q2"], "used")
    assert [(x["site"], x["country"], x["query"]) for x in pages] == [("autoscout24.de", "DE", "q1"), ("marktplaats.nl", "NL", "q2"), ("reverb.com", "", "q2")], pages
    assert pick_pages([], [], "") == [] and len(pick_pages([[{"url": f"https://shop{i}.de/x"} for i in range(30)]], ["q"], "")) == N_SITES
    assert site_url("kleinanzeigen", "iphone 15") == "https://www.kleinanzeigen.de/s-iphone-15/k0"
    assert public_https("https://img.tori.net/a.jpg")
    for bad in ("http://img.tori.net/a.jpg", "https://127.0.0.1/a", "https://localhost/a", "https://[::1]/a", "https://x.internal/a", "file:///etc/passwd", ""):
        assert not public_https(bad), bad
    s = {"site": "blocket", "country": "SE", "kind": "used", "url": "https://www.blocket.se/recommerce/forsale/search?q=x"}
    good = {"title": " Dedica ", "price": 1000, "currency": "sek", "listingUrl": "/item/1", "imageUrl": "https://img.b.se/1",
            "location": "Lund", "condition": "Refurbished", "delivery": "Pickup only"}
    got = valid_offers([good, {**good, "price": 0}, {**good, "price": "240"}, {**good, "price": True}, {**good, "imageUrl": "http://10.0.0.1/x"},
                        {**good, "title": ""}, {**good, "condition": "like new"}, 7], s)
    assert len(got) == 2 and got[0]["title"] == "Dedica" and got[0]["currency"] == "SEK" and got[0]["eur"] == 88
    assert got[0]["url"] == "https://www.blocket.se/item/1" and got[0]["kind"] == "refurbished" and got[1]["kind"] == "used"
    assert valid_offers(None, s) == [] and len(valid_offers([good] * 50, s)) == MAX_OFFERS
    assert valid_offers([{**good, "currency": "XAU"}], s)[0]["eur"] is None
    md = "x [![Alt text](https://i.img.se/9.webp) 12 kr](https://www.blocket.se/item/1?ref=a) y [![b](https://i.img.se/8.webp)](https://www.blocket.se/item/2)"
    fixed = fix_images([{**good, "imageUrl": "https://www.blocket.se/item/1"}, {**good, "listingUrl": "/item/3"}, 7], md, s["url"])
    assert fixed[0]["imageUrl"] == "https://i.img.se/9.webp" and fixed[1]["imageUrl"] == good["imageUrl"] and fixed[2] == 7
    assert fix_images([{**good, "listingUrl": "/item/2"}], md, s["url"])[0]["imageUrl"] == good["imageUrl"]
    assert fix_images([{**good, "listingUrl": "/item/9", "imageUrl": "https://www.blocket.se/p/9.html#x"}], md, s["url"])[0]["imageUrl"] == ""
    assert fix_images(None, None, s["url"]) == [] and valid_offers([{**good, "imageUrl": "https://img.b.se/a\u2026"}], s) == []
    a = valid_advice({"say": "x", "best": "o1", "hide": ["o1", "o2", "o9"], "search": None}, {"o1", "o2"})
    assert a == {"say": "x", "best": None, "hide": ["o1", "o2"], "search": ""}
    assert valid_advice({"best": "o2", "hide": "junk"}, {"o1", "o2"})["best"] == "o2" and valid_advice(None, set())["hide"] == []
    c = chat_offers([{"id": "o1", "title": "T", "price": 5, "site": "tori", "evil": "x" * 9999}, {"id": "o2"}, "junk"] + [{"id": "o3", "title": "T", "price": 1}] * 200)
    assert len(c) == MAX_CHAT_OFFERS and "evil" not in c[0] and c[0]["site"] == "tori" and chat_offers(None) == []
    b = valid_brain({"action": "answer", "request": "x", "say": " hi ", "show": [{"id": "o2", "why": "cheap"}, {"id": "o9"}, {"id": "o2"}, "junk", {"id": "o1"}]}, {"o1", "o2"}, "q")
    assert b == {"action": "answer", "request": "", "say": "hi", "show": [{"id": "o2", "why": "cheap"}, {"id": "o1", "why": ""}]}, b
    assert valid_brain({"action": "search", "show": [{"id": "o1"}]}, {"o1"}, "a bike") == {"action": "search", "request": "a bike", "say": "", "show": []}
    assert valid_brain({"action": "search"}, set(), "q", found=True)["action"] == "answer" and valid_brain("junk", set(), "q")["action"] == "answer"
    assert len(valid_brain({"action": "answer", "show": [{"id": f"o{i}"} for i in range(9)]}, {f"o{i}" for i in range(9)}, "q")["show"]) == MAX_SHOW
    try:
        cut_image("https://img.tori.net/not-from-a-search", False)
        raise AssertionError("proxy served an image nobody searched for")
    except ValueError:
        pass
    assert mcp_reply({}, {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26"}})["result"]["protocolVersion"] == "2025-03-26"
    assert mcp_reply({}, {"jsonrpc": "2.0", "id": 2, "method": "tools/list"})["result"]["tools"][0]["name"] == "find_offers"
    assert mcp_reply({}, {"jsonrpc": "2.0", "method": "notifications/initialized"}) is None
    assert mcp_reply({}, {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "find_offers", "arguments": {}}})["error"]["code"] == -32602
    assert mcp_reply({}, {"jsonrpc": "2.0", "id": 4, "method": "nope"})["error"]["code"] == -32601 and mcp_reply({}, [1])["error"]["code"] == -32600
    assert MD_LINK.sub(r"\1", "a [Osta nyt](https://x.fi/1) ![kuva](https://x.fi/a.jpg) b") == "a Osta nyt kuva b"
    first = cut_soon("https://img.tori.net/not-from-a-search", False)
    assert cut_soon("https://img.tori.net/not-from-a-search", False) is first or first.done()  # one job per photo, a failed one may be retried
    assert isinstance(first.exception(timeout=5), ValueError)
    print("check ok")


if __name__ == "__main__":
    if "--check" in sys.argv:
        check()
    else:
        Handler.env = agora.load_env()
        Handler.can_cut = build_cutout()
        print(f"Agora wall on http://localhost:{PORT}  (cutouts {'on' if Handler.can_cut else 'OFF: photos shown as they are'})")
        ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
