"""Fills shelf/ with real, colourful second-hand products for the start screen.

Run: python3 shelf.py      (one Context.dev read per missing query, 5 credits each, 4 a minute; needs macOS for the cutouts and ImageMagick)
Uses the same engine as the wall: Context.dev reads a search page, cutout.m lifts the object out of the photo.
Keeps the PER_QUERY most saturated cutouts of each query as shelf/NN.png and writes shelf/shelf.json for wall.html.
"""
import json, os, re, subprocess, sys, time

import agora, wall

OUT = os.path.join(agora.HERE, "shelf")
PER_QUERY = 3  # the most colourful ones of each query, so the shelf is a mix
SIZE = "320x320"
BATCH, PAUSE_S = 4, 62  # this Context.dev key allows 10 reads a minute
# ponytail: fixed list of colourful things; let DeepSeek invent queries if the shelf should change daily
QUERIES = [  # (site, query in the site's language, what a matching item is)
    ("ebay_de", "Espressomaschine rot", "red espresso machine"),
    ("ebay_de", "Retro Lampe orange", "orange retro lamp"),
    ("ebay_de", "Sneaker gelb", "yellow sneakers"),
    ("ebay_de", "Telefon Wählscheibe rot", "red rotary telephone"),
    ("ebay_de", "Toaster retro rosa", "pink retro toaster"),
    ("ebay_de", "Regenjacke gelb", "yellow raincoat"),
    ("ebay_de", "Sessel pink samt", "pink armchair"),
    ("ebay_de", "Vase grün vintage glas", "green vintage vase"),
    ("ebay_de", "Kofferradio rot", "red portable radio"),
    ("vinted", "sac à main rose", "pink handbag"),
    # things people actually search for, across sites
    ("kleinanzeigen", "VW Käfer", "Volkswagen Beetle car"),
    ("marktplaats", "Fiat 500", "Fiat 500 car"),
    ("marktplaats", "Vespa scooter", "Vespa scooter"),
    ("kleinanzeigen", "Rennrad", "road bicycle"),
    ("marktplaats", "bakfiets", "cargo bike"),
    ("ebay_de", "iPhone 15", "iPhone 15 phone"),
    ("ebay_de", "PlayStation 5", "PlayStation 5 console"),
    ("ebay_de", "Nintendo Switch", "Nintendo Switch console"),
    ("ebay_de", "E-Gitarre", "electric guitar"),
    ("ebay_de", "Lego Set", "Lego set"),
    ("ebay_de", "KitchenAid Küchenmaschine", "KitchenAid stand mixer"),
    ("ebay_de", "Plattenspieler", "record player"),
    ("ebay_de", "Skateboard", "skateboard"),
    ("ebay_de", "Kinderwagen", "baby stroller"),
    ("ebay_de", "Dyson Staubsauger", "Dyson vacuum cleaner"),
    ("ebay_de", "Sonnenbrille Ray-Ban", "Ray-Ban sunglasses"),
    ("tori", "sohva", "sofa"),
    ("blocket", "kamera", "camera"),
    ("ebay_de", "Surfbrett", "surfboard"),
    ("ebay_de", "Zimmerpflanze Monstera", "monstera house plant"),
]


def saturation(path):
    """Mean saturation 0..1 of the cutout, ignoring nothing: a rough 'how colourful' score."""
    done = subprocess.run(["magick", path, "-background", "white", "-alpha", "remove", "-colorspace", "HSL",
                           "-channel", "G", "-separate", "-format", "%[fx:mean]", "info:"], capture_output=True, text=True)
    try:
        return float(done.stdout)
    except ValueError:
        return 0.0


def harvest(env, site, query, product):
    if site not in wall.SITES:
        print(f"skip {site}: not a known site")
        return []
    s = {"site": site, "query": query, "country": wall.SITES[site][0], "kind": wall.SITES[site][1], "url": wall.site_url(site, query)}
    offers, log = wall.read_site(env, s, {"product": product, "condition": "any"})
    print(json.dumps(log, ensure_ascii=False))
    return [{**o, "query": query} for o in offers]


def cut_and_score(o, tmp):
    """Cuts one offer's photo into tmp. Returns its saturation, or None when no object could be lifted."""
    wall.ALLOWED_IMAGES.add(o["image"])
    try:
        ctype, data = wall.cut_image(o["image"], True)
    except (ValueError, OSError) as e:
        print(f"photo failed: {o['image'][:90]} {e}")
        return None
    if ctype != "image/png":  # a raw photo would show its background on the shelf
        return None
    with open(tmp, "wb") as f:
        f.write(data)
    return saturation(tmp)


def main():
    env = agora.load_env()
    if not wall.build_cutout():
        sys.exit("The cutout tool is not available (needs macOS 14+ and /usr/bin/clang).")
    os.makedirs(OUT, exist_ok=True)
    index = os.path.join(OUT, "shelf.json")
    try:
        with open(index) as f:
            items = [i for i in json.load(f) if isinstance(i, dict) and "query" in i]
    except (OSError, ValueError):
        items = []
    have = {i["query"] for i in items}
    todo = [q for q in QUERIES if q[1] not in have]  # a re-run only fetches what the shelf is missing
    print(f"{len(todo)} of {len(QUERIES)} queries to read", flush=True)
    for qi, (site, query, product) in enumerate(todo):
        if qi and qi % BATCH == 0:
            print(f"pausing {PAUSE_S}s for the read limit", flush=True)
            time.sleep(PAUSE_S)
        scored = []
        for k, o in enumerate(harvest(env, site, query, product)):
            tmp = os.path.join(OUT, f"tmp{k}.png")
            sat = cut_and_score(o, tmp)
            if sat is not None:
                scored.append((sat, tmp, o))
        scored.sort(key=lambda t: -t[0])
        fresh = []
        for n, (sat, tmp, o) in enumerate(scored[:PER_QUERY]):
            name = f"{re.sub(r'[^a-z0-9]+', '-', query.lower()).strip('-')}-{n}.png"
            subprocess.run(["magick", tmp, "-resize", SIZE, os.path.join(OUT, name)], check=True)
            fresh.append({"img": name, "query": query, "sat": round(sat, 3), **{k: o[k] for k in ("title", "price", "currency", "url", "site", "country")}})
        for _, tmp, _ in scored:
            os.remove(tmp)
        if fresh:  # a failed read keeps what the shelf already had for this query
            items = [i for i in items if i["query"] != query] + fresh
            with open(index, "w") as f:
                json.dump(items, f, ensure_ascii=False, indent=1)
    used = {i["img"] for i in items}
    for old in os.listdir(OUT):
        if old.endswith(".png") and old not in used:
            os.remove(os.path.join(OUT, old))
    print(f"{len(items)} products on the shelf in {OUT}")


if __name__ == "__main__":
    main()
