"""Marketplace search URL -> Context.dev scrape -> Modal cutout -> PNG grid.

usage: set -a; . ../.env; set +a
       python3 pipeline.py <search_url> <modal_endpoint_url> <out_dir> [model]
"""
import html
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SCRAPE_URL = "https://api.context.dev/v1/web/scrape"
WORKERS = 8
MIN_ALT = 25  # ponytail: listing photos have long alt text, logos/flags don't; site-specific parser if this leaks


def post_json(url: str, payload: dict, headers: dict, timeout: int) -> bytes:
    req = urllib.request.Request(url, json.dumps(payload).encode(), {"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def scrape_listings(search_url: str, key: str) -> list[dict]:
    body = post_json(SCRAPE_URL, {"url": search_url, "formats": {"images": True}},
                     {"Authorization": f"Bearer {key}"}, timeout=120)
    images = (json.loads(body).get("images") or {}).get("data") or []
    seen, items = set(), []
    for im in images:
        alt, src = (im.get("alt") or "").strip(), im.get("url") or ""
        if len(alt) >= MIN_ALT and src.startswith("http") and alt not in seen:
            seen.add(alt)
            items.append({"alt": alt, "src": src})
    return items


def cut_one(endpoint: str, model: str | None, item: dict, out: Path, i: int) -> dict:
    payload = {"url": item["src"], **({"model": model} if model else {})}
    try:
        png = post_json(endpoint, payload, {}, timeout=120)
        (out / f"{i:03}.png").write_bytes(png)
        return {**item, "png": f"{i:03}.png"}
    except Exception as e:  # keep the grid going; show the failure in the tile
        return {**item, "error": str(e)[:120]}


def write_grid(items: list[dict], out: Path) -> Path:
    tiles = "".join(
        f'<figure><img src="{html.escape(it["src"])}">'
        + (f'<img class="cut" src="{it["png"]}">' if "png" in it else f'<p class="err">{html.escape(it["error"])}</p>')
        + f'<figcaption>{html.escape(it["alt"][:90])}</figcaption></figure>'
        for it in items
    )
    page = out / "grid.html"
    page.write_text(
        "<!doctype html><meta charset=utf-8><title>Cutout grid</title><style>"
        "body{font:13px system-ui;margin:16px;background:#f4f4f4}"
        "main{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}"
        "figure{margin:0;background:#fff;border-radius:10px;padding:8px;display:grid;grid-template-columns:1fr 1fr;gap:6px}"
        "img{width:100%;aspect-ratio:1;object-fit:contain;border-radius:6px}"
        ".cut{background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/16px 16px}"
        "figcaption{grid-column:1/-1;color:#444}.err{color:#b00;font-size:11px}"
        f"</style><main>{tiles}</main>"
    )
    return page


def main() -> None:
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    search_url, endpoint, out = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    model = sys.argv[4] if len(sys.argv) > 4 else None
    key = os.environ.get("CONTEXT_DEV_API_KEY") or sys.exit("CONTEXT_DEV_API_KEY not set (source ../.env)")
    out.mkdir(parents=True, exist_ok=True)
    items = scrape_listings(search_url, key)
    print(f"scraped {len(items)} listing photos")
    with ThreadPoolExecutor(WORKERS) as pool:
        done = list(pool.map(lambda a: cut_one(endpoint, model, a[1], out, a[0]), enumerate(items)))
    print(f"cut {sum('png' in d for d in done)}/{len(done)} -> {write_grid(done, out)}")


if __name__ == "__main__":
    main()
