"""False-alarm check on live sites: baseline build, then an identical rebuild. Ideally reports nothing."""
import json, sys, time, urllib.request
API = "http://127.0.0.1:8000"
def call(m, p, body=None):
    req = urllib.request.Request(API + p, method=m, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=120))
def wait(rid):
    while True:
        r = call("GET", f"/api/runs/{rid}")
        if r["status"] in ("done", "failed"): return r
        time.sleep(1)
for site in sys.argv[1:]:
    p = call("POST", "/api/projects", {"name": site, "base_url": site, "paths": ["/"], "viewports": [1280]})
    t = time.time(); b = wait(call("POST", f"/api/projects/{p['id']}/runs", {})["id"]); tb = time.time() - t
    t = time.time(); r = wait(call("POST", f"/api/projects/{p['id']}/runs", {})["id"]); tr = time.time() - t
    s = r["snapshots"][0]
    print(f"{site:32} base {tb:4.1f}s rerun {tr:4.1f}s | pixel-diff regions {len(s['pixel_diff']['regions']):3} | ours {len(s['changes'])} | {s['error'] or ''}")
    for ch in s["changes"][:4]:
        print("     -", ch["kind"], ch["title"], "|", ch["detail"][:70], "|", ch["selector"])
