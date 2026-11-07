# Sightline

Visual regression testing that understands the page: you review real changes, not rendering noise.
It's a replacement for Percy, Chromatic and Applitools, built at the Seldon "Ship Happens" hackathon (Nov 7, 2026).

Plain pixel diff flags everything that moved: a new banner turns the whole page red, and so do clocks, ads and rotating content.
Sightline matches DOM elements between the baseline and the new build, so it reports changes like these:

- *Button background changed #4c6ef5 → #d9480f* on 8 snapshots, reviewed once
- *Banner added*, with the 17 elements it pushed down counted as **one layout shift** rather than 17 changes
- *Image missing*, *Button text changed*, *Button moved 36px right*, *Page width changed (content overflows)*

## Measured

| | Plain pixel diff | Sightline |
|---|---|---|
| Built-in demo, v1 → v2 (5 planted regressions, 8 snapshots) | 80 regions | **6 groups: all 5 regressions, 0 false** |
| Demo v2 rebuilt against itself (live clock, random counters, rotating quotes) | 24 regions | **0** |
| theverge.com rebuilt against itself | 13 regions | **0** |
| airbnb.com rebuilt against itself | 74 regions | 4 |
| vercel.com, bbc.com, wikipedia.org, linear.app rebuilt | 0 | 0 |

Speed: the demo build (8 snapshots × 2 loads) finishes in about 4.6 s on an M2.

## How it works

1. **Capture**: Playwright and Chromium, with animations frozen, fonts and lazy images settled, and a full-page screenshot plus a DOM snapshot of every painted element (rect, text, src, computed style).
2. **Learn noise**: each page loads 2–3 times. Elements whose content, structure or pixels differ between loads are dynamic (clocks, ads, A/B slots, shadow-DOM widgets, relative timestamps) and are ignored. That knowledge carries forward with the baseline.
3. **Match**: elements are paired by structural key and aligned by content, with renamed classes re-paired by text, src or position.
4. **Classify**: each pair is checked for text, image, style (with a property diff), resized, added, removed and moved. A paint check on unexplained containers catches pseudo-element and filter changes.
5. **Attribute layout shifts**: elements that move together are explained by one upstream change, and appear as an info note rather than as review items.
6. **Group**: the same change across pages and viewports is reviewed once. Approving makes those snapshots the new baseline.

## Run

```bash
./run.sh            # http://127.0.0.1:8000 → "Try the demo"
./run.sh --public   # also prints a public https://*.trycloudflare.com URL
```

- **Dev:** `cd frontend && pnpm dev`, which proxies to the API on :8000.
- **API contract:** `docs/API.md`.
- **Smoke test:** `backend/.venv/bin/python backend/smoke.py`.

**Stack:** FastAPI, Playwright, NumPy and SciPy, with SQLite (WAL) on the backend. The frontend is React, Vite and Tailwind.
