"""Fetches each site's logo and brand colour from Context.dev's Brand API into shelf/brands.json for the site tiles.

Run: python3 brands.py     (10 credits per site that is not in the file yet)
"""
import json, os, re, sys, time, urllib.parse

import agora, wall

OUT = os.path.join(agora.HERE, "shelf", "brands.json")
HEX = re.compile(r"#[0-9a-fA-F]{6}")
GAP_S, RETRY_S = 7, 35  # the key allows 10 requests a minute across all endpoints


def brand(env, domain):
    """Returns {name, logo, color} for a domain, or None. The response is untrusted: only an https logo and a hex colour pass."""
    status, j = agora.post_json("https://api.context.dev/v1/brand/retrieve", {"type": "by_domain", "domain": domain,
                                "timeoutOpts": {"milliseconds": 60000, "behavior": "return-partial"}},
                                {"Authorization": "Bearer " + env["CONTEXT_DEV_API_KEY"]}, 75)
    b = j.get("brand") if isinstance(j, dict) and isinstance(j.get("brand"), dict) else None
    if not b:
        print(f"{domain}: HTTP {status} {str(j)[:120]}")
        return None
    logos = [l for l in b.get("logos") or [] if isinstance(l, dict) and wall.public_https(str(l.get("url") or ""))]
    icons = [l for l in logos if l.get("type") == "icon"] or logos
    colors = [c.get("hex") for c in b.get("colors") or [] if isinstance(c, dict) and HEX.fullmatch(str(c.get("hex") or ""))]
    return {"name": wall.text_of(b, "title", 40) or domain, "logo": icons[0]["url"] if icons else "", "color": colors[0] if colors else ""}


def main():
    env = agora.load_env()
    try:
        with open(OUT) as f:
            done = json.load(f)
    except (OSError, ValueError):
        done = {}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    for site, (_, _, url) in wall.SITES.items():
        if site in done:
            continue
        domain = (urllib.parse.urlsplit(url).hostname or "").removeprefix("www.").removeprefix("es.")
        found = brand(env, domain)
        if not found:  # most often the 10-requests-a-minute limit, shared with every search: wait it out once
            time.sleep(RETRY_S)
            found = brand(env, domain)
        if found:
            done = {**done, site: {"domain": domain, **found}}
            with open(OUT, "w") as f:
                json.dump(done, f, ensure_ascii=False, indent=1)
            print(site, found["name"], found["color"], bool(found["logo"]), flush=True)
        time.sleep(GAP_S)
    print(f"{len(done)} of {len(wall.SITES)} sites have a brand")


if __name__ == "__main__":
    main()
