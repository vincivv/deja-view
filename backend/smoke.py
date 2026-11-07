"""End-to-end smoke test: demo baseline (v1) then a v2 build; prints what the engine found."""
import http.cookiejar, json, sys, time, urllib.request
API = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
_op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))   # keeps the guest session
def call(m, p, body=None):
    req = urllib.request.Request(API + p, method=m, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    return json.load(_op.open(req, timeout=60))
def wait(rid):
    t = time.time()
    while True:
        r = call("GET", f"/api/runs/{rid}")
        if r["status"] in ("done", "failed"): return r, time.time() - t
        time.sleep(0.5)
proj = call("POST", "/api/demo")
runs = call("GET", f"/api/projects/{proj['id']}/runs")
base, dt = wait(runs[-1]["id"])
print(f"baseline: {base['status']} {base['result']} {base['counts']['snapshots']} snaps in {dt:.1f}s",
      [s["error"] for s in base["snapshots"] if s["error"]])
v2 = [u["url"] for u in proj["demo_urls"] if "v2" in u["url"]][0]
run = call("POST", f"/api/projects/{proj['id']}/runs", {"base_url": v2, "label": "v2"})
d, dt = wait(run["id"])
c = d["counts"]
print(f"v2: {d['status']} {d['result']} in {dt:.1f}s | changes {c['changes']} groups {c['groups']} | pixel-diff regions {c['pixel_regions']} | ignored {c['noise_ignored']}")
for g in d["groups"]:
    print(f"  GROUP [{g['kind']}] {g['title']} — {g['detail']}  x{g['count']} pages={len(g['snapshot_ids'])}")
for s in d["snapshots"]:
    print(f"  {s['name']:8} {s['viewport']:5} {s['status']:9} changes={len(s['changes'])} pixel={len(s['pixel_diff']['regions'])} noise={len(s['noise_rects'])} shifts={[(x['dy'],x['elements'],bool(x['cause_change_id'])) for x in s['layout_shifts']]} {s['error'] or ''}")
    for ch in s["changes"]:
        print(f"       - {ch['kind']}: {ch['title']} | {ch['detail']} | {ch['selector']}")
