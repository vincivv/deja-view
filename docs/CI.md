# Sightline as a GitHub CI check: handoff

Built by Akmal and Claude on Nov 7, 2026, on branch `ci-github-check`. This is everything another agent needs to know.

## What exists

- **`ci/github-action/`** is a reusable composite action. It needs only Python and PyYAML.
  - **`sightline_check.py`:**
    - starts a build with `POST /api/projects/{id}/runs {base_url, label}` and polls `/api/runs/{id}/status`
    - fetches the groups and renders **one sticky PR comment** (hidden marker `<!-- sightline-check -->`), updated in place
    - sets a commit status with context `Sightline`
    - if the build has changes, it keeps polling (`timeout_minutes`, default 15), so **Approve/Reject in the Sightline UI flips the GitHub check live**
    - exit code: 0 for passed or approved; 1 for rejected, failed, unreachable, or a review timeout
    - `--dry-run` prints the GitHub calls instead of making them
  - **`wren_routing.py`** holds pure functions. A map file `.sightline/wren.yml` lists, for each Wren case, the page globs it touches. Changed or failed pages give the subset of cases to run ("3 of 6, about $9 instead of $18"). The script writes a filtered `seldon.yml` artifact. It runs `seldon run` only if a `seldon` binary is on PATH; otherwise it only recommends.
  - **`comment.py`** renders the comment. **`bootstrap_project.py`** creates a project and its first (baseline) build.
  - **`tests/`** has 27 unit tests using real API responses.
- **Backend (commit `cd71120`):** `POST /runs` accepts optional `headers`, sent on every capture request of that build only and never stored (e.g. `x-vercel-protection-bypass`). Small diff across `capture.py`, `jobs.py`, `main.py` and `docs/API.md`; it can be dropped if it conflicts.

## Live setup today: Akmal's real store, GEARGO

- **Repo:** `Akmalchan/GEARGO` (private, Next.js storefront on Vercel, team northblue-labs). A copy of the action lives in `.github/actions/sightline/`, with the workflow in `.github/workflows/sightline.yml`. Both were merged to GEARGO main via PR #103 (CI files only).
- **The workflow:**
  - triggers on `pull_request` and `workflow_dispatch` (input `pr`)
  - waits for the PR's Vercel preview: it walks the PR's commits newest first, looks up GitHub deployments with environment "Preview – geargo-storefront", needs state success, and skips "Deployment was cancelled" placeholders
  - then runs the action
- **Vercel Authentication was turned OFF** for geargo-storefront so previews are public. Turn it back on after the hackathon.
- **Repo settings:**
  - variables `SIGHTLINE_URL=https://lights-signal-kept-athens.trycloudflare.com` and `SIGHTLINE_PROJECT_ID=p_4ae6d6e53452`
  - secret `SIGHTLINE_TOKEN` (the "GEARGO CI" token on Dias's server, account test@test.com)
  - **If the tunnel URL changes, update the variable:** `gh variable set SIGHTLINE_URL -R Akmalchan/GEARGO -b <new url>`
- **Project on Dias's server:** "GEARGO", base https://geargo.uz, paths `/en`, `/en/shop`, `/en/categories/brakes`, `/en/products/flyree-fl2261-ceramic-brake-pads-byd-han`, `/en/cart`, viewports 1280 and 390. Build #1 is the baseline from geargo.uz.
- **Demo PR:** https://github.com/Akmalchan/GEARGO/pull/102, "Tidy up product and cart buttons". **Never merge it.**
  - Planted bugs: Add to cart turns orange, the product photo is hidden (`invisible`), the empty-cart button shifts (`ml-9`).
  - Build #2, review page `/builds/r_f97eaa96dedc`, found 12 items:
    - the planted button color and missing image
    - **a real bug:** the preview's cart shows "Cart could not load / Failed to fetch", probably because the store API's CORS only allows geargo.uz
    - noise from the live countdown "17 hrs 3 mins" (fixed on master in `f39b768`; rerun to confirm)
    - the button color shows as `lab(...)`, because the site's CSS uses lab colors. Converting lab to hex in the labels would be a nice polish.
  - Wren routing picked 3 of 6 cases: product-details, add-to-cart, cart-page.
- **To rerun the check on #102:** `gh workflow run Sightline -R Akmalchan/GEARGO -f pr=102`. It takes about 75 s once the preview exists, and a fresh PR needs about 1–3 min for the Vercel build first.
- **Timing:** Vercel build about 1–3 min, then Sightline about 75 s for 5 pages at 2 viewports.

## Pitch (full script in Akmal's notes)

"Wren tells you if your release broke. Sightline tells you what it changed, on every PR for about free, and tells Wren which tests to run (3 of 6)." Seldon is an ally: we make Wren affordable to run on every PR.

## Open items

- Merge `ci-github-check` into master after review. It merges cleanly as of `f39b768`.
- Optional: lab()/oklch() → hex in style-change labels; head-to-head benchmark vs Percy and Chromatic; "culprit search" (which commit in the PR caused the change).
- After the hackathon:
  - delete PR #102 and its branch
  - turn Vercel Authentication back on for geargo-storefront
  - rotate the GEARGO CI token
