"""Accounts end-to-end: guest demo, signup upgrade, isolation between accounts, CI token flow."""
import json, sys, time, urllib.request, urllib.error, http.cookiejar, uuid
API = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"

class Client:
    def __init__(self):
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def call(self, m, p, body=None, token=None):
        h = {"Content-Type": "application/json"}
        if token: h["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(API + p, method=m, data=json.dumps(body).encode() if body is not None else None, headers=h)
        try:
            r = self.op.open(req, timeout=60); return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

ok = lambda c, msg: print(("PASS " if c else "FAIL ") + msg) or c
a, b, anon = Client(), Client(), Client()
results = []
results.append(ok(anon.call("GET", "/api/projects")[0] == 401, "signed-out /api/projects is 401"))
st, demo = a.call("POST", "/api/demo"); results.append(ok(st == 200 and demo["is_demo"], "guest can start the demo without an account"))
st, me = a.call("GET", "/api/auth/me"); results.append(ok(st == 200 and me["is_guest"], "guest session is set"))
email = f"t{uuid.uuid4().hex[:6]}@example.com"
st, me = a.call("POST", "/api/auth/signup", {"email": email, "password": "correct horse"})
results.append(ok(st == 200 and not me["is_guest"], "signup upgrades the guest in place"))
st, ps = a.call("GET", "/api/projects"); results.append(ok(any(p["id"] == demo["id"] for p in ps), "demo project carried over to the account"))
results.append(ok(a.call("POST", "/api/auth/signup", {"email": email, "password": "x" * 9})[0] == 409, "duplicate email is 409"))
results.append(ok(b.call("POST", "/api/auth/signup", {"email": "b" + email, "password": "short"})[0] == 422, "short password is 422"))
b.call("POST", "/api/auth/signup", {"email": "b" + email, "password": "another pass"})
results.append(ok(b.call("GET", f"/api/projects/{demo['id']}")[0] == 404, "another account gets 404 for A's project"))
runs = a.call("GET", f"/api/projects/{demo['id']}/runs")[1]
results.append(ok(b.call("GET", f"/api/runs/{runs[0]['id']}")[0] == 404, "another account gets 404 for A's build"))
results.append(ok(all(p["id"] != demo["id"] for p in b.call("GET", "/api/projects")[1]), "A's project not in B's list"))
st, tok = a.call("POST", "/api/tokens", {"name": "GitHub Actions"}); results.append(ok(st == 200 and tok["token"].startswith("sl_"), "API token created"))
ci = Client()
st, ps = ci.call("GET", "/api/projects", token=tok["token"]); results.append(ok(st == 200 and any(p["id"] == demo["id"] for p in ps), "bearer token lists the account's projects"))
v2 = [u["url"] for u in demo["demo_urls"] if "v2" in u["url"]][0]
st, run = ci.call("POST", f"/api/projects/{demo['id']}/runs", {"base_url": v2, "label": "PR #1"}, token=tok["token"])
results.append(ok(st == 200, "bearer token starts a build"))
t = time.time()
while True:
    st, s = ci.call("GET", f"/api/runs/{run['id']}/status", token=tok["token"])
    if s.get("status") in ("done", "failed") or time.time() - t > 90: break
    time.sleep(1)
results.append(ok(s.get("result") == "changes" and s["counts"]["groups"] == 6, f"CI status: {s.get('status')} {s.get('result')} groups={s.get('counts', {}).get('groups')} url={s.get('url')}"))
results.append(ok(ci.call("GET", "/api/projects", token="sl_wrong")[0] == 401, "bad token is 401"))
lst = a.call("GET", "/api/tokens")[1]; results.append(ok(len(lst) == 1 and "token" not in lst[0], "token list hides the secret"))
a.call("DELETE", f"/api/tokens/{tok['id']}")
results.append(ok(ci.call("GET", "/api/projects", token=tok["token"])[0] == 401, "revoked token is 401"))
a.call("POST", "/api/auth/logout"); results.append(ok(a.call("GET", "/api/projects")[0] == 401, "logout ends the session"))
results.append(ok(a.call("POST", "/api/auth/login", {"email": email, "password": "nope nope"})[0] == 401, "wrong password is 401"))
results.append(ok(a.call("POST", "/api/auth/login", {"email": email, "password": "correct horse"})[0] == 200, "login works"))
results.append(ok(a.call("DELETE", f"/api/projects/{demo['id']}")[0] == 200 and a.call("GET", f"/api/projects/{demo['id']}")[0] == 404, "owner can delete a project"))
print(f"\n{sum(results)}/{len(results)} passed")
