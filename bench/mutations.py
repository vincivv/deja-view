"""Seeded-mutation benchmark on live websites.

For each site: capture a baseline (3 loads), an unmodified control (2 loads), then one candidate per mutation
operator (2 loads each, the same mutation applied after the page settles). Ground truth is the mutated element,
so we can score Sightline's report: was the change found, was it labelled right, and how many unrelated changes
(false alarms) were reported. Plain pixel diff is scored on the same pages for comparison.

Run:  backend/.venv/bin/python bench/mutations.py [site ...]
"""
import asyncio, json, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.capture import Capturer          # noqa: E402
from app import engine                    # noqa: E402

SITES = ["https://en.wikipedia.org/wiki/Visual_regression_testing", "https://www.python.org", "https://developer.mozilla.org/en-US/",
         "https://stripe.com", "https://vercel.com", "https://linear.app", "https://www.bbc.com", "https://www.theverge.com",
         "https://www.airbnb.com", "https://www.shopify.com", "https://www.figma.com", "https://tailwindcss.com",
         "https://docs.python.org/3/", "https://news.ycombinator.com", "https://github.com/pricing"]
OPS = ["text_color", "bg_color", "font_size", "hide_image", "text_change", "banner", "spacing", "move", "remove"]
EXPECT = {"text_color": {"style"}, "bg_color": {"style"}, "font_size": {"style", "resized"}, "hide_image": {"removed"},
          "text_change": {"text"}, "banner": {"added"}, "spacing": {"moved", "resized"}, "move": {"moved"},
          "remove": {"removed"}}
W = 1280

MUTATE = r"""(() => {
 const OP = "%OP%";
 const fixedAnc = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
 const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0.1; };
 const dr = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left + scrollX), Math.round(r.top + scrollY), Math.round(r.right + scrollX), Math.round(r.bottom + scrollY)]; };
 const pick = (sel, minA, maxA, extra) => { const c = [...document.querySelectorAll(sel)].filter(e => { if (!vis(e)) return false; const r = dr(e); const a = (r[2]-r[0])*(r[3]-r[1]);
   return a >= minA && a <= maxA && r[1] >= 150 && r[3] <= 3500 && r[0] >= 0 && r[2] <= document.documentElement.clientWidth + 2 && !fixedAnc(e) && (!extra || extra(e)); });
   return c.length ? c[Math.floor(c.length / 3)] : null; };
 const leaf = (e) => e.children.length === 0 && e.textContent.trim().length >= 3;
 let el = null, pre = null;
 if (OP === 'none') return { op: OP, none: true };
 if (OP === 'text_color') { el = pick('a,button,h2,h3,p', 300, 200000, leaf); if (el) { pre = dr(el); el.style.setProperty('color', '#e8590c', 'important'); } }
 if (OP === 'bg_color') { el = pick('button,a,[class*="btn"],[class*="button"],[class*="card"],section,div', 800, 400000, e => { const b = getComputedStyle(e).backgroundColor; return b && b !== 'transparent' && !/rgba\(\d+, \d+, \d+, 0\)/.test(b); }); if (el) { pre = dr(el); el.style.setProperty('background-color', '#ffe066', 'important'); } }
 if (OP === 'font_size') { el = pick('h1,h2,h3', 1500, 400000, e => e.textContent.trim().length > 2); if (el) { pre = dr(el); el.style.setProperty('font-size', (parseFloat(getComputedStyle(el).fontSize) * 1.25) + 'px', 'important'); } }
 if (OP === 'hide_image') { el = pick('img,svg,picture', 2500, 600000); if (el) { pre = dr(el); el.style.setProperty('visibility', 'hidden', 'important'); } }
 if (OP === 'text_change') { el = pick('a,button,h2,h3,p,span', 400, 200000, leaf); if (el) { pre = dr(el); el.textContent = 'Totally different words here'; } }
 if (OP === 'banner') { el = document.createElement('div'); el.style.cssText = 'display:block;position:relative;height:64px;background:#1c7ed6;color:#fff;font:600 18px sans-serif;line-height:64px;text-align:center;z-index:1;margin:0'; el.textContent = 'Black Friday: 30% off everything'; document.body.prepend(el); }
 if (OP === 'spacing') { el = pick('section,article,main > div,footer', 30000, 4000000); if (el) { pre = dr(el); el.style.setProperty('margin-top', ((parseFloat(getComputedStyle(el).marginTop) || 0) + 48) + 'px', 'important'); } }
 if (OP === 'move') { el = pick('img,button,h1,h2,h3', 1500, 400000); if (el) { pre = dr(el); el.style.setProperty('transform', 'translate(30px,0px)', 'important'); } }
 if (OP === 'remove') { el = pick('p,li,a,button', 600, 200000, leaf); if (el) { pre = dr(el); el.style.setProperty('display', 'none', 'important'); } }
 if (!el) return { op: OP, skip: true };
 const post = (OP === 'remove' || OP === 'hide_image') ? null : dr(el);
 return { op: OP, pre, post, tag: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 40) };
})()"""


def hits(ch, info, pad=6):
    if info.get("pre") and ch["base_bbox"] and engine.overlaps(ch["base_bbox"], info["pre"], pad):
        return True
    return bool(info.get("post") and ch["bbox"] and engine.overlaps(ch["bbox"], info["post"], pad))


def region_hits(r, info, pad=6):
    return any(t and engine.overlaps(r, t, pad) for t in (info.get("pre"), info.get("post")))


async def run_site(cap, url):
    out = {"site": url, "cases": []}
    try:
        base = await cap.capture(url, W, 3)
        b_img, b_dom = base[0]
        b_vol, _ = engine.learn_volatility(base)
        for op in ["none"] + OPS:
            meta = {}
            t0 = time.time()
            try:
                loads = await cap.capture(url, W, 2, inject=MUTATE.replace("%OP%", op), meta=meta)
            except Exception as e:
                out["cases"].append({"op": op, "error": str(e)[:120]}); continue
            info = (meta.get("inject") or [{}])[0] or {}
            if info.get("skip"):
                out["cases"].append({"op": op, "skip": True}); continue
            res = await asyncio.to_thread(engine.compare, b_img, b_dom, b_vol, loads)
            chs = res["changes"]
            hit = [c for c in chs if hits(c, info)] if op != "none" else []
            false = [c for c in chs if c not in hit]
            pr = res["pixel_regions"]
            out["cases"].append({
                "op": op, "target": info, "secs": round(time.time() - t0, 1),
                "detected": bool(hit) if op != "none" else None,
                "label_ok": any(c["kind"] in EXPECT[op] for c in hit) if op != "none" else None,
                "hit_kinds": sorted({c["kind"] for c in hit}), "hits": len(hit), "hit_detail": [f'{c["kind"]}: {c["title"]} | {c["detail"][:50]}' for c in hit[:4]],
                "false_alarms": len(false), "false_detail": [f'{c["kind"]}: {c["title"]} | {c["detail"][:50]} | {c["selector"][:40]}' for c in false[:5]],
                "layout_shifts": len(res["layout_shifts"]),
                "pixel_regions": len(pr), "pixel_noise": sum(1 for r in pr if not region_hits(r, info)) if op != "none" else len(pr),
            })
    except Exception as e:
        out["error"] = str(e)[:200]
    print(f"done {url}: {sum(1 for c in out['cases'] if c.get('detected'))}/{sum(1 for c in out['cases'] if c.get('detected') is not None)} detected", flush=True)
    return out


async def main(sites):
    cap = Capturer(concurrency=4)
    t = time.time()
    results = await asyncio.gather(*(run_site(cap, s) for s in sites))
    await cap.close()
    (ROOT / "bench/results/mutations.json").write_text(json.dumps(results, indent=1))
    print(f"total {time.time() - t:.0f}s")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:] or SITES))
