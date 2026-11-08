"""Change-aware Wren routing: pick the Seldon/Wren test cases that touch the pages a Sightline build changed.

Pure functions only (no I/O), so they are easy to unit test. The mapping lives in the target repo,
by default at `.sightline/wren.yml`:

    seldon: seldon.yml          # the Seldon test file, relative to the repo root
    unmapped: run               # cases with no entry below: "run" (safe default) or "skip"
    price_per_run: 3            # USD per Wren run, only used for the cost line in the PR comment
    cases:
      product-add-to-cart:
        pages: ["/product", "/cart"]   # page paths the flow visits; glob patterns like "/docs/*" work
      smoke-home:
        pages: ["/"]
        always: true                   # run even when nothing visual changed
"""
from __future__ import annotations

import copy
import shlex
from fnmatch import fnmatchcase
from urllib.parse import urlsplit

AFFECTING = ("changed", "failed")   # snapshot statuses that make a page "affected"


def norm_path(p: str) -> str:
    """'/product/', 'product', 'https://x.dev/product?a=1' -> '/product'; '' -> '/'."""
    p = (p or "").strip()
    if "://" in p:
        p = urlsplit(p).path
    p = p.split("?", 1)[0].split("#", 1)[0]
    if not p.startswith("/"):
        p = "/" + p
    if len(p) > 1:
        p = p.rstrip("/") or "/"
    return p


def page_matches(pattern: str, path: str) -> bool:
    pat, path = norm_path(pattern), norm_path(path)
    if any(c in pat for c in "*?["):
        return fnmatchcase(path, pat)
    return pat == path


def affected_pages(run: dict) -> dict[str, dict]:
    """Pages a build changed, from a RunDetail: {path: {name, viewports, statuses, changes}}.

    A page is affected when any of its snapshots changed or failed to capture. Pages that are `new`
    (no baseline yet) only count on a non-baseline build, since a baseline build captures everything as new.
    """
    statuses = AFFECTING + (() if run.get("is_baseline_build") else ("new",))
    titles = {c["id"]: c["title"] for s in run.get("snapshots", []) for c in s.get("changes", [])}
    out: dict[str, dict] = {}
    for s in run.get("snapshots", []):
        if s.get("status") not in statuses:
            continue
        pg = out.setdefault(norm_path(s["path"]), {"name": s.get("name") or s["path"], "viewports": [],
                                                   "statuses": [], "changes": []})
        if s.get("viewport") not in pg["viewports"]:
            pg["viewports"].append(s.get("viewport"))
        if s["status"] not in pg["statuses"]:
            pg["statuses"].append(s["status"])
        for c in s.get("changes", []):
            t = titles.get(c["id"], c.get("title"))
            if t not in pg["changes"]:
                pg["changes"].append(t)
    return out


def route(cases: list[dict], mapping: dict | None, changed_paths, result: str) -> dict:
    """Decide which Wren cases to run.

    cases: the `testCases` list from seldon.yml (each has `id`, `name`).
    mapping: the parsed wren.yml (may be None: then every case is unmapped).
    changed_paths: the affected page paths of the build.
    result: the Sightline build result (passed | changes | approved | rejected | failed).

    Returns {"selected": [...], "skipped": [...], "total": n, "mode": str, "reason": str} where every
    entry is {"id", "name", "pages", "matched", "why"}.
    """
    mapping = mapping or {}
    cmap = mapping.get("cases") or {}
    unmapped_policy = str(mapping.get("unmapped", "run")).lower()
    changed = sorted({norm_path(p) for p in changed_paths})
    selected, skipped = [], []

    if result == "failed":
        mode, reason = "all", "Sightline could not capture this build, so every case is recommended."
    elif not changed:
        mode, reason = "none", "No page changed visually."
    else:
        mode, reason = "changes", f"{len(changed)} page{'s' if len(changed) != 1 else ''} changed."

    for case in cases:
        cid = str(case.get("id") or case.get("name"))
        entry = cmap.get(cid)
        pages = [norm_path(p) for p in (entry or {}).get("pages", [])]
        item = {"id": cid, "name": case.get("name", cid), "pages": pages, "matched": [], "why": ""}
        if mode == "all":
            item["why"] = "build failed"
            selected.append(item)
            continue
        if entry is None:
            if unmapped_policy == "skip":
                item["why"] = "not mapped in wren.yml"
                skipped.append(item)
            else:
                item["why"] = "not mapped in wren.yml, run to be safe"
                selected.append(item)
            continue
        item["matched"] = [p for p in changed if any(page_matches(pat, p) for pat in pages)]
        if item["matched"]:
            item["why"] = "touches " + ", ".join(item["matched"])
            selected.append(item)
        elif entry.get("always"):
            item["why"] = "marked always"
            selected.append(item)
        else:
            item["why"] = "its pages did not change"
            skipped.append(item)
    return {"selected": selected, "skipped": skipped, "total": len(cases), "mode": mode, "reason": reason,
            "changed_paths": changed}


def filter_seldon(doc: dict, case_ids) -> dict:
    """A copy of a parsed seldon.yml that keeps only `case_ids` (in the original order)."""
    keep = set(case_ids)
    out = copy.deepcopy(doc)
    out["testCases"] = [c for c in doc.get("testCases", []) if str(c.get("id") or c.get("name")) in keep]
    return out


def seldon_command(preview_url: str, workdir: str) -> str:
    """The Seldon CLI reads seldon.yml from the current directory, so run it from the folder holding the filtered file."""
    return f"cd {shlex.quote(workdir)} && seldon run --url {shlex.quote(preview_url)}"
