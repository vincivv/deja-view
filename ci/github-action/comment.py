"""Render the sticky Sightline PR comment and the commit status text. Pure functions, no I/O."""
from __future__ import annotations

MARKER = "<!-- sightline-check -->"

KIND_ICON = {"style": "🎨", "text": "✏️", "image": "🖼️", "added": "➕", "removed": "➖", "moved": "↔️",
             "resized": "📐", "visual": "👁️"}
REVIEW_ICON = {"approved": "✅", "rejected": "❌", "pending": "⏳"}


def _plural(n, word, many=None):
    return f"{n} {word if n == 1 else (many or word + 's')}"


def _md(s) -> str:
    """Make text safe inside a markdown table cell."""
    return str(s or "").replace("|", "\\|").replace("\n", " ").strip()


def _where(group: dict, snaps: dict) -> str:
    names, vps = [], []
    for sid in group.get("snapshot_ids", []):
        s = snaps.get(sid)
        if not s:
            continue
        if s["name"] not in names:
            names.append(s["name"])
        if s["viewport"] not in vps:
            vps.append(s["viewport"])
    vp = " + ".join(f"{v}px" for v in sorted(vps, reverse=True))
    return f"{', '.join(names)} · {vp}" if names else ""


def pending_groups(run: dict | None):
    """How many review groups are still pending, or None when the build detail isn't known."""
    if not run or "groups" not in run:
        return None
    return sum(1 for g in run["groups"] if g.get("review", "pending") == "pending")


def _need_review(g, pending):
    if pending is not None and pending < g:
        return f"{pending} of {g} visual changes still need{'s' if pending == 1 else ''} review"
    return f"{_plural(g, 'visual change')} need{'s' if g == 1 else ''} review"


def headline(result: str, counts: dict | None, waiting: bool = False, error: str | None = None,
             pending: int | None = None) -> tuple[str, str]:
    """(icon, text) for the comment title."""
    c = counts or {}
    g = c.get("groups", 0)
    if result == "passed":
        return "✅", "Sightline: no visual changes"
    if result == "approved":
        return "✅", f"Sightline: {_plural(g, 'visual change')} approved"
    if result == "rejected":
        return "❌", f"Sightline: visual changes rejected"
    if result == "changes":
        return "❌", f"Sightline: {_need_review(g, pending)}"
    if result == "unreachable":
        return "⚠️", "Sightline: server unreachable"
    if result == "timeout":
        return "⚠️", "Sightline: build did not finish in time"
    return "❌", "Sightline: build failed" + (f" ({error})" if error else "")


def status_for(result: str, counts: dict | None, error: str | None = None, pending: int | None = None) -> tuple[str, str]:
    """(GitHub commit status state, description <= 140 chars)."""
    c = counts or {}
    g, snaps = c.get("groups", 0), c.get("snapshots", 0)
    table = {
        "passed": ("success", f"No visual changes across {_plural(snaps, 'snapshot')}"),
        "approved": ("success", f"{_plural(g, 'visual change')} approved in Sightline"),
        "rejected": ("failure", "Visual changes rejected in Sightline"),
        "changes": ("failure", f"{_need_review(g, pending)} in Sightline"),
        "unreachable": ("error", "Sightline server unreachable"),
        "timeout": ("error", "Sightline build did not finish in time"),
        "running": ("pending", "Capturing and diffing pages…"),
    }
    state, desc = table.get(result, ("failure", f"Sightline build failed{': ' + error if error else ''}"))
    return state, desc[:140]


def render_wren(routing: dict | None, wren: dict | None, cfg: dict) -> list[str]:
    """The "Wren tests to run" section."""
    if not routing:
        return []
    sel, total = routing["selected"], routing["total"]
    out = []
    if total == 0:
        return ["#### 🧪 Wren", "", "No Wren cases found in `" + cfg.get("seldon_file", "seldon.yml") + "`.", ""]
    if not sel:
        out += [f"#### 🧪 Wren: no tests needed (0 of {total})", "",
                f"{routing['reason']} None of the {_plural(total, 'Wren case')} touch a changed page.", ""]
    else:
        out += [f"#### 🧪 Wren: run {len(sel)} of {total} tests", ""]
        if routing["mode"] == "changes":
            out += ["Only these flows go through a page that changed:", ""]
        else:
            out += [routing["reason"], ""]
        results = (wren or {}).get("cases", {})
        has_results = bool(wren and wren.get("ran"))
        out += ["| " + (" | " if has_results else "") + "Case | Why |", "|---|" + ("---|" if has_results else "") + "---|"]
        for it in sel:
            res = ""
            if has_results:
                res = {"passed": "✅", "failed": "❌"}.get(results.get(it["id"]), "·") + " | "
            out.append(f"| {res}`{it['id']}` {_md(it['name'])} | {_md(it['why'])} |")
        out.append("")
        price = cfg.get("price_per_run")
        if price and routing["mode"] == "changes" and total > len(sel):
            out += [f"About ${len(sel) * price:g} of Wren runs instead of ${total * price:g} for the full suite "
                    f"(${price:g} per run).", ""]
    if wren and wren.get("ran"):
        icon = "✅" if wren.get("ok") else "❌"
        out += [f"{icon} Wren ran the selected cases: **{wren.get('summary', 'done')}**", ""]
        if wren.get("output"):
            out += ["<details><summary>Wren output</summary>", "", wren["output"].strip()[:6000], "", "</details>", ""]
    elif sel and cfg.get("preview_url"):
        out += ["Run them with the filtered test file this check wrote "
                f"(artifact `{cfg.get('artifact_name', 'sightline-wren')}`):", "", "```bash",
                cfg.get("command", ""), "```", ""]
    if routing["skipped"]:
        out += [f"<details><summary>Skipped {len(routing['skipped'])}: their pages did not change</summary>", ""]
        out += [f"- `{it['id']}` {it['name']} ({', '.join(it['pages']) or 'no pages'})" for it in routing["skipped"]]
        out += ["", "</details>", ""]
    return out


def render(status: dict | None, run: dict | None, routing: dict | None = None, wren: dict | None = None,
           cfg: dict | None = None, waiting: bool = False, result_override: str | None = None,
           error: str | None = None) -> str:
    """The full comment body.

    status: GET /api/runs/{id}/status payload (has `url`, the review page). run: GET /api/runs/{id} (RunDetail).
    result_override: "unreachable" or "timeout" when there is no usable build result.
    """
    cfg = cfg or {}
    result = result_override or (status or run or {}).get("result", "failed")
    counts = (status or run or {}).get("counts") or {}
    error = error or (run or {}).get("error")
    icon, title = headline(result, counts, waiting, error, pending_groups(run))
    url = (status or {}).get("url")
    lines = [MARKER, f"### {icon} {title}", ""]

    if result in ("unreachable", "timeout") or (result == "failed" and not counts.get("snapshots")):
        lines += [f"> {_md(error) or 'No details.'}", ""]
        if cfg.get("sightline_url"):
            lines += [f"Server: `{cfg['sightline_url']}`", ""]
        lines += render_wren(routing, wren, cfg)
        lines += [_footer(cfg)]
        return "\n".join(lines)

    num = (status or run or {}).get("number")
    meta = [f"Build #{num}" if num else None, cfg.get("label"),
            _plural(counts.get("snapshots", 0), "snapshot"),
            f"{counts.get('changed', 0)} changed" if counts.get("changed") else None,
            f"{counts.get('unchanged', 0)} unchanged" if counts.get("unchanged") else None,
            f"{counts.get('failed')} failed to capture" if counts.get("failed") else None]
    lines += [" · ".join(m for m in meta if m), ""]

    snaps = {s["id"]: s for s in (run or {}).get("snapshots", [])}
    groups = (run or {}).get("groups", [])
    if groups:
        lines += ["| | Change | Where | Review |", "|---|---|---|---|"]
        for g in groups:
            what = f"**{_md(g['title'])}**" + (f": `{_md(g['detail'])}`" if g.get("detail") else "")
            if g.get("selector"):
                what += f"<br><sub>`{_md(g['selector'])}`</sub>"
            lines.append(f"| {KIND_ICON.get(g['kind'], '•')} | {what} | {_md(_where(g, snaps))} | "
                         f"{REVIEW_ICON.get(g.get('review'), '⏳')} {g.get('review', 'pending')} |")
        lines.append("")
    failed = [s for s in snaps.values() if s.get("status") == "failed"]
    if failed:
        lines += ["**Could not capture:** " + "; ".join(f"{s['name']} {s['viewport']}px ({_md(s.get('error'))[:120]})"
                                                       for s in failed), ""]
    shifts = sum(len(s.get("layout_shifts") or []) for s in snaps.values())
    noise, pix = counts.get("noise_ignored", 0), counts.get("pixel_regions", 0)
    extras = []
    if shifts and groups:
        extras.append(f"{_plural(shifts, 'layout shift')} explained by the changes above")
    if noise:
        extras.append(f"{noise} dynamic regions ignored (clocks, counters, rotating content)")
    if pix:
        extras.append(f"a plain pixel diff would have flagged {_plural(pix, 'region')}")
    if extras:
        lines += ["<sub>" + "; ".join(extras) + ".</sub>", ""]

    if url:
        if result == "changes":
            lines += [f"**[Review in Sightline →]({url})** Approving or rejecting there updates this check"
                      + (" while it waits." if waiting else "."), ""]
        else:
            lines += [f"[Open build in Sightline →]({url})", ""]
    lines += render_wren(routing, wren, cfg)
    lines += [_footer(cfg)]
    return "\n".join(lines)


def _footer(cfg: dict) -> str:
    sha = (cfg.get("sha") or "")[:7]
    return f"<sub>Sightline visual check{' for ' + sha if sha else ''}. This comment is updated in place.</sub>"
