"""Turns the source spreadsheet (AGORA-European-Secondhand-Sources.xlsx) into shelf/sources.json for the source picker.

Run: python3 sources.py path/to/sources.xlsx      (if Homebrew's Python cannot load expat, use /usr/bin/python3)
Sheet layout: a header row starting with "Source", then one row per source. Stdlib only: an .xlsx is a zip of XML.
"""
import json, os, re, sys, urllib.parse, zipfile
import xml.etree.ElementTree as ET

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shelf", "sources.json")
FIELDS = {"Source": "name", "Market or coverage": "market", "Group": "group", "Type": "type", "Used categories": "cats", "Shopping site": "url"}


def sheet_rows(path):
    """First sheet as lists of cell texts, in column order."""
    with zipfile.ZipFile(path) as z:
        shared = ["".join(t.text or "" for t in si.iter(M + "t")) for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(M + "si")] \
            if "xl/sharedStrings.xml" in z.namelist() else []
        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
    for row in sheet.iter(M + "row"):
        cells = {}
        for c in row.iter(M + "c"):
            v = c.find(M + "v")
            text = "".join(t.text or "" for t in c.iter(M + "t")) if c.get("t") == "inlineStr" else (v.text or "") if v is not None else ""
            cells[re.match(r"[A-Z]+", c.get("r")).group()] = shared[int(text)] if c.get("t") == "s" and text else text
        yield cells


def sources(path):
    """The spreadsheet is someone's file: keep rows with a name and an https site, cut every text to a sane length."""
    rows, head = [], None
    for cells in sheet_rows(path):
        if head is None:
            head = {col: FIELDS[v] for col, v in cells.items() if v in FIELDS} if "Source" in cells.values() else None
            continue
        r = {key: " ".join(cells.get(col, "").split())[:120] for col, key in head.items()}
        u = urllib.parse.urlsplit(r.get("url", ""))
        if r.get("name") and u.scheme == "https" and u.hostname and "." in u.hostname:
            rows.append({**r, "domain": u.hostname.lower().removeprefix("www.")})
    return rows


if __name__ == "__main__":
    found = sources(sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__))
    assert found and all(re.fullmatch(r"[a-z0-9.-]+", s["domain"]) for s in found), "no usable rows: is this the sources sheet?"
    with open(OUT, "w") as f:
        json.dump(found, f, ensure_ascii=False, indent=0)
    print(f"{len(found)} sources, {len({s['domain'] for s in found})} domains, {len({s['group'] for s in found})} groups -> {OUT}")
