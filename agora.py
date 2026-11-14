"""Agora prototype: ask Gemini to find things; it reads European marketplaces live through Context.dev.

Run:  python3 agora.py   then open http://localhost:8000
Check: python3 agora.py --check   (no network; tests the pure helpers)
Needs CONTEXT_DEV_API_KEY and GEMINI_API_KEY in .env next to this file. Stdlib only.
"""
import html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = 8000
MODELS = [m for m in os.environ.get("GEMINI_MODEL", "gemini-3.5-flash,gemini-2.5-flash,gemini-3.8-flash").split(",") if m]
MODEL = MODELS[0]
BUSY = (0, 429, 500, 503)  # timeout or overloaded: try the next model
DEEPSEEK_MODEL = os.environ.get("DEEPSEEK_MODEL", "deepseek-flash")
DEEPSEEK_KEY_FILE = os.path.expanduser("~/.config/deepseek/key")
DEFAULT_LLM = os.environ.get("AGORA_LLM", "deepseek")  # "deepseek" for fast iteration, "gemini" for the demo
MAX_PAGE_CHARS = 40_000  # ponytail: blunt cut of each page; parse listings properly when accuracy matters
MAX_TURNS = 4
SCRAPE_TIMEOUT_MS = 45_000

# Search pages that returned listings in research/platform-tests.md. {q} is the url-encoded query.
SITES = {
    "tori":          ("FI", "used",        "https://www.tori.fi/recommerce/forsale/search?q={q}"),
    "blocket":       ("SE", "used",        "https://www.blocket.se/recommerce/forsale/search?q={q}"),
    "finn":          ("NO", "used",        "https://www.finn.no/recommerce/forsale/search?q={q}"),
    "dba":           ("DK", "used",        "https://www.dba.dk/recommerce/forsale/search?q={q}"),
    "kleinanzeigen": ("DE", "used",        "https://www.kleinanzeigen.de/s-{dash}/k0"),
    "marktplaats":   ("NL", "used",        "https://www.marktplaats.nl/q/{q}/"),
    "2dehands":      ("BE", "used",        "https://www.2dehands.be/q/{q}/"),
    "olx_pl":        ("PL", "used",        "https://www.olx.pl/oferty/q-{dash}/"),
    "vinted":        ("FI", "used",        "https://www.vinted.fi/catalog?search_text={q}"),
    "gumtree":       ("GB", "used",        "https://www.gumtree.com/search?q={q}"),
    "rebuy":         ("DE", "refurbished", "https://www.rebuy.de/kaufen/suchen?q={q}"),
    "backmarket":    ("DE", "refurbished", "https://www.backmarket.de/de-de/search?q={q}"),
    "amazon_de":     ("DE", "new",         "https://www.amazon.de/s?k={q}"),
    "verkkokauppa":  ("FI", "new",         "https://www.verkkokauppa.com/fi/search?query={q}"),
    "power_fi":      ("FI", "new",         "https://www.power.fi/haku/?q={q}"),
    "cdiscount":     ("FR", "new",         "https://www.cdiscount.com/search/10/{q}.html"),
    "idealo":        ("DE", "comparison",  "https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q={q}"),
    "pricerunner":   ("SE", "comparison",  "https://www.pricerunner.se/results?q={q}"),
}

SYSTEM = (
    "You are Agora, a friendly shopping agent for Europe, in a chat. Decide each turn whether to search. "
    "SEARCH when the user wants to find, compare, price or buy a product, or refines an earlier search (cheaper, other brand, closer, 'more like the second one'). "
    "DO NOT SEARCH for greetings, small talk, questions about you, general advice ('what should I look for in an espresso machine?'), "
    "or questions about listings you already showed: just reply in a few sentences. "
    "If a buying request is too vague to search well (no product type, or a need where one answer changes everything), ask ONE short question instead; "
    "if you can make a sensible assumption, search and state the assumption. "
    "Never quote prices or offers from memory: they must come from search_marketplace. "
    "When you search, call it for 3 to 5 sites in ONE turn (the API allows about 8 page reads per minute), mixing used, refurbished and new. "
    "Write each query in the site's own language (e.g. 'koffiemachine' on marktplaats, 'kahvinkeitin' on tori). "
    "Then call show_listings ONCE with 10 to 18 real offers of the product itself, cheapest first. Skip accessories, repair services, "
    "wanted ads and auctions with only a start bid. search_marketplace returns either a list of offers already cut from the page, or the raw page text. Copy each url exactly as given; never invent or shorten one. "
    "Write title, condition and why in the user's language. Say in verdict which one you would buy and why, and name any site that failed.\n"
    "PERSONALIZATION. The message may start with a saved profile and browser hints. Rules:\n"
    "1. Shopping for themselves: use the profile to choose sites (their country first), filter (sizes, devices they own, brands they avoid) "
    "and rank (pickup distance, condition tolerance, budget habits).\n"
    "2. Shopping for someone else (gift, 'for my mum / friend / son'): ignore the profile's tastes, sizes and devices; keep only location.\n"
    "3. Anything said in this message beats the profile, for this search only.\n"
    "4. When the user states a lasting fact about themselves (home city, sizes, devices owned, brands loved or avoided, pickup vs shipping, "
    "how worn an item may be), call remember with it, in the same turn as the searches. Do not remember one-off limits such as today's budget, "
    "facts about other people, guesses, or sensitive topics (health, religion, politics, money trouble).\n"
    "5. In show_listings.personalized_by list exactly the profile facts or hints you used; leave it empty if none applied.\n"
    "Sites: " + ", ".join(f"{k} ({v[0]}, {v[1]})" for k, v in SITES.items())
)

TOOLS = [{"functionDeclarations": [
    {"name": "search_marketplace",
     "description": "Read one marketplace's live search results page for a query. Returns the page as text.",
     "parameters": {"type": "object", "required": ["site", "query"], "properties": {
         "site": {"type": "string", "enum": list(SITES)},
         "query": {"type": "string", "description": "Search words in the site's language"}}}},
    {"name": "show_listings",
     "description": "Show the final offers to the user as cards. Call once, after the pages are read. Ends the turn.",
     "parameters": {"type": "object", "required": ["listings", "verdict", "personalized_by"], "properties": {
         "listings": {"type": "array", "items": {"type": "object", "required": ["title", "price", "currency", "site", "url"], "properties": {
             "title": {"type": "string"}, "price": {"type": "number"}, "currency": {"type": "string", "description": "ISO code, e.g. EUR"},
             "condition": {"type": "string"}, "location": {"type": "string"},
             "site": {"type": "string", "enum": list(SITES)},
             "url": {"type": "string", "description": "Listing link copied exactly from the page text"},
             "why": {"type": "string", "description": "One short reason this fits the user"}}}},
         "verdict": {"type": "string"},
         "personalized_by": {"type": "array", "items": {"type": "string"}}}}},
    {"name": "remember",
     "description": "Save one lasting fact the user stated about themselves, to personalize later searches.",
     "parameters": {"type": "object", "required": ["fact"], "properties": {"fact": {"type": "string", "description": "Short, e.g. 'Lives in Helsinki'"}}}},
]}]
# Where a listing's own link sits on each site's search page; None = no splitter yet, the model reads the page text instead.
LISTING_URL = {'tori': '/recommerce/forsale/item/\\d+', 'blocket': '/recommerce/forsale/item/\\d+', 'finn': '/recommerce/forsale/item/\\d+', 'dba': '/recommerce/forsale/item/\\d+', 'kleinanzeigen': '/s-anzeige/', 'marktplaats': '/v/', '2dehands': '/v/', 'olx_pl': '/d/oferta/', 'vinted': '/items/\\d+', 'gumtree': '/p/', 'rebuy': None, 'backmarket': '/p/', 'amazon_de': '/dp/\\w+', 'verkkokauppa': '/product/\\d+', 'power_fi': '/p-\\d+', 'cdiscount': '/f-\\d+', 'idealo': 'OffersOfProduct', 'pricerunner': '/pl/'}
PRICE_LAST = ("cdiscount",)  # crossed-out comparison price comes first, the real one last
HEADING_TITLE = ("tori", "blocket", "finn", "dba")  # title is a "## heading", price above it, link below it
CURRENCY = {"SE": "SEK", "NO": "NOK", "DK": "DKK", "PL": "PLN", "GB": "GBP"}  # every other country here pays in EUR
MAX_ROWS = 25
CACHE, CACHE_SECS = {}, 600  # ponytail: plain dict, never pruned; fine for one demo process, use an LRU if this runs for days
LINK = re.compile(r"\[((?:[^\[\]\\]|\\.)*)\]\((https?://[^\s)]+)[^)]*\)")  # backslash only in the second branch, or it backtracks for a minute
_NUM = r"\d{1,3}(?:[ .,\u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?"
# ponytail: "iPhone 15 450 €" on one line would read as 15450; prices sit on their own line on the sites tested
PRICE = re.compile(rf"(?<![\d.,])(?:[€£]\s*({_NUM})|({_NUM})\s*(?:€|EUR\b|kr\b|zł|PLN\b|SEK\b|NOK\b|DKK\b))", re.I)
IMG = re.compile(r'''<(?:img|source)\b[^>]*?\b(?:src|data-src|srcset|data-srcset)=["']([^"' ,]+)''', re.I)
MAX_PROFILE_CHARS = 1500


def load_env():
    env = {}
    with open(os.path.join(HERE, ".env")) as f:
        for line in f:
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.strip().removeprefix("export ").split("=", 1)
                env[k] = v.strip().strip('"').strip("'")
    missing = [k for k in ("CONTEXT_DEV_API_KEY", "GEMINI_API_KEY") if not env.get(k)]
    if missing:
        sys.exit(f"Missing in .env: {', '.join(missing)}")
    return env


def build_url(site, query):
    words = query.strip().split()
    return SITES[site][2].format(q=urllib.parse.quote_plus(query.strip()), dash="-".join(urllib.parse.quote(w) for w in words))


def clean(md):
    md = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", md)       # images
    md = re.sub(r"\n{3,}", "\n\n", md)
    return md[:MAX_PAGE_CHARS]


def post_json(url, body, headers, timeout):
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "User-Agent": "agora/0.1", **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, {"message": raw[:300]}
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        return 0, {"message": str(e)}


def search_marketplace(env, site, query):
    """One Context.dev scrape. Returns (result_for_model, log_event, raw_page_or_None)."""
    if site not in SITES or not isinstance(query, str) or not query.strip():
        return {"error": f"unknown site or empty query: {site!r}"}, {"site": str(site), "ok": False, "note": "bad arguments"}, None
    country, kind, _ = SITES[site]
    url = build_url(site, query)
    hit = CACHE.get(url)
    if hit and time.time() - hit[0] < CACHE_SECS:
        return hit[1], {**hit[2], "secs": 0.0, "cached": round(time.time() - hit[0]), "credits_used": 0}, hit[3]
    t = time.time()
    status, j = post_json("https://api.context.dev/v1/web/scrape",
                          {"url": url, "formats": {"markdown": True, "html": True}, "sharedParams": {"country": country}, "maxAgeMs": 0,
                           "timeoutOpts": {"milliseconds": SCRAPE_TIMEOUT_MS, "behavior": "fail"}, "tags": ["agora"]},
                          {"Authorization": "Bearer " + env["CONTEXT_DEV_API_KEY"]}, SCRAPE_TIMEOUT_MS / 1000 + 15)
    secs = round(time.time() - t, 1)
    md = ((j.get("markdown") or {}).get("data") or "") if isinstance(j, dict) else ""
    log = {"site": site, "country": country, "kind": kind, "query": query, "url": url, "secs": secs, "status": status,
           "chars": len(md), "ok": bool(md), "request_id": j.get("request_id"),
           "credits_used": (j.get("key_metadata") or {}).get("credits_consumed"),
           "credits_left": (j.get("key_metadata") or {}).get("credits_remaining"),
           "sent_chars": min(len(clean(md)), MAX_PAGE_CHARS), "preview": " ".join(clean(md)[3000:3400].split())[:220]}
    if not md:
        reason = j.get("message") or json.dumps((j.get("markdown") or {}).get("error") or j)[:200]
        log["note"] = "rate limit: 10 reads/min on this key" if status == 429 else reason[:160]
        return {"site": site, "error": log["note"]}, log, None
    page_html = ((j.get("html") or {}).get("data") or "")
    log["html_chars"] = len(page_html)
    CACHE[url] = (time.time(), {"site": site, "country": country, "kind": kind, "url": url, "page_text": clean(md)}, log,
                  {"site": site, "url": url, "md": md, "html": page_html})
    return CACHE[url][1:]


def to_number(text):
    """'1.199,00' -> 1199.0, '4 500' -> 4500.0, '368.83' -> 368.83."""
    t = re.sub(r"[ \u00a0\u202f]", "", text)
    last = max(t.rfind("."), t.rfind(","))
    if last >= 0 and len(t) - last - 1 == 3 and not ("." in t and "," in t):
        return float(re.sub(r"[.,]", "", t))  # a lone separator before three digits groups thousands
    if last >= 0:
        return float(re.sub(r"[.,]", "", t[:last]) + "." + t[last + 1:])
    return float(t)


def first_price(text, last=False):
    """First (or last) price in the text; a price in **bold** wins, and monthly plan prices are ignored."""
    def prices(t):
        return [to_number(m.group(1) or m.group(2)) for m in PRICE.finditer(t)
                if not re.match(r"\s*/\s*(mois|mo\b|kk|month|monat|mån|md)", t[m.end():m.end() + 12], re.I)]
    found = prices(" ".join(re.findall(r"\*\*([^*]{1,40})\*\*", text))) or prices(text)
    return (found[-1] if last else found[0]) if found else None


def split_rows(page):
    """Cut one search page into offers with code, no model: [{title, price, currency, url, text, site, country, kind, image}]."""
    site, md = page["site"], page["md"]
    pattern = LISTING_URL.get(site)
    if not pattern:
        return []
    country, kind, _ = SITES[site]
    links = [(m, re.search(pattern, m.group(2))) for m in LINK.finditer(md)]
    links = [(m, urllib.parse.urlparse(m.group(2)).path.split("/ref=")[0]) for m, hit in links if hit]
    rows, seen = [], set()

    def add(title, price, url, text):
        title = " ".join(re.split(r", [^,:]{3,20}: ", title.replace("**", ""))[0].split())[:110]  # vinted appends ", Brand: x, Condition: y"
        text = re.sub(r"[\\#*]+", " ", text)
        if price and len(title) >= 6 and url not in seen:
            seen.add(url)
            rows.append({"title": title, "price": price, "currency": CURRENCY.get(country, "EUR"), "url": url,
                         "text": " ".join(text.split())[:200], "site": site, "country": country, "kind": kind,
                         "image": find_image(page["html"], url)})

    if site in HEADING_TITLE:
        for h in re.finditer(r"^## (.+)$", md, re.M):
            before = max([m.end() for m, _ in links if m.end() <= h.start()], default=0)
            after = next((m for m, _ in links if m.start() >= h.end()), None)
            if after and after.start() - h.end() < 600:
                add(h.group(1), first_price(md[before:h.start()], last=True), after.group(2), md[h.end():after.start()])
        return rows[:MAX_ROWS]
    firsts = [(m, key) for i, (m, key) in enumerate(links) if key not in {k for _, k in links[:i]}]
    for n, (m, key) in enumerate(firsts):
        end = min(firsts[n + 1][0].start() if n + 1 < len(firsts) else len(md), m.start() + 3000)
        seg = LINK.sub(lambda x: x.group(1), md[m.start():end])
        slug = set(re.findall(r"[a-z0-9]+", key.lower()))
        parts = [p.strip() for mm, k in links if k == key for p in re.split(r"(?:\\+\s*)+", mm.group(1)) if len(p.strip()) >= 6]
        if parts:
            title = max(parts, key=lambda p: (len(slug & set(re.findall(r"[a-z0-9]+", p.lower()))), -parts.index(p)))
            add(title, first_price(m.group(1), last=True) if site in PRICE_LAST else first_price(seg), m.group(2), seg.replace(title, ""))
    return rows[:MAX_ROWS]


def find_image(page_html, url):
    """Photo for a listing: the first <img> near where its link sits in the page HTML."""
    path = urllib.parse.urlparse(url).path
    if len(path) < 8:
        return None
    ok = lambda u: not u.startswith("data:") and ".svg" not in u
    for m in list(re.finditer(re.escape(path), page_html))[:8]:
        after = [u for u in IMG.findall(page_html[m.start():m.start() + 6000]) if ok(u)]
        if after:
            return urllib.parse.urljoin(url, html.unescape(after[0]))
        before = [u for u in IMG.findall(page_html[max(0, m.start() - 4000):m.start()]) if ok(u)]
        if before:
            return urllib.parse.urljoin(url, html.unescape(before[-1]))
    return None


def verify_listings(listings, pages):
    """Keep only listings whose link really is on a page we fetched; attach a photo. Returns (kept, dropped_titles)."""
    kept, dropped = [], []
    for item in listings if isinstance(listings, list) else []:
        url = item.get("url") if isinstance(item, dict) else None
        price = item.get("price") if isinstance(item, dict) else None
        key = urllib.parse.urlparse(url).path if isinstance(url, str) and url.startswith("http") else ""
        page = next((p for p in pages if len(key) >= 8 and (key in p["md"] or key in p["html"])), None)
        if not page or not isinstance(price, (int, float)) or isinstance(price, bool) or not item.get("title"):
            dropped.append(str((item or {}).get("title") if isinstance(item, dict) else item)[:80])
            continue
        country, kind, _ = SITES[page["site"]]
        kept.append({**{k: item.get(k) for k in ("title", "price", "currency", "condition", "location", "url", "why")},
                     "site": page["site"], "country": country, "kind": kind, "image": find_image(page["html"], url)})
    return kept, dropped


JUDGE_MODEL = os.environ.get("GEMINI_DECISION_MODEL", "gemini-decision-1")
JUDGE_KEEP = ("exact", "substitute")
JUDGE_LABELS = {  # Amazon's ESCI labels: only the first two may become cards
    "exact": "The product the shopper asked for; no stated requirement (model, variant, storage, size, budget, condition, place) is contradicted. A detail the listing does not mention is not a contradiction.",
    "substitute": "Same kind of product but a model or variant the shopper excluded or did not ask for, or over the budget.",
    "complement": "An accessory, part, case, cable, empty box, or a service such as repair or rental.",
    "irrelevant": "A different product, a wanted ad, or not a real offer.",
}
JUDGE_TEXT = {"exact": "matches", "substitute": "close, not exact", "complement": "accessory or service", "irrelevant": "not what was asked"}


def judge(env, request_text, items, emit=lambda e: None):
    """Gemini Decisions API: one call, one 4-way question per listing, calibrated probabilities back.
    Returns (kept_with_verdicts, rejected, judged_ok)."""
    if not items:
        return [], [], True
    lines = [f"#{i}: {it.get('title')} | {it.get('price')} {it.get('currency') or ''} | condition: {it.get('condition') or 'not stated'} | "
             f"{it.get('location') or it.get('text') or ''} | {it.get('site')} {it.get('country')} ({it.get('kind')})" for i, it in enumerate(items)]
    body = {"model": JUDGE_MODEL, "input": "SHOPPER ASKED:\n" + request_text + "\n\nLISTINGS:\n" + "\n".join(lines),
            "questions": {f"l{i}": {"type": "choice", "instructions": f"Which label fits listing #{i} for this shopper?", "criteria": JUDGE_LABELS}
                          for i in range(len(items))}}
    t = time.time()
    status, j = post_json("https://generativelanguage.googleapis.com/v1beta/decisions", body, {"x-goog-api-key": env["GEMINI_API_KEY"]}, 30)
    secs = round(time.time() - t, 2)
    answers = j.get("answers") if status == 200 and isinstance(j, dict) else None
    if not isinstance(answers, dict) or not answers:  # never drop listings silently when the judge is down: show them marked as unchecked
        note = str((j.get("error") or {}).get("message") or f"HTTP {status}")[:140] if isinstance(j, dict) else f"HTTP {status}"
        emit({"type": "judge", "model": JUDGE_MODEL, "ok": False, "secs": secs, "note": note})
        return [{**it, "verdict": "unchecked", "verdict_reason": "judge unavailable"} for it in items], [], False
    kept, rejected, counts = [], [], dict.fromkeys(JUDGE_LABELS, 0)
    for i, it in enumerate(items):
        a = answers.get(f"l{i}") or {}
        label = a.get("choice") if a.get("choice") in JUDGE_LABELS else "unchecked"
        conf = a.get("confidence") if isinstance(a.get("confidence"), (int, float)) else None
        counts[label] = counts.get(label, 0) + 1
        row = {**it, "verdict": label, "verdict_confidence": conf,
               "verdict_reason": (JUDGE_TEXT.get(label, "no verdict") + (f", {round(conf * 100)}% sure" if conf is not None else ""))}
        (kept if label in JUDGE_KEEP + ("unchecked",) else rejected).append(row)
    kept.sort(key=lambda r: r["verdict"] != "exact")  # stable: exact first, price order kept inside each group
    emit({"type": "judge", "model": JUDGE_MODEL, "ok": True, "secs": secs, "counts": counts,
          "tokens_in": (j.get("usage") or {}).get("total_input_tokens"),
          "rejected": [{"title": str(r["title"])[:60], "label": r["verdict"], "reason": r["verdict_reason"]} for r in rejected]})
    return kept, rejected, True


DETAIL_TOP = 4  # ponytail: listing pages cost Context.dev reads (10/min on this key); raise when the limit is lifted
DETAIL_CHARS = 6000
DEAL_LEVELS = ["Bad deal: overpriced for what it is, or serious problems.",
               "Fair: a normal price for this condition.",
               "Good deal: clearly below the typical price for this condition, no serious problems.",
               "Great deal: far below the typical price and nothing worrying in the description."]
DEAL_NAMES = ["bad deal", "fair price", "good deal", "great deal"]


def read_listing(env, item):
    """Fetch one listing's own page through Context.dev. Returns (description_text, log_event)."""
    hit = CACHE.get(item["url"])
    if hit and time.time() - hit[0] < CACHE_SECS:
        return hit[1], {**hit[2], "secs": 0.0, "cached": round(time.time() - hit[0])}
    t = time.time()
    status, j = post_json("https://api.context.dev/v1/web/scrape",
                          {"url": item["url"], "formats": {"markdown": True}, "sharedParams": {"country": item["country"], "mainContentOnly": True},
                           "markdownParams": {"includeLinks": False}, "timeoutOpts": {"milliseconds": 30000, "behavior": "fail"}, "tags": ["agora-listing"]},
                          {"Authorization": "Bearer " + env["CONTEXT_DEV_API_KEY"]}, 45)
    md = ((j.get("markdown") or {}).get("data") or "") if isinstance(j, dict) else ""
    log = {"site": item["site"], "country": item["country"], "kind": "listing page", "query": str(item["title"])[:50], "url": item["url"],
           "secs": round(time.time() - t, 1), "status": status, "chars": len(md), "ok": bool(md),
           "credits_left": (j.get("key_metadata") or {}).get("credits_remaining") if isinstance(j, dict) else None}
    if not md:
        log["note"] = "rate limit: 10 reads/min on this key" if status == 429 else str(j.get("message") or "empty page")[:120]
    else:
        CACHE[item["url"]] = (time.time(), clean(md)[:DETAIL_CHARS], log)
    return clean(md)[:DETAIL_CHARS], log


def assess(env, request_text, item, description, market):
    """Gemini Decisions on the full listing text: still a match? what kind of deal? any red flags? Returns a dict or None."""
    body = {"model": JUDGE_MODEL,
            "input": f"SHOPPER ASKED:\n{request_text}\n\nMARKET RIGHT NOW: {market}\n\nLISTING: {item['title']} | {item['price']} {item.get('currency') or ''} | "
                     f"{item['site']} {item['country']} ({item['kind']})\n\nFULL LISTING PAGE TEXT:\n{description}",
            "questions": {
                "match": {"type": "choice", "instructions": "Which label fits this listing for this shopper, now that the full text is known?", "criteria": JUDGE_LABELS},
                "deal": {"type": "score", "instructions": "How good a deal is this for the shopper, given the price, the condition described and the market prices?", "criteria": DEAL_LEVELS},
                "defect": {"type": "noul", "instructions": "Does the listing text mention a defect, damage, a missing part or something not working?"},
                "warranty": {"type": "noul", "instructions": "Does the listing text mention a warranty, guarantee or an original receipt?"},
                "risky": {"type": "noul", "instructions": "Are there signs of a scam or an unsafe purchase: a price far too low to be real, payment asked outside the platform, urgency, or almost no description? Answer no if it reads like a normal honest listing."}}}
    status, j = post_json("https://generativelanguage.googleapis.com/v1beta/decisions", body, {"x-goog-api-key": env["GEMINI_API_KEY"]}, 30)
    a = j.get("answers") if status == 200 and isinstance(j, dict) else None
    if not isinstance(a, dict) or not isinstance((a.get("deal") or {}).get("score"), (int, float)):
        return None
    score = a["deal"]["score"]
    p = lambda k: (a.get(k) or {}).get("noul")
    return {"deal_score": round(score, 2), "deal": DEAL_NAMES[max(0, min(3, round(score)))], "deal_confidence": (a["deal"].get("confidence")),
            "match": (a.get("match") or {}).get("choice"), "match_confidence": (a.get("match") or {}).get("confidence"),
            "defect": p("defect"), "warranty": p("warranty"), "risky": p("risky")}


def summarize(env, request_text, rows):
    """One DeepSeek call: one plain sentence per listing page, in the shopper's language. Returns {index: sentence}."""
    if not rows:
        return {}
    key = os.environ.get("DEEPSEEK_API_KEY") or env.get("DEEPSEEK_API_KEY")
    try:
        key = key or open(DEEPSEEK_KEY_FILE).read().strip()
    except OSError:
        return {}
    prompt = ("For each listing page below write ONE sentence (max 30 words) in the language of the shopper's request, with the facts a buyer needs: "
              "exact model and variant, age, condition and wear, defects, what is included, battery health, warranty, pickup or shipping. "
              "Only facts stated in the text; if the text says little, say so. Reply as JSON: {\"0\": \"...\", \"1\": \"...\"}.\n\nSHOPPER ASKED: "
              + request_text + "\n\n" + "\n\n".join(f"=== LISTING {i}: {t}\n{d}" for i, t, d in rows))
    status, j = post_json("https://api.deepseek.com/v1/chat/completions",
                          {"model": DEEPSEEK_MODEL, "messages": [{"role": "user", "content": prompt}], "response_format": {"type": "json_object"}},
                          {"Authorization": "Bearer " + key}, 60)
    try:
        out = json.loads(j["choices"][0]["message"]["content"])
        return {int(k): str(v)[:300] for k, v in out.items() if str(k).isdigit()}
    except (KeyError, IndexError, TypeError, ValueError):
        return {}


def deepen(env, request_text, items, emit):
    """Read the listing pages of the best candidates, then let Gemini Decisions rate each as a deal. Returns items, enriched."""
    top = [i for i, it in enumerate(items) if it.get("verdict") in ("exact", "unchecked")][:DETAIL_TOP]
    if not top:
        return items
    prices = sorted(it["price"] for it in items if it.get("verdict") == "exact" and it.get("currency") == items[top[0]].get("currency"))
    market = (f"{len(prices)} comparable listings found, from {prices[0]} to {prices[-1]}, median {prices[len(prices) // 2]} {items[top[0]].get('currency') or ''}"
              if len(prices) >= 3 else "too few comparable listings to know the typical price")
    for i in top:
        emit({"type": "start", "site": items[i]["site"], "query": str(items[i]["title"])[:50], "url": items[i]["url"]})

    def one(i):
        text, log = read_listing(env, items[i])
        emit({"type": "done", **log})
        return i, text, (assess(env, request_text, items[i], text, market) if text else None)

    t = time.time()
    with ThreadPoolExecutor(DETAIL_TOP + 1) as ex:
        sums = ex.submit(lambda: None)
        results = list(ex.map(one, top))
        sums = summarize(env, request_text, [(i, items[i]["title"], text) for i, text, _ in results if text])
    out = list(items)
    for i, text, a in results:
        out[i] = {**items[i], "read_page": bool(text), "summary": sums.get(i), **(a or {})}
    emit({"type": "assess", "model": JUDGE_MODEL, "secs": round(time.time() - t, 1), "market": market,
          "rows": [{"title": str(out[i]["title"])[:50], "deal": out[i].get("deal"), "deal_score": out[i].get("deal_score"), "match": out[i].get("match"),
                    "defect": out[i].get("defect"), "risky": out[i].get("risky"), "warranty": out[i].get("warranty"), "read": out[i]["read_page"]} for i in top]})
    return out


def describe(calls):
    out = []
    for c in calls:
        a = c.get("args") or {}
        out.append({"search_marketplace": f"read {a.get('site')} \"{a.get('query')}\"", "remember": f"remember \"{a.get('fact')}\"",
                    "show_listings": f"show {len(a.get('listings') or [])} listings"}.get(c.get("name"), str(c.get("name"))))
    return ", ".join(out) if out else "final answer"


def with_profile(question, profile, hints):
    """Put the saved profile and browser hints in front of the request; the model decides whether they apply."""
    head = []
    if profile:
        head.append("[Saved profile of the shopper]\n" + profile)
    if hints:
        head.append("[Browser hints, weak signals] " + hints)
    return "\n".join(head + ["[Request]\n" + question]) if head else question


def gemini(env, contents, emit=lambda e: None):
    sent = len(json.dumps(contents))
    for i, model in enumerate(MODELS):
        emit({"type": "g_start", "model": model, "sent_chars": sent, "messages": len(contents)})
        t = time.time()
        status, j = post_json(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                              {"systemInstruction": {"parts": [{"text": SYSTEM}]}, "contents": contents, "tools": TOOLS},
                              {"x-goog-api-key": env["GEMINI_API_KEY"]}, 60)
        secs = round(time.time() - t, 1)
        parts = (((j.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []) if status == 200 else []
        calls = [p["functionCall"] for p in parts if "functionCall" in p]
        u = j.get("usageMetadata") or {}
        err = "" if status == 200 else str((j.get("error") or j).get("message", j) if isinstance(j, dict) else j)[:160]
        emit({"type": "g_done", "model": model, "status": status, "secs": secs, "ok": status == 200 and bool(parts),
              "tokens_in": u.get("promptTokenCount"), "tokens_out": u.get("candidatesTokenCount"),
              "tokens_thinking": u.get("thoughtsTokenCount"), "note": err,
              "decided": describe(calls) if parts else ""})
        if status not in BUSY or i == len(MODELS) - 1:
            break
    if status != 200:
        raise RuntimeError(f"Gemini HTTP {status}: {err}")
    if not parts:
        cands = j.get("candidates") or []
        raise RuntimeError(f"Gemini returned no answer ({(cands[0].get('finishReason') if cands else j.get('promptFeedback'))})")
    return (j["candidates"][0]["content"])


def to_openai(contents):
    """Gemini-style contents -> OpenAI-style messages (DeepSeek speaks that)."""
    msgs = [{"role": "system", "content": SYSTEM}]
    for c in contents:
        parts = c["parts"]
        calls = [p["functionCall"] for p in parts if "functionCall" in p]
        results = [p["functionResponse"] for p in parts if "functionResponse" in p]
        text = "".join(p.get("text", "") for p in parts)
        if results:
            msgs += [{"role": "tool", "tool_call_id": r.get("id", ""), "content": json.dumps(r["response"], ensure_ascii=False)} for r in results]
        elif calls:
            msgs.append({"role": "assistant", "content": text or None, "tool_calls": [
                {"id": f["id"], "type": "function", "function": {"name": f["name"], "arguments": json.dumps(f.get("args") or {})}} for f in calls]})
        else:
            msgs.append({"role": "assistant" if c["role"] == "model" else "user", "content": text})
    return msgs


def deepseek(env, contents, emit=lambda e: None):
    """Same contract as gemini(): takes Gemini-style contents, returns one Gemini-style content."""
    key = os.environ.get("DEEPSEEK_API_KEY") or env.get("DEEPSEEK_API_KEY")
    if not key:
        try:
            key = open(DEEPSEEK_KEY_FILE).read().strip()
        except OSError:
            raise RuntimeError(f"No DeepSeek key: set DEEPSEEK_API_KEY in .env or put it in {DEEPSEEK_KEY_FILE}")
    msgs = to_openai(contents)
    emit({"type": "g_start", "model": DEEPSEEK_MODEL, "sent_chars": len(json.dumps(msgs)), "messages": len(contents)})
    t = time.time()
    status, j = post_json("https://api.deepseek.com/v1/chat/completions",
                          {"model": DEEPSEEK_MODEL, "messages": msgs, "tools": [{"type": "function", "function": f} for f in TOOLS[0]["functionDeclarations"]]},
                          {"Authorization": "Bearer " + key}, 120)
    m = ((j.get("choices") or [{}])[0].get("message") or {}) if status == 200 else {}
    parts = [{"text": m["content"]}] if m.get("content") else []
    for tc in m.get("tool_calls") or []:
        try:
            args = json.loads(tc["function"].get("arguments") or "{}")
        except ValueError:
            args = {}
        parts.append({"functionCall": {"name": tc["function"]["name"], "args": args, "id": tc["id"]}})
    calls = [p["functionCall"] for p in parts if "functionCall" in p]
    u = j.get("usage") or {}
    err = "" if status == 200 else str((j.get("error") or j).get("message", j) if isinstance(j, dict) else j)[:160]
    emit({"type": "g_done", "model": DEEPSEEK_MODEL, "status": status, "secs": round(time.time() - t, 1), "ok": bool(parts),
          "tokens_in": u.get("prompt_tokens"), "tokens_out": u.get("completion_tokens"),
          "tokens_thinking": (u.get("completion_tokens_details") or {}).get("reasoning_tokens"), "note": err or "empty reply",
          "decided": describe(calls)})
    if not parts:
        raise RuntimeError(f"DeepSeek HTTP {status}: {err or 'empty reply'}")
    return {"role": "model", "parts": parts}


LLMS = {"deepseek": deepseek, "gemini": gemini}


def ask(env, messages, emit, llm=DEFAULT_LLM, profile="", hints=""):
    """Tool loop over a chat. messages = [{"role": "user"|"assistant", "text": str}], last one from the user."""
    contents = [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["text"]}]} for m in messages[:-1]]
    contents.append({"role": "user", "parts": [{"text": with_profile(messages[-1]["text"], profile, hints)}]})
    asked = "\n".join(m["text"] for m in messages if m["role"] == "user")[-1500:]
    pages, seen = [], {}  # seen: listing url -> row already judged when its page landed
    for _ in range(MAX_TURNS):
        content = LLMS[llm](env, contents, emit)
        contents = contents + [content]  # kept as returned, so thought signatures survive
        calls = [p["functionCall"] for p in content["parts"] if "functionCall" in p]
        text = "".join(p.get("text", "") for p in content["parts"] if not p.get("thought"))
        for c in calls:
            a = c.get("args") or {}
            if c.get("name") == "remember" and isinstance(a.get("fact"), str) and a["fact"].strip():
                emit({"type": "remember", "fact": a["fact"].strip()[:160]})
            if c.get("name") == "search_marketplace":
                emit({"type": "start", "site": a.get("site"), "query": a.get("query"),
                      "url": build_url(a["site"], a["query"]) if a.get("site") in SITES and isinstance(a.get("query"), str) else None})
        show = next((c for c in calls if c.get("name") == "show_listings"), None)
        if show:
            a = show.get("args") or {}
            kept, dropped = verify_listings(a.get("listings"), pages)
            known = [{**it, **{k: seen[it["url"]].get(k) for k in ("price", "currency", "verdict", "verdict_confidence", "verdict_reason")}}
                     for it in kept if it["url"] in seen]  # price and verdict come from the page row, not from the model's copy
            fresh, rejected, _ = judge(env, asked, [it for it in kept if it["url"] not in seen], emit)
            kept = sorted(known + fresh, key=lambda r: r["verdict"] != "exact")
            final = {"type": "listings", "dropped": dropped, "rejected": len(rejected), "verdict": str(a.get("verdict") or text),
                     "personalized_by": [str(x)[:120] for x in (a.get("personalized_by") or []) if x][:8]}
            emit({**final, "items": kept, "more": True})  # cards and verdict now; listing-page details follow
            emit({**final, "items": deepen(env, asked, kept, emit), "more": False})
            return
        if not calls:
            emit({"type": "answer", "text": text})
            return

        def run(c):
            a = c.get("args") or {}
            if c.get("name") == "search_marketplace":
                result, log, page = search_marketplace(env, a.get("site"), a.get("query"))
                emit({"type": "done", **log})
                rows = split_rows(page) if page else []
                if page:
                    pages.append(page)
                if rows:  # cards go out the moment the page lands; the model then gets the judged rows, not 40k of page text
                    emit({"type": "rows", "site": page["site"], "items": rows})
                    kept, rejected, _ = judge(env, asked, rows, emit)
                    seen.update({r["url"]: r for r in kept})
                    emit({"type": "judged", "site": page["site"], "keep": kept, "drop": [r["url"] for r in rejected]})
                    result = {**{k: result[k] for k in ("site", "country", "kind", "url")},
                              "offers": [{k: r[k] for k in ("title", "price", "currency", "url", "text")} for r in kept]}
            else:
                result = {"saved": True}
            return {"functionResponse": {"name": c["name"], "response": result, **({"id": c["id"]} if c.get("id") else {})}}

        with ThreadPoolExecutor(8) as ex:
            contents = contents + [{"role": "user", "parts": list(ex.map(run, calls))}]
    emit({"type": "answer", "text": "Stopped after too many rounds without a final answer."})


PAGE = r"""<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Agora</title>
<style>
:root{color-scheme:dark}
body{font:15px/1.5 ui-monospace,Menlo,monospace;background:#0e1113;color:#d8dee4;max-width:980px;margin:0 auto;padding:16px 16px 150px}
header{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}h1{font-size:18px;margin:0}small,.dim{color:#7d8792}
details{margin:8px 0}summary{cursor:pointer;color:#7d8792}
textarea,input,select{font:inherit;background:#161b1f;color:inherit;border:1px solid #2b333b;border-radius:6px;padding:10px}
#profile{width:100%;box-sizing:border-box;margin:8px 0 4px}
.msg{margin:18px 0}.who{font-size:11px;color:#7d8792;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
.user .body{background:#161b1f;border:1px solid #2b333b;border-radius:8px;padding:10px 12px;display:inline-block;max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere}
.text{white-space:pre-wrap;overflow-wrap:anywhere}.used{color:#d29922;margin:6px 0}
.log{font-size:12px;border-left:2px solid #2b333b;padding-left:10px;margin:6px 0}.log div{padding:1px 0;white-space:pre-wrap;overflow-wrap:anywhere}
.ok{color:#3fb950}.bad{color:#f85149}.wait{color:#d29922}.sub{color:#7d8792;padding-left:14px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin:10px 0}
.card{display:block;background:#161b1f;border:1px solid #2b333b;border-radius:8px;overflow:hidden;color:inherit;text-decoration:none}.card:hover,.card:focus{border-color:#58a6ff}
.card img,.noimg{width:100%;aspect-ratio:4/3;object-fit:cover;background:#0b0e10;display:block}.noimg{display:grid;place-items:center;color:#7d8792;font-size:12px}
.t{padding:8px 10px}.p{font-size:17px;font-weight:700;color:#fff}.m{font-size:11.5px;color:#7d8792}.w{font-size:12px;color:#3fb950;margin-top:4px}
.deal{display:inline-block;font-size:11px;font-weight:700;padding:1px 7px;border-radius:10px;margin-bottom:4px;color:#04130a}.d0{background:#f85149}.d1{background:#7d8792}.d2{background:#3fb950}.d3{background:#58a6ff}.sum{font-size:12px;margin-top:5px;color:#d8dee4}.flags{font-size:11.5px;color:#d29922;margin-top:3px}.v{font-size:11.5px;margin-top:4px}.v-exact{color:#3fb950}.v-substitute{color:#d29922}.v-unchecked{color:#7d8792}.k-used{color:#d29922}.k-refurbished{color:#58a6ff}.k-new{color:#3fb950}
form{position:fixed;left:0;right:0;bottom:0;background:#0e1113;border-top:1px solid #2b333b;padding:12px 16px}
form>div{max-width:980px;margin:0 auto;display:flex;gap:8px}#q{flex:1;min-width:0}
button{font:inherit;padding:10px 16px;background:#3fb950;color:#04130a;border:0;border-radius:6px;cursor:pointer}button:disabled{opacity:.5}
#new{background:none;color:#7d8792;border:1px solid #2b333b}
.in{animation:land .4s both cubic-bezier(.2,.8,.2,1)}@keyframes land{from{opacity:0;transform:translateY(16px) scale(.95)}}
.out{opacity:0;transform:scale(.9);transition:opacity .4s,transform .4s}@media(prefers-reduced-motion:reduce){.in{animation:none}.out{transition:none}}
</style>
<header><h1>agora</h1><small>chat; it reads live European marketplaces through Context.dev when you want to buy something</small></header>
<details><summary>About me <span id=pc></span></summary>
<textarea id=profile rows=4 maxlength=1500 aria-label="About me" placeholder="One fact per line, e.g. Lives in Helsinki, prefers pickup"></textarea>
<small>Saved in this browser only. The agent adds a line when you tell it something lasting about yourself; edit or delete anything.</small></details>
<main id=thread aria-live=polite></main>
<form id=f><div><input id=q placeholder="Say hi, ask something, or tell me what you want to buy" autofocus aria-label="Message">
<select id=llm aria-label="Model"><option value=deepseek>DeepSeek</option><option value=gemini>Gemini</option></select>
<button id=b>Send</button><button id=new type=button>New chat</button></div></form>
<script>
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const d=document.createElement(tag);if(cls)d.className=cls;if(text!=null)d.textContent=text;return d};
let history=[];
function saveProfile(){const v=$('profile').value;try{localStorage.setItem('agora.profile',v)}catch(_){}
  const n=v.split('\n').filter(x=>x.trim()).length;$('pc').textContent=n?'('+n+' saved)':'(empty)'}
try{$('profile').value=localStorage.getItem('agora.profile')||''}catch(_){}
saveProfile();$('profile').oninput=saveProfile;
const hints=()=>{try{return 'language '+navigator.language+', timezone '+Intl.DateTimeFormat().resolvedOptions().timeZone}catch(_){return ''}};
function bubble(role){const m=el('div','msg '+role);m.append(el('div','who',role=='user'?'you':'agora'));const b=el('div','body');m.append(b);$('thread').append(m);return b}
function card(it){const a=el('a','card');a.href=it.url;a.target='_blank';a.rel='noopener noreferrer';
  if(it.image){const im=el('img');im.loading='lazy';im.referrerPolicy='no-referrer';im.alt='';im.src=it.image;im.onerror=()=>im.replaceWith(el('div','noimg','photo blocked by site'));a.append(im)}else a.append(el('div','noimg','no photo found'));
  const t=el('div','t');t.append(el('div','p',it.price+' '+(it.currency||'')),el('div','',it.title));
  const m=el('div','m');m.append(el('span','k-'+it.kind,it.kind),' · '+it.site+' '+it.country+(it.condition?' · '+it.condition:'')+(it.location?' · '+it.location:''));t.append(m);
  if(it.deal){const d=el('div','deal d'+Math.round(it.deal_score),it.deal+' · '+it.deal_score+'/3');t.prepend(d)}
  if(it.summary)t.append(el('div','sum',it.summary));
  const fl=[];if(it.defect>0.6)fl.push('defect mentioned');if(it.risky>0.6)fl.push('looks risky');if(it.warranty>0.6)fl.push('warranty / receipt');if(it.match&&it.match!='exact')fl.push('on reading: '+it.match);
  if(fl.length)t.append(el('div','flags',fl.join(' · ')));
  if(it.why)t.append(el('div','w',it.why));if(it.verdict)t.append(el('div','v v-'+it.verdict,(it.verdict=='exact'?'✓ ':it.verdict=='substitute'?'≈ ':'? ')+(it.verdict_reason||'not checked')));a.append(t);return a}
async function send(q){
  bubble('user').textContent=q;history.push({role:'user',text:q});
  const body=bubble('assistant'),log=el('div','log'),rows={},cards={};body.append(log);let gn=0,reply='',grid=null,fin=null;
  const line=(cls,text,key)=>{let d=key&&rows[key];if(!d){d=el('div');log.append(d);if(key)rows[key]=d}d.className=cls;d.textContent=text};
  const show=e=>{
    if(e.type=='g_start'){gn++;line('wait','… '+e.model+' thinking','g'+gn)}
    else if(e.type=='g_done'){line(e.ok?'ok':'bad',(e.ok?'✓ ':'✗ ')+e.model+'  '+e.secs+'s  tokens in '+(e.tokens_in??'?')+' out '+(e.tokens_out??'?')+'  → '+(e.ok?e.decided:e.note),'g'+gn)}
    else if(e.type=='start')line('wait','… context.dev  '+e.site+'  "'+e.query+'"',e.site+e.query);
    else if(e.type=='done')line(e.ok?'ok':'bad',(e.ok?'✓ ':'✗ ')+'context.dev  '+e.site+'  HTTP '+(e.status??'-')+'  '+(e.cached!=null?'cached '+e.cached+'s ago':(e.secs??'-')+'s')+'  '+(e.ok?e.chars+' chars · '+(e.credits_left??'?')+' credits left':(e.note||'failed')),e.site+e.query);
    else if(e.type=='judge'){gn++;if(!e.ok)line('bad','✗ judge '+e.model+'  '+e.secs+'s  '+e.note);
      else{line('ok','✓ judge '+e.model+'  '+e.secs+'s  exact '+e.counts.exact+' · substitute '+e.counts.substitute+' · accessory/service '+e.counts.complement+' · irrelevant '+e.counts.irrelevant);
        e.rejected.forEach(r=>line('sub','✗ '+r.label+': '+r.title+' — '+r.reason))}}
    else if(e.type=='assess'){line('ok','✓ deal check '+e.model+'  '+e.secs+'s  market: '+e.market);
      e.rows.forEach(r=>line('sub',(r.read?'':'(page not read) ')+r.title+' → '+(r.deal||'not rated')+(r.deal_score!=null?' ('+r.deal_score+'/3)':'')+(r.match&&r.match!='exact'?' · now '+r.match:'')+(r.defect>0.6?' · defect mentioned':'')+(r.risky>0.6?' · RISKY':'')+(r.warranty>0.6?' · warranty':'')))}
    else if(e.type=='remember'){line('ok','★ remembered: '+e.fact);const p=$('profile');if(!p.value.toLowerCase().includes(e.fact.toLowerCase())){p.value=(p.value.trim()+'\n'+e.fact).trim().slice(0,1500);saveProfile()}}
    else if(e.type=='rows'){if(!grid){grid=el('div','cards');body.append(grid)}
      e.items.forEach((it,i)=>{if(cards[it.url])return;const c=card(it);c.classList.add('in');c.style.animationDelay=(i*45)+'ms';cards[it.url]=c;grid.append(c)});
      line('sub',e.site+': '+e.items.length+' offers on the page','rows'+e.site)}
    else if(e.type=='judged'){
      e.drop.forEach(u=>{const c=cards[u];if(c){c.classList.add('out');setTimeout(()=>c.remove(),450);delete cards[u]}});
      e.keep.forEach(it=>{const c=cards[it.url];if(c){const n=card(it);c.replaceWith(n);cards[it.url]=n}})}
    else if(e.type=='listings'){
      if(grid){grid.remove();grid=null}if(!fin){fin=el('div');body.append(fin)}fin.textContent='';
      if(e.personalized_by.length)fin.append(el('div','used','Personalized by: '+e.personalized_by.join(' · ')));
      const g=el('div','cards');e.items.forEach(it=>g.append(card(it)));fin.append(g);
      fin.append(el('div','text',e.verdict+(e.dropped.length?'\n\nLeft out, link not found on the pages read: '+e.dropped.join('; '):'')));
      if(e.more)line('wait','… reading the best listings for details','fin');
      else line('sub','verified '+e.items.length+' listings against the pages · '+e.items.filter(i=>i.image).length+' with photo · '+e.dropped.length+' dropped','fin');
      reply=e.verdict+'\nListings shown to the user:\n'+e.items.map((it,i)=>(i+1)+'. '+it.title+' | '+it.price+' '+(it.currency||'')+' | '+it.site+' | '+it.url).join('\n')}
    else if(e.type=='answer'){body.append(el('div','text',e.text));reply=e.text}
    else if(e.type=='error')line('bad','✗ '+e.text);
    window.scrollTo(0,document.body.scrollHeight)};
  try{const r=await fetch('/ask',{method:'POST',body:JSON.stringify({messages:history.slice(-12),llm:$('llm').value,profile:$('profile').value.slice(0,1500),hints:hints()})});
    if(!r.ok){show({type:'error',text:'Server said '+r.status+': '+r.statusText});}
    else{const rd=r.body.getReader(),td=new TextDecoder();let buf='';
      for(;;){const{done,value}=await rd.read();if(done)break;buf+=td.decode(value,{stream:true});let i;
        while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i);buf=buf.slice(i+1);if(l)show(JSON.parse(l))}}}
  }catch(err){show({type:'error',text:'Connection lost: '+err.message})}
  if(reply)history.push({role:'assistant',text:reply.slice(0,6000)});else history.pop();
}
$('f').onsubmit=async ev=>{ev.preventDefault();const q=$('q').value.trim();if(!q)return;$('q').value='';$('b').disabled=true;await send(q);$('b').disabled=false;$('q').focus()};
$('new').onclick=()=>{history=[];$('thread').textContent='';$('q').focus()};
</script>
"""


def valid_messages(msgs):
    return (isinstance(msgs, list) and 1 <= len(msgs) <= 12
            and all(isinstance(m, dict) and m.get("role") in ("user", "assistant") and isinstance(m.get("text"), str)
                    and 0 < len(m["text"].strip()) <= 6000 for m in msgs)
            and msgs[-1]["role"] == "user" and len(msgs[-1]["text"]) <= 500)


class Handler(BaseHTTPRequestHandler):
    env = {}

    def do_GET(self):
        body = PAGE.encode()
        self.send_response(200 if self.path.split("?")[0] == "/" else 404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body) if self.path.split("?")[0] == "/" else 0))
        self.end_headers()
        if self.path.split("?")[0] == "/":
            self.wfile.write(body)

    def do_POST(self):
        if self.path != "/ask":
            return self.send_error(404)
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(min(n, 200_000)) or b"{}")
            msgs, llm = body.get("messages"), body.get("llm", DEFAULT_LLM)
            profile, hints = body.get("profile") or "", body.get("hints") or ""
        except (ValueError, AttributeError):
            return self.send_error(400, "Body must be JSON")
        if llm not in LLMS:
            return self.send_error(400, "llm must be deepseek or gemini")
        if not isinstance(profile, str) or not isinstance(hints, str) or len(profile) > MAX_PROFILE_CHARS or len(hints) > 300:
            return self.send_error(400, f"profile must be text up to {MAX_PROFILE_CHARS} characters")
        if not valid_messages(msgs):
            return self.send_error(400, "messages must be 1-12 chat turns ending with a user message")
        self.send_response(200)  # HTTP/1.0 response without length: lines stream until we close
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

        def emit(event):
            print(json.dumps(event, ensure_ascii=False)[:240], flush=True)
            try:
                self.wfile.write((json.dumps(event) + "\n").encode())
                self.wfile.flush()
            except OSError:
                pass  # browser went away; keep the server log

        try:
            ask(self.env, msgs, emit, llm, profile.strip(), hints.strip())
        except Exception as e:  # report every failure to the user instead of a dead page
            emit({"type": "error", "text": str(e)})

    def log_message(self, *a):
        pass


def check():
    assert build_url("marktplaats", "koffie machine") == "https://www.marktplaats.nl/q/koffie+machine/"
    assert build_url("kleinanzeigen", "iphone 15") == "https://www.kleinanzeigen.de/s-iphone-15/k0"
    assert build_url("tori", "kahvinkeitin ä") .endswith("q=kahvinkeitin+%C3%A4")
    assert clean("a ![x](http://i/p.png) b\n\n\n\nc") == "a  b\n\nc"
    assert len(clean("x" * 99_999)) == MAX_PAGE_CHARS
    pg = '<a href="/item/12345678"><img src="/pic/a.jpg"></a><a href="/item/99999999"><img data-src="//cdn.x/b.webp"></a>'
    assert find_image(pg, "https://shop.example/item/12345678?ref=1") == "https://shop.example/pic/a.jpg"
    assert find_image(pg, "https://shop.example/item/99999999") == "https://cdn.x/b.webp"
    pages = [{"site": "tori", "url": "u", "md": "x https://shop.example/item/12345678 y", "html": pg}]
    kept, dropped = verify_listings([{"title": "real", "price": 10, "currency": "EUR", "url": "https://shop.example/item/12345678"},
                                     {"title": "invented", "price": 5, "currency": "EUR", "url": "https://shop.example/item/00000000"},
                                     {"title": "no price", "price": "cheap", "url": "https://shop.example/item/12345678"}], pages)
    assert [k["title"] for k in kept] == ["real"] and kept[0]["image"].endswith("a.jpg") and kept[0]["country"] == "FI"
    assert dropped == ["invented", "no price"]
    assert with_profile("q", "", "") == "q" and with_profile("q", "Lives in Espoo", "").endswith("[Request]\nq")
    assert valid_messages([{"role": "user", "text": "hi"}]) and not valid_messages([{"role": "assistant", "text": "hi"}])
    assert not valid_messages([]) and not valid_messages([{"role": "user", "text": " "}]) and not valid_messages("x")
    assert judge({}, "x", []) == ([], [], True)
    assert [to_number(x) for x in ("1.199,00", "4 500", "368.83", "509,00", "4.500")] == [1199.0, 4500.0, 368.83, 509.0, 4500.0]
    assert first_price("€15 korting **€ 509,00** x") == 509.0 and first_price("9,99€/ mois 429,99 € 389,99 €", last=True) == 389.99
    tori_md = ("[Product images, 1 of 4](https://www.tori.fi/recommerce/forsale/item/111)\n\n450 €\n\n## Iphone 15 plus\n\n128 GB Apple\n\n"
               "[Siirry ilmoitukseen](https://www.tori.fi/recommerce/forsale/item/111)\n\n699 €\n\n## iPhone 15 Pro Max\n\nTampere\n\n"
               "[Siirry ilmoitukseen](https://www.tori.fi/recommerce/forsale/item/222)")
    assert [(r["title"], r["price"], r["url"][-3:]) for r in split_rows({"site": "tori", "md": tori_md, "html": ""})] == \
        [("Iphone 15 plus", 450.0, "111"), ("iPhone 15 Pro Max", 699.0, "222")]
    kl_md = ("- [7](https://www.kleinanzeigen.de/s-anzeige/iphone-15-pro/1-2-3)\n 10707 Berlin\n ### [IPhone 15 Pro 512 GB](https://www.kleinanzeigen.de/s-anzeige/iphone-15-pro/1-2-3)\n"
             " text\n 640 €\n 649 €\n- [x](https://www.kleinanzeigen.de/s-anzeige/huelle/4-5-6)\n ### [iPhone Hülle neu](https://www.kleinanzeigen.de/s-anzeige/huelle/4-5-6)\n 5 €")
    assert [(r["title"], r["price"]) for r in split_rows({"site": "kleinanzeigen", "md": kl_md, "html": ""})] == [("IPhone 15 Pro 512 GB", 640.0), ("iPhone Hülle neu", 5.0)]
    assert split_rows({"site": "rebuy", "md": kl_md, "html": ""}) == []
    t = time.time()
    split_rows({"site": "marktplaats", "md": "[" + "a\\\\ \\\\ " * 4000 + " no closing bracket", "html": ""})
    assert time.time() - t < 1, "link regex backtracks"
    r, log, page = search_marketplace({}, "nope", "x")
    assert "error" in r and log["ok"] is False
    m = to_openai([{"role": "user", "parts": [{"text": "hi"}]},
                   {"role": "model", "parts": [{"functionCall": {"name": "search_marketplace", "args": {"site": "tori", "query": "x"}, "id": "c1"}}]},
                   {"role": "user", "parts": [{"functionResponse": {"name": "search_marketplace", "response": {"a": 1}, "id": "c1"}}]}])
    assert [x["role"] for x in m] == ["system", "user", "assistant", "tool"]
    assert m[2]["tool_calls"][0]["id"] == m[3]["tool_call_id"] == "c1" and json.loads(m[3]["content"]) == {"a": 1}
    print("check ok")


if __name__ == "__main__":
    if "--check" in sys.argv:
        check()
    else:
        Handler.env = load_env()
        print(f"Agora on http://localhost:{PORT}  (models {MODELS})")
        ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
