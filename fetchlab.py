"""Build fetchlab.html: a replay of one recorded Context.dev fetch, shown three ways. Experiment, not the product.

Run: python3 fetchlab.py <dir with search_*.json, brand_*.json, shot_*.jpg>   then open fetchlab.html
The recording itself is made by lab_fetch.py (one scrape with markdown+html+screenshot per site, one brand lookup per site).
"""
import glob, json, os, shutil, subprocess, sys, time, urllib.parse

import agora

RATES = {"EUR": 1, "SEK": 0.088, "NOK": 0.086, "DKK": 0.134, "PLN": 0.235, "GBP": 1.15}  # ponytail: rough fixed rates, fetch real ones if money decisions depend on it
ASKED = "A used or refurbished iPhone 15 (the base model, the phone itself), any storage or colour."


def brand_bits(path):
    """(logo_url, colour) from a saved brand lookup; either may be None."""
    try:
        b = json.load(open(path)).get("brand") or {}
    except (OSError, ValueError):
        return None, None
    logos = [l for l in b.get("logos") or [] if l.get("url")]
    icon = next((l for l in logos if l.get("type") == "icon"), logos[0] if logos else None)
    def usable(h):  # near-black is invisible on the dark page, near-white says nothing about the brand
        rgb = [int(h[i:i + 2], 16) for i in (1, 3, 5)]
        return 150 < sum(rgb) and max(rgb) - min(rgb) > 40
    cols = [c["hex"] for c in sorted(b.get("colors") or [], key=lambda c: c.get("source") != "logo") if isinstance(c.get("hex"), str) and len(c["hex"]) == 7]
    colour = next((h for h in cols if usable(h)), None)
    return (icon or {}).get("url"), colour


def build(src):
    env = agora.load_env()
    out = os.path.join(agora.HERE, "lab")
    os.makedirs(out, exist_ok=True)
    sites = []
    for path in sorted(glob.glob(os.path.join(src, "search_*.json"))):
        s = json.load(open(path))
        site = s["site"]
        kept, rejected, ok = agora.judge(env, ASKED, s["rows"]) if s["rows"] else ([], [], True)
        exact = {r["url"] for r in kept if r["verdict"] in ("exact", "unchecked")}
        shot = os.path.join(src, f"shot_{site}.jpg")
        if os.path.exists(shot):
            shutil.copy(shot, os.path.join(out, f"{site}.jpg"))
            subprocess.run(["sips", "-Z", "720", os.path.join(out, f"{site}.jpg")], capture_output=True)  # macOS; without it the full-size file is used
        logo, colour = brand_bits(os.path.join(src, f"brand_{site}.json"))
        sites.append({"site": site, "name": site.replace("_", "."), "domain": urllib.parse.urlparse(s["url"]).netloc.removeprefix("www."),
                      "country": s["country"], "kind": s["kind"], "secs": s["secs"], "ok": bool(s["rows"]), "judged": ok,
                      "logo": logo, "color": colour or "#58a6ff", "shot": f"lab/{site}.jpg" if os.path.exists(shot) else None,
                      "rows": [{k: r.get(k) for k in ("title", "price", "currency", "url", "image")} | {"keep": r["url"] in exact} for r in s["rows"]]})
        print(f"{site:14} {s['secs']:5}s rows {len(s['rows']):2} kept {len(exact):2} logo {'y' if logo else 'n'} colour {colour} shot {'y' if sites[-1]['shot'] else 'n'}")
    data = {"query": "iphone 15", "when": time.strftime("%a %d %b %H:%M"), "rates": RATES, "sites": sites}
    page = open(os.path.join(agora.HERE, "fetchlab.tpl.html")).read().replace("/*DATA*/", json.dumps(data, ensure_ascii=False).replace("</", "<\\/"))
    open(os.path.join(agora.HERE, "fetchlab.html"), "w").write(page)
    print("wrote fetchlab.html,", len(page) // 1024, "KB")


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__))
