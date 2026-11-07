# Sightline: project context

A handoff for a person or an AI agent picking this up. The status below is as of Nov 7, 2026.

## The event and the brief

**Event:** "Ship Happens: A Seldon Hackathon", Sat Nov 7 2026 (10 AM–8 PM, SF).
- **Brief:** pick a subscription you'd like to stop paying for and build its replacement in a day.
- **Judges:** from OpenAI, Amazon Lab126 and PayPal.
- **Prizes:** best overall, most original reinvention, people's choice.
- **To qualify:** a working product, plus test results from **Wren** (Seldon's AI browser QA agent) for 2 core workflows, rerun on the final build.

## The idea

Sightline replaces **Percy, Chromatic and Applitools**, which are paid visual regression testing tools.
They screenshot your site on every build and diff it against an approved baseline.

**The problem:** plain pixel diffing flags everything that moves.
- One new banner turns the whole page red.
- Clocks, ads, counters and A/B slots fail every build.
- Teams end up approving diffs blindly.

**What Sightline does differently:** it diffs the **DOM as well as the pixels**, so it reports what actually changed in plain words:
- "Button background #4c6ef5 → #d9480f", grouped across 8 snapshots and reviewed once.
- "Banner added", with the 545 elements it pushed down counted as **one layout shift**, not 545 changes.
- "Image missing", "Button text changed", "Button moved 36px right", "Page width changed (content overflows)".

It also learns which content is dynamic by loading each page 2–3 times, so nobody has to draw ignore regions by hand.

## How it works (the pipeline)

1. **Capture.** Playwright and Chromium load the page with animations frozen, then scroll to trigger lazy images and wait for fonts. Each load produces a full-page screenshot plus a DOM snapshot of every painted element: rect, own text, src, background image, computed-style subset, a structural key (5 ancestors as tag#id.classes), and flags for fixed, dynamic/ad and shadow-DOM.
2. **Learn noise** (`learn_volatility`). The baseline loads 3 times and the candidate 2. Elements are marked dynamic, and ignored, when their content, style, pixels or existence differ between loads. The same goes for time-like text ("3 hours ago"), bare counters ("52"→"53"), ad slots, video, canvas and iframes.
3. **Match** (`match`). Elements are paired per structural key using difflib alignment on content, then renamed classes are re-paired by text, src or overlap.
4. **Classify** (`compare`). Each pair is checked for text, image (pixel-verified), style (with a property diff), resized, moved, added and removed. A paint check on otherwise unexplained elements catches pseudo-element and filter changes. Small font-metric width jitter is ignored.
5. **Attribute layout shifts.** Elements that move by the same vector are clustered and explained by one upstream change (a banner, a resize), and shown as an info note.
6. **Group.** The same change across pages and viewports becomes one review group. Style changes group by value delta; text, image and added/removed changes group by structural key.
7. **Review.** Approve or reject per group, per snapshot or per build. Approved snapshots become the new baseline, and reverting restores the old one.

## The build

| Part | Stack | Key files |
|---|---|---|
| API and jobs | FastAPI, asyncio background jobs, SQLite (WAL) | `backend/app/main.py`, `jobs.py`, `db.py` |
| Capture | Playwright async, one shared Chromium, 4 concurrent pages | `backend/app/capture.py` |
| Diff engine | NumPy, SciPy, difflib | `backend/app/engine.py` |
| Demo site | "Acme Supply" shop: v1, plus v2 with 5 planted regressions and live noise | `backend/app/demo.py` |
| Review UI | React 18, Vite, TypeScript, Tailwind v4 | `frontend/src/pages/*`, `frontend/src/review/*` |
| Benchmarks | Seeded bugs on live sites, plus real Wayback changes | `bench/mutations.py`, `bench/wayback.py`, `bench/summarize.py` |

**API contract:** `docs/API.md`.
- **Resources:** projects, runs (builds), snapshots, groups, changes and baselines.
- **Review endpoints:** `/api/runs|groups|snapshots/{id}/review` with `{status}`.
- **Demo:** `POST /api/demo` creates the demo project.

**UI:**
- Projects list, project page (builds and baselines), and the build review screen.
- The review screen has four viewer modes (side by side, overlay, swipe, single), a change-group list and a details panel. It also has toggles for ignored noise and for the **plain pixel diff**, which shows e.g. "12 regions → 2 real changes".
- Keyboard: J/K (groups), ←/→ (snapshots), A/R (approve/reject), 1–4 (view modes), N (noise), P (pixel diff), Z (zoom), D (details), ? (shortcut sheet).
- Elements carry `data-testid`s for Wren.

**Run:**
```bash
./run.sh            # http://127.0.0.1:8000 → "Try the demo"
./run.sh --public   # also opens a Cloudflare quick tunnel (public https URL)
backend/.venv/bin/python backend/smoke.py          # end-to-end demo test
backend/.venv/bin/python bench/mutations.py && python3 bench/summarize.py -v
```
- **Production build:** the frontend `dist/` is served by FastAPI.
- **Dev:** `cd frontend && pnpm dev` (proxies to :8000), or `pnpm dev:mock` with no backend.
- **Files:** data and snapshots live in `backend/data/` (gitignored). A `Dockerfile` exists but is untested.

## Results

**Demo (v1 → v2):** 6 groups, covering all 5 planted bugs and a real mobile overflow, with 0 false findings. Plain pixel diff gave 80 regions. The build takes about 4.6 s for 8 snapshots × 2 loads.

**Self-rebuilds** (a page diffed against itself; anything reported is noise):

| Page | Plain pixel diff | Sightline |
|---|---|---|
| Demo v2 (live clock, random counters, rotating quotes) | 24 regions | **0** |
| The Verge | 13 regions | **0** |
| Airbnb | 74 regions | 4 |

**Seeded-bug benchmark** (the WUICC-bench method):
- **Setup:** 15 live sites (Stripe, Vercel, Linear, GitHub, MDN, BBC, The Verge, Airbnb, Shopify, Figma, Tailwind, python.org, Python docs, HN, Wikipedia). 115 bug cases across 9 bug types, plus 14 no-change controls.

| | Plain pixel diff | Sightline |
|---|---|---|
| Bug found at the right spot | n/a | **87%** (labelled right 86%) |
| No-change page: false alarms | 5.7 regions, 64% of pages clean | **1.7, 79% clean** |
| Page with a bug: items to review | 43.6 regions | **8.0** |

- **By bug type:** banner and font size 100%, text color and text change 93%, hidden image 90%, remove 86%, move 83%, background color 77%, spacing 58%.
- **Speed:** the full benchmark (about 300 live page loads) runs in 8.5 min, about 1.7 s per page load at a concurrency of 4.

**Real changes (Wayback):** 8 pages are diffed between two Wayback Machine dates. These have no ground truth, so they show the review load rather than accuracy. python.org gave 54 changes in 27 groups, against 113 pixel regions. The full rerun on the latest engine was blocked by archive.org rate limits.

## Compared with Percy and Chromatic

- **No direct comparison yet.** They're paid cloud tools, so our baseline is a raw pixel diff, which is noisier than their tuned diff. To run one properly, use their free tiers (about 5k snapshots a month) on the same 15 sites.
- **Percy's paid AI review agent** claims "up to 40% of changes filtered as noise". That's the vendor's own claim, measured differently from ours.
- **What we have that they don't:** plain-language change labels, layout-shift attribution, dynamic content learned automatically, cross-page grouping, and it's self-hosted and free.
- **What they have that we don't:** Firefox, Safari and Edge, Storybook/component snapshots, CI and GitHub checks, test-framework SDKs, teams and auth, hosted scale, and changed-only reruns (Chromatic's TurboSnap).

## Known gaps and next steps

- **Weak spots:** spacing (58%) and background color (77%) detection. A section that gets pushed down is often explained away as a layout shift.
- **Remaining false alarms on live sites** mostly come from the site really changing between the baseline and the new capture, such as A/B tests and new content. On a staging app that doesn't change between captures, this should be lower, but that hasn't been measured.
- **Product gaps:** Chromium only, no auth, no CI integration or GitHub status check, and pages are capped at 8000px tall.
- **Security:** the public tunnel has no auth, so anyone with the URL can make the host machine screenshot any URL (SSRF). Share it only with the judges and Wren.
- **Hackathon QA (Seldon/Wren):** both workflows live in `seldon.yml` at the repo root.
  - **Workflow 1:** Try the demo → build against v2 → the regressions are listed.
  - **Workflow 2:** Approve all → the baselines move to build #2.
  - **Commands:** `seldon validate`, then `seldon run --url http://localhost:8000`. Each run costs one simulation per case.
  - **Repeatable:** every "Try the demo" click creates a fresh demo project at the v1 baseline, so the cases can run in parallel and be rerun.
  - **Queued builds:** builds of one project run in order, so a build started during the baseline capture waits for it.

## Repo

- **GitHub:** private repo `vincivv/sightline`.
- **About 4.2k lines** across the backend and the frontend.
