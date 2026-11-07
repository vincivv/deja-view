# Sightline API contract

The backend is FastAPI on `http://127.0.0.1:8000`. All JSON lives under `/api`, and images are served under `/files/...`.
In production the backend also serves the built frontend (`frontend/dist`) at `/`.
Image URLs in responses are root-relative (`/files/...`), so the frontend can use them directly.

All coordinates are CSS pixels in **full-page screenshot space**: `[x1, y1, x2, y2]`.
`bbox` is in the *new* screenshot's space and `base_bbox` is in the *baseline* screenshot's space.

## Types

```ts
type Review = "pending" | "approved" | "rejected";
type RunStatus = "queued" | "capturing" | "diffing" | "done" | "failed";
type Rect = [number, number, number, number];

interface Project {
  id: string; name: string; base_url: string;
  paths: { path: string; name: string }[];
  viewports: number[];               // widths, e.g. [1280, 390]
  created_at: string;                // ISO
  is_demo: boolean;
  demo_urls?: { label: string; url: string }[];  // only for the demo project: quick-pick run targets
  baseline_count: number;
  last_run: RunSummary | null;
}

interface RunSummary {
  id: string; project_id: string; number: number;   // build #1, #2...
  label: string; base_url: string;
  status: RunStatus; error: string | null;
  created_at: string; finished_at: string | null; duration_ms: number | null;
  progress: { done: number; total: number };        // snapshots captured+diffed
  is_baseline_build: boolean;                        // first build: auto-accepted
  result: "passed" | "changes" | "approved" | "rejected" | "failed" | "running";
  counts: {
    snapshots: number; unchanged: number; changed: number; new: number; failed: number;
    changes: number; groups: number;
    noise_ignored: number;     // regions suppressed as rendering noise / dynamic content
    pixel_regions: number;     // what plain pixel diff would have flagged (for comparison)
  };
}

interface Change {
  id: string; snapshot_id: string; group_id: string;
  kind: "style" | "text" | "image" | "added" | "removed" | "moved" | "resized" | "visual";
  title: string;             // "Button color changed"
  detail: string;            // "color #333333 → #e00000"
  selector: string;          // "a.btn.cta"
  bbox: Rect | null;         // new screenshot (null for removed)
  base_bbox: Rect | null;    // baseline screenshot (null for added)
  before: string | null; after: string | null;
}

interface LayoutShift {      // informational, NOT a change to review
  dy: number; dx: number; from_y: number;   // content below from_y (baseline) moved by dy
  elements: number;                         // how many elements moved together
  cause_change_id: string | null;
}

interface Snapshot {
  id: string; run_id: string; path: string; name: string; viewport: number;
  status: "new" | "unchanged" | "changed" | "failed";
  review: Review | null;     // null when unchanged/new
  image_url: string; width: number; height: number;
  baseline_image_url: string | null; baseline_width: number | null; baseline_height: number | null;
  noise_rects: Rect[];       // ignored regions (new screenshot space)
  pixel_diff: { regions: Rect[]; pct: number; overlay_url: string | null };  // naive pixel diff, for comparison
  layout_shifts: LayoutShift[];
  changes: Change[];
  duration_ms: number | null; error: string | null;
}

interface Group {            // same cause across pages, reviewed together
  id: string; run_id: string; kind: Change["kind"];
  title: string; detail: string; selector: string;
  change_ids: string[]; snapshot_ids: string[]; count: number;
  review: Review;
}

interface RunDetail extends RunSummary {
  project: { id: string; name: string };
  snapshots: Snapshot[];
  groups: Group[];
}
```

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/health` | | `{ok: true}` |
| GET | `/api/projects` | | `Project[]` |
| POST | `/api/projects` | `{name, base_url, paths: string[] \| {path,name}[], viewports?: number[]}` | `Project` |
| GET | `/api/projects/{id}` | | `Project` |
| PATCH | `/api/projects/{id}` | any of `{name, base_url, paths, viewports}` | `Project` |
| DELETE | `/api/projects/{id}` | | `{ok: true}` |
| GET | `/api/projects/{id}/runs` | | `RunSummary[]` (newest first) |
| POST | `/api/projects/{id}/runs` | `{base_url?: string, label?: string}` | `RunSummary` (status `queued`) |
| GET | `/api/projects/{id}/baselines` | | `{path, name, viewport, image_url, run_id, updated_at}[]` |
| GET | `/api/runs/{id}` | | `RunDetail` |
| POST | `/api/runs/{id}/review` | `{status: "approved" \| "rejected"}` | `RunDetail` (applies to every pending group) |
| POST | `/api/groups/{id}/review` | `{status}` | `RunDetail` |
| POST | `/api/snapshots/{id}/review` | `{status}` | `RunDetail` (applies to that snapshot's changes' groups) |
| POST | `/api/demo` | | `Project` (creates or returns the demo project "Acme Store" and starts its baseline build) |

Errors return `{detail: string}` with 4xx/5xx.

## Behaviour

- **The first build** of a project has no baselines, so every snapshot is `new` and is auto-accepted as the baseline (`is_baseline_build: true`, `result: "passed"`).
- **Later builds** compare each page×viewport against its baseline:
  - `result` is `passed` when there are no changes, and `changes` while any group is pending.
  - It is `approved` once every group is approved, and `rejected` if any group is rejected.
- **Approving** every change in a snapshot makes it the new baseline for that page×viewport.
- **Polling:** the UI polls `GET /api/runs/{id}` about every 1 s while `status` is not `done` or `failed`.
- **The demo project** captures a built-in shop at `/demo/v1/...` (the baseline) and `/demo/v2/...` (with planted regressions plus live noise such as clocks and rotating content). `demo_urls` gives the two quick picks.

## Accounts, sessions and API tokens

Every project belongs to one account, and users only ever see their own projects.
Requests are authenticated in one of two ways:

- **Browser:** an httpOnly cookie `sl_session`, set by signup, login or the demo endpoint. The frontend needs to do nothing beyond `fetch` with default credentials (same origin).
- **CI and scripts:** `Authorization: Bearer sl_...`, using an API token created in Settings.

Without either, every `/api/projects*`, `/api/runs*`, `/api/groups*`, `/api/snapshots*` and `/api/tokens*` endpoint returns **401** with `{"detail": "Not signed in"}`.
A project, run, group or snapshot owned by another account returns **404**, never 403.
`/api/health`, `/api/auth/*`, `/api/demo`, `/demo/*` and `/files/*` stay public.

```ts
interface User {
  id: string;
  email: string | null;      // null for guests
  name: string;
  is_guest: boolean;         // true for the throwaway account "Try the demo" creates
  created_at: string;
}
interface ApiToken {
  id: string; name: string;
  prefix: string;            // first characters, for display: "sl_3fa9…"
  created_at: string; last_used_at: string | null;
}
```

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/auth/me` | — | `User`, or 401 |
| POST | `/api/auth/signup` | `{email, password, name?}` | `User` and sets the cookie. If the caller is a guest, the guest account is upgraded in place, so its demo projects carry over. 409 if the email is taken. 422 if the password is under 8 characters. |
| POST | `/api/auth/login` | `{email, password}` | `User` and sets the cookie. 401 `"Wrong email or password"`. |
| POST | `/api/auth/logout` | — | `{ok: true}` and clears the cookie |
| GET | `/api/tokens` | — | `ApiToken[]` |
| POST | `/api/tokens` | `{name}` | `ApiToken & {token: string}`. The full token is returned only this once. |
| DELETE | `/api/tokens/{id}` | — | `{ok: true}` |
| POST | `/api/demo` | — | `Project`. If the caller is not signed in, this first creates a **guest** account and sets its cookie, so "Try the demo" never needs a login. |

### CI usage

```bash
# start a build against a preview URL, wait for it, fail if there are unreviewed changes
curl -s -X POST "$SIGHTLINE_URL/api/projects/$PROJECT_ID/runs" \
  -H "Authorization: Bearer $SIGHTLINE_TOKEN" -H "Content-Type: application/json" \
  -d '{"base_url": "https://pr-123.preview.example.com", "label": "PR #123"}'
# → RunSummary {id, status: "queued", ...}; poll GET /api/runs/{id} until status is "done" or "failed"
# result: "passed" (no changes) | "changes" (needs review) | "approved" | "rejected" | "failed"
```

Also available: `GET /api/runs/{id}/status`, which returns a small `{id, number, status, result, counts, url}` for polling. `url` is the review page.
