"""Edge-case suite: content that changes between builds but stays the same between the loads of one build.

Each case is a small page rendered in two states: "a" (baseline build) and "b" (a later build).
Noise cases must report 0 changes; real cases must report at least 1.

    backend/.venv/bin/python backend/edgecases.py          # run all
    backend/.venv/bin/python backend/edgecases.py -v       # print what was reported
"""
import asyncio
import html
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).parent))
from app import engine  # noqa: E402
from app.capture import Capturer  # noqa: E402

# (case id, kind, state a, state b). Text is placed in a realistic block with static content around it.
TEXT_CASES = [
    # --- noise: time passes between builds ---
    ("countdown", "noise", "17 hrs 3 mins", "16 hrs 42 mins"),
    ("countdown-sentence", "noise", "Order within 17 hrs 3 mins for delivery tomorrow", "Order within 16 hrs 42 mins for delivery tomorrow"),
    ("countdown-compact", "noise", "Sale ends in 2d 14h 05m", "Sale ends in 2d 13h 41m"),
    ("countdown-clock", "noise", "Offer ends in 04:12:33", "Offer ends in 03:49:10"),
    ("relative-standalone", "noise", "5 min ago", "26 min ago"),
    ("relative-sentence", "noise", "Updated 3 minutes ago", "Updated 24 minutes ago"),
    ("relative-unit-change", "noise", "Synced 45 seconds ago", "Synced 2 hours ago"),
    ("relative-word", "noise", "Posted 3 hours ago by Priya", "Posted yesterday by Priya"),
    ("clock-sentence", "noise", "Last updated at 4:52 PM", "Last updated at 5:13 PM"),
    ("clock-24h", "noise", "Prices as of 16:52", "Prices as of 17:13"),
    ("date-long", "noise", "Saturday, November 7, 2026", "Sunday, November 8, 2026"),
    ("date-delivery", "noise", "Get it by Tue, Nov 10", "Get it by Wed, Nov 11"),
    ("date-dmy", "noise", "Arrives 10 November", "Arrives 11 November"),
    ("date-numeric", "noise", "Report generated 11/07/2026", "Report generated 11/08/2026"),
    ("date-iso", "noise", "Data as of 2026-11-07", "Data as of 2026-11-08"),
    ("day-word", "noise", "Order now, ships today", "Order now, ships tomorrow"),
    ("greeting", "noise", "Good morning, Dias", "Good afternoon, Dias"),
    ("viewers", "noise", "1,284 people are viewing this", "1,302 people are viewing this"),
    ("stock-left", "noise", "Only 3 left in stock", "Only 2 left in stock"),
    ("review-count", "noise", "4.8 (1,203 reviews)", "4.8 (1,211 reviews)"),
    ("stars", "noise", "12.4k stars", "12.5k stars"),
    ("sold", "noise", "2,318 sold this week", "2,341 sold this week"),
    ("online", "noise", "48 agents online now", "51 agents online now"),
    # --- real: must still be reported ---
    ("price", "real", "$49 / month", "$59 / month"),
    ("price-sentence", "real", "Free shipping on orders over $50", "Free shipping on orders over $75"),
    ("button-copy", "real", "Add to cart", "Buy now"),
    ("rating", "real", "Rated 4.8 out of 5", "Rated 4.1 out of 5"),
    ("version", "real", "Version 3.8 is here", "Version 3.9 is here"),
    ("phone", "real", "Call us: 555-0142", "Call us: 555-0199"),
    ("plan-limit", "real", "Up to 10 projects", "Up to 3 projects"),
    ("headline", "real", "Hear every customer", "Hear most customers"),
    ("discount", "real", "Save 20% with annual billing", "Save 10% with annual billing"),
]

PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>
body{{margin:0;font:16px/1.5 system-ui,sans-serif;color:#1a1813;background:#fbf9f4}}
header{{display:flex;justify-content:space-between;padding:20px 40px;border-bottom:1px solid #ddd}}
main{{max-width:960px;margin:40px auto;padding:0 40px}} h1{{font-size:40px;margin:0 0 12px}}
.card{{border:1px solid #ddd;border-radius:10px;padding:24px;background:#fff;margin:24px 0}}
.dyn{{font-weight:600}} .btn{{display:inline-block;padding:10px 18px;border-radius:8px;background:#1a1813;color:#fff}}
footer{{padding:40px;color:#888;border-top:1px solid #ddd}}</style></head><body>
<header><b>Acme</b><span>Product · Pricing · Docs</span></header>
<main><h1>{title}</h1><p>Static intro paragraph that never changes between builds.</p>
<div class="card"><p>Item details</p><p class="dyn" id="v">{value}</p><span class="btn">Continue</span></div>
<div class="card"><p>Another static block with a list.</p><ul><li>One</li><li>Two</li><li>Three</li></ul></div>
{extra}</main><footer>© 2026 Acme Inc.</footer>{script}</body></html>"""

# Sticky A/B test: a random variant is picked once per visitor and remembered (cookie / localStorage).
STICKY_JS = """<script>
(function(){
  var k='ab_hero', v=localStorage.getItem(k);
  if(!v){ v = Math.random() < 0.5 ? 'A' : 'B'; localStorage.setItem(k, v); }
  document.getElementById('v').textContent = v==='A' ? 'Start your free trial' : 'Try it free for 14 days';
  if(v==='B') document.querySelector('.btn').style.background = '#b4532a';
})();</script>"""
COOKIE_JS = """<script>
(function(){
  var m = document.cookie.match(/promo=(\\w)/), v = m && m[1];
  if(!v){ v = Math.random() < 0.5 ? 'x' : 'y'; document.cookie = 'promo=' + v + '; path=/'; }
  document.getElementById('v').textContent = v==='x' ? 'Spring sale: 20% off' : 'Free shipping this week';
})();</script>"""
# A "welcome back" banner only shown to returning visitors (first load sees no banner, later loads do).
RETURNING_JS = """<script>
(function(){
  if(localStorage.getItem('seen')){ var b=document.createElement('div'); b.className='card';
    b.textContent='Welcome back! Pick up where you left off.'; document.querySelector('main').prepend(b); }
  localStorage.setItem('seen','1');
})();</script>"""

SPECIAL_CASES = [  # (id, kind, script) — the page is identical in both states; only browser state differs
    ("sticky-ab-localstorage", "noise", STICKY_JS),
    ("sticky-ab-cookie", "noise", COOKIE_JS),
    ("returning-visitor", "noise", RETURNING_JS),
]


def render(case, state):
    for cid, _, a, b in TEXT_CASES:
        if cid == case:
            return PAGE.format(title="Edge case", value=html.escape(a if state == "a" else b), extra="", script="")
    for cid, _, js in SPECIAL_CASES:
        if cid == case:
            return PAGE.format(title="Edge case", value="…", extra="", script=js)
    return None


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        body = render(u.path.strip("/"), q.get("s", ["a"])[0])
        self.send_response(200 if body else 404)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write((body or "not found").encode())

    def log_message(self, *a):
        pass


def changes_for(base_loads, cand_loads):
    b_img, b_dom = base_loads[0]
    b_vol, _ = engine.learn_volatility(base_loads)
    res = engine.compare(b_img, b_dom, b_vol, cand_loads)
    return [c for c in res["changes"] if c["kind"] != "info"]


async def main(verbose=False):
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    root = f"http://127.0.0.1:{srv.server_address[1]}"
    cap = Capturer(concurrency=4)
    cases = [(c[0], c[1]) for c in TEXT_CASES] + [(c[0], c[1]) for c in SPECIAL_CASES]

    async def run(cid, kind):
        # sticky cases: run several baseline/candidate pairs, since a random variant can repeat by chance
        tries = 2 if cid.startswith(("sticky", "returning")) else 1
        reported = []
        for _ in range(tries):
            base = await cap.capture(f"{root}/{cid}?s=a", 1280, 3)
            cand = await cap.capture(f"{root}/{cid}?s=b", 1280, 2)
            ch = changes_for(base, cand)
            if ch:
                reported = ch
                break
        ok = (not reported) if kind == "noise" else bool(reported)
        return cid, kind, ok, reported

    results = await asyncio.gather(*(run(c, k) for c, k in cases))
    await cap.close()
    srv.shutdown()

    fails = 0
    for cid, kind, ok, reported in results:
        fails += not ok
        mark = "PASS" if ok else "FAIL"
        what = "; ".join(f'{c["title"]}: {c.get("detail", "")}' for c in reported[:3])
        if verbose or not ok:
            print(f"{mark}  {kind:5}  {cid:24} {what}")
    n_noise = sum(1 for _, k, _, _ in results if k == "noise")
    ok_noise = sum(1 for _, k, ok, _ in results if k == "noise" and ok)
    ok_real = sum(1 for _, k, ok, _ in results if k == "real" and ok)
    print(f"\nnoise ignored: {ok_noise}/{n_noise}   real changes reported: {ok_real}/{len(results) - n_noise}")
    return fails


if __name__ == "__main__":
    sys.exit(1 if asyncio.run(main("-v" in sys.argv)) else 0)
