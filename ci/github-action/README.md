# Sightline GitHub check

A composite action that runs Sightline on a pull request:

1. starts a build of the PR preview (`POST /api/projects/{id}/runs`) and waits for it,
2. posts **one sticky PR comment** (found again by a hidden marker) listing what changed in plain words, per page and viewport, with a link to the review page,
3. sets a **commit status** (`Sightline`): green for no changes, red while changes need review,
4. if there are changes, keeps polling: approving in Sightline flips the status green, rejecting flips it red, and the comment updates in place,
5. **routes Wren tests**: from `.sightline/wren.yml` (Wren case id → page paths) it picks the cases whose pages changed, writes a filtered `seldon.yml` (uploaded as the `sightline-wren` artifact), and prints the command. If a `seldon` binary is on PATH it runs them and adds the result.

It needs only the Python standard library and PyYAML.

```yaml
permissions: { contents: read, pull-requests: write, statuses: write }
steps:
  - uses: ./.github/actions/sightline        # a copy of this folder
    with:
      sightline_url: ${{ vars.SIGHTLINE_URL }}
      sightline_token: ${{ secrets.SIGHTLINE_TOKEN }}
      project_id: ${{ vars.SIGHTLINE_PROJECT_ID }}
      base_url: https://pr-123.preview.example.com
      # headers: ${{ secrets.SIGHTLINE_CAPTURE_HEADERS }}   # e.g. {"x-vercel-protection-bypass": "..."}
```

Inputs, outputs and defaults are in `action.yml`. Exit status: success for `passed` / `approved`; failure for `rejected`, `failed`, unreachable, or changes still pending at `timeout_minutes`.

`wren.yml`:

```yaml
seldon: seldon.yml       # relative to the repo root
unmapped: run            # cases not listed: run (safe default) or skip
price_per_run: 3         # for the cost line
cases:
  product-add-to-cart: { pages: ["/", "/product", "/cart"] }
  cart-checkout:       { pages: ["/cart"] }
```

A page counts as changed when any of its snapshots changed or failed to capture. A failed build recommends every case.

Create the project once (prints its id): `SIGHTLINE_TOKEN=sl_... python3 bootstrap_project.py --url <server> --name "My app" --paths / /pricing --baseline-url <main URL>`.

Local dry run (prints GitHub calls, writes the comment to a file): `python3 sightline_check.py --dry-run --comment-out c.md --url ... --token ... --project ... --base-url ... --pr 1`.

Tests: `python3 -m unittest discover -s ci/github-action/tests`.

The action lives in a private repo, so other repos can't `uses:` it directly: copy this folder into the target repo's `.github/actions/sightline/`.
