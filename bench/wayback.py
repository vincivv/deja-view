"""Real-world changes: the same page archived by the Wayback Machine on two dates (baseline = older).
No planted ground truth, so results are reviewed by eye: annotated images are written to bench/results/wayback/."""
import asyncio, json, sys, time
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.capture import Capturer   # noqa: E402
from app import engine             # noqa: E402

PAIRS = [("https://www.python.org/", "20250301", "20250601"),
         ("https://go.dev/", "20250201", "20250601"),
         ("https://htmx.org/", "20250101", "20250601"),
         ("https://www.djangoproject.com/", "20250301", "20250601"),
         ("https://tailwindcss.com/", "20250401", "20250601"),
         ("https://linear.app/pricing", "20250301", "20250601"),
         ("https://news.ycombinator.com/", "20250601", "20250602"),
         ("https://en.wikipedia.org/wiki/Main_Page", "20250601", "20250602")]
OUT = ROOT / "bench/results/wayback"
OUT.mkdir(parents=True, exist_ok=True)
COL = {"style": (124, 58, 237), "text": (37, 99, 235), "image": (8, 145, 178), "added": (22, 163, 74), "removed": (220, 38, 38),
       "moved": (234, 88, 12), "resized": (202, 138, 4), "visual": (219, 39, 119)}


def wb(url, ts):
    return f"https://web.archive.org/web/{ts}000000if_/{url}"


def annotate(img, changes, path, key="bbox"):
    im = Image.fromarray(img).convert("RGB")
    d = ImageDraw.Draw(im)
    for i, c in enumerate(changes):
        r = c[key]
        if r:
            d.rectangle(r, outline=COL.get(c["kind"], (0, 0, 0)), width=3)
            d.text((r[0] + 3, max(0, r[1] - 12)), f"{i + 1} {c['kind']}", fill=COL.get(c["kind"], (0, 0, 0)))
    im.thumbnail((900, 4000))
    im.save(path, quality=80)


async def retry(cap, u, tries=4):
    for i in range(tries):
        try:
            return await cap.capture(u, 1280, 2)
        except RuntimeError as e:
            if "429" not in str(e) or i == tries - 1:
                raise
            await asyncio.sleep(20 * (i + 1))


async def run(cap, url, a, b):
    t = time.time()
    try:
        base = await retry(cap, wb(url, a))
        cand = await retry(cap, wb(url, b))
        vol, _ = engine.learn_volatility(base)
        res = await asyncio.to_thread(engine.compare, base[0][0], base[0][1], vol, cand)
        name = url.split("//")[1].strip("/").replace("/", "_")
        annotate(cand[0][0], res["changes"], OUT / f"{name}_new.jpg")
        annotate(base[0][0], res["changes"], OUT / f"{name}_base.jpg", key="base_bbox")
        kinds = {}
        for c in res["changes"]:
            kinds[c["kind"]] = kinds.get(c["kind"], 0) + 1
        groups = len({c["sig"] for c in res["changes"]})
        out = {"url": url, "from": a, "to": b, "secs": round(time.time() - t, 1), "changes": len(res["changes"]), "groups": groups,
               "kinds": kinds, "layout_shifts": len(res["layout_shifts"]), "pixel_regions": len(res["pixel_regions"]),
               "pixel_pct": res["pixel_pct"], "sample": [f'{c["kind"]}: {c["title"]} | {c["detail"][:60]}' for c in res["changes"][:12]]}
    except Exception as e:
        out = {"url": url, "error": str(e)[:200]}
    print(json.dumps({k: out.get(k) for k in ("url", "changes", "groups", "pixel_regions", "error")}), flush=True)
    return out


async def main():
    cap = Capturer(concurrency=1)   # archive.org rate-limits parallel loads (HTTP 429)
    res = await asyncio.gather(*(run(cap, *p) for p in PAIRS))
    await cap.close()
    (ROOT / "bench/results/wayback.json").write_text(json.dumps(res, indent=1))


asyncio.run(main())
