"""Run the Reddit prompts through the running prototype and save what came back. python3 run_eval.py [llm]"""
import json, sys, time, urllib.request
LLM = sys.argv[1] if len(sys.argv) > 1 else "deepseek"
prompts = json.load(open("reddit_prompts.json")); out = []
for p in prompts:
    t = time.time(); r = {"id": p["id"], "prompt": p["prompt"], "expect": p["expect"], "reads": [], "model_secs": 0, "cards": [], "rejected": [], "answer": "", "error": ""}
    req = urllib.request.Request("http://localhost:8000/ask", data=json.dumps({"messages": [{"role": "user", "text": p["prompt"][:500]}], "llm": LLM}).encode())
    try:
        for line in urllib.request.urlopen(req, timeout=300):
            e = json.loads(line)
            if e["type"] == "done": r["reads"].append({"site": e["site"], "query": e.get("query"), "ok": e["ok"], "secs": e.get("secs"), "note": e.get("note", "")})
            elif e["type"] == "g_done": r["model_secs"] += e.get("secs") or 0
            elif e["type"] == "judge": r["judge"] = {k: e.get(k) for k in ("ok", "secs", "counts", "note")}; r["rejected"] = e.get("rejected", [])
            elif e["type"] == "listings":
                r["cards"] = [{k: c.get(k) for k in ("title", "price", "currency", "site", "country", "kind", "verdict", "verdict_confidence", "url")} | {"photo": bool(c.get("image"))} for c in e["items"]]
                r["answer"] = e["verdict"]; r["link_not_found"] = len(e["dropped"]); r["personalized_by"] = e["personalized_by"]
            elif e["type"] == "answer": r["answer"] = e["text"]
            elif e["type"] == "error": r["error"] = e["text"]
    except Exception as x:
        r["error"] = str(x)
    r["total_secs"] = round(time.time() - t, 1); out.append(r)
    ex = sum(1 for c in r["cards"] if c["verdict"] == "exact")
    print(f"{p['id']:18} {r['total_secs']:>6}s reads {len(r['reads'])} (failed {sum(1 for x in r['reads'] if not x['ok'])}) cards {len(r['cards'])} exact {ex} rejected {len(r['rejected'])} {'ERROR '+r['error'][:80] if r['error'] else ''}", flush=True)
    json.dump(out, open(f"results_{LLM}.json", "w"), ensure_ascii=False, indent=1)
    time.sleep(max(0, len(r["reads"]) * 6.5 - r["total_secs"]))  # stay under 10 Context.dev reads per minute
