"""Build execution, persistence, review logic and API serialization."""
from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
import traceback

import numpy as np
from PIL import Image

from . import db, engine
from .capture import Capturer

log = logging.getLogger("sightline")
capturer = Capturer(concurrency=4)
_group_lock = threading.Lock()
_tasks: set[asyncio.Task] = set()
_run_headers: dict[str, dict] = {}   # per-build capture headers: kept in memory only, never written to the DB


# ---------------------------------------------------------------- files
def fpath(name):
    return db.FILES / name


def save_images(snap_id, img: np.ndarray, dom: dict):
    im = Image.fromarray(img)
    im.save(fpath(f"{snap_id}.png"), compress_level=1)
    im.save(fpath(f"{snap_id}.webp"), quality=82, method=3)
    fpath(f"{snap_id}.dom.json").write_text(json.dumps(dom, separators=(",", ":")))


def save_overlay(snap_id, img: np.ndarray, mask: np.ndarray):
    gray = (img.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32))
    base = (gray * 0.35 + 160).clip(0, 255).astype(np.uint8)
    out = np.stack([base, base, base], -1)
    m = mask[: out.shape[0], : out.shape[1]]
    out[m] = (235, 40, 50)
    Image.fromarray(out).save(fpath(f"{snap_id}.overlay.webp"), quality=80, method=3)


def load_baseline(snap_id):
    img = np.asarray(Image.open(fpath(f"{snap_id}.png")).convert("RGB"))
    dom = json.loads(fpath(f"{snap_id}.dom.json").read_text())
    row = db.one("select volatile from snapshots where id=?", (snap_id,))
    return img, dom, set(db.uj(row["volatile"], [])) if row else set()


# ---------------------------------------------------------------- runs
def create_run(project_id, base_url=None, label=None, headers=None):
    p = db.one("select * from projects where id=?", (project_id,))
    if not p:
        raise KeyError("project not found")
    targets = len(db.uj(p["paths"])) * len(db.uj(p["viewports"]))

    def make():
        n = (db.one("select max(number) m from runs where project_id=?", (project_id,))["m"] or 0) + 1
        rid = db.uid("r_")
        has_base = db.one("select 1 x from baselines where project_id=? limit 1", (project_id,)) is not None
        db.x("insert into runs(id,project_id,number,label,base_url,status,created_at,progress_total,is_baseline_build)"
             " values(?,?,?,?,?,?,?,?,?)",
             (rid, project_id, n, label or f"Build #{n}", (base_url or p["base_url"]).rstrip("/"), "queued",
              db.now(), targets, 0 if has_base else 1))
        return rid
    rid = db.tx(make)
    if headers:
        _run_headers[rid] = dict(headers)
    t = asyncio.get_event_loop().create_task(execute_run(rid))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)
    return rid


def _url(base, path):
    return base.rstrip("/") + ("/" + path.lstrip("/") if path not in ("", "/") else "/")


_project_locks: dict[str, asyncio.Lock] = {}


async def execute_run(rid):
    # builds of one project run in order: a build started while the baseline is still capturing waits for it
    pid = db.one("select project_id from runs where id=?", (rid,))["project_id"]
    try:
        async with _project_locks.setdefault(pid, asyncio.Lock()):
            await _execute_run(rid)
    finally:
        _run_headers.pop(rid, None)


async def _execute_run(rid):
    run = db.one("select * from runs where id=?", (rid,))
    p = db.one("select * from projects where id=?", (run["project_id"],))
    if not p:
        return
    t0 = time.time()
    has_base = db.one("select 1 x from baselines where project_id=? limit 1", (p["id"],)) is not None
    db.x("update runs set status='capturing', is_baseline_build=? where id=?", (0 if has_base else 1, rid))
    paths, viewports = db.uj(p["paths"]), db.uj(p["viewports"])
    bases = {(b["path"], b["viewport"]): b["snapshot_id"]
             for b in db.q("select * from baselines where project_id=?", (p["id"],))}
    jobs = []
    for pi, pg in enumerate(paths):
        for vi, vp in enumerate(viewports):
            jobs.append(_snapshot(rid, p["id"], run["base_url"], pg, vp, bases.get((pg["path"], vp)), pi * 100 + vi))
    try:
        await asyncio.gather(*jobs)
        dur = int((time.time() - t0) * 1000)
        db.x("update runs set status='done', finished_at=?, duration_ms=? where id=?", (db.now(), dur, rid))
        log.info("run %s done in %sms", rid, dur)
    except Exception as e:
        log.exception("run failed")
        db.x("update runs set status='failed', error=?, finished_at=? where id=?", (str(e)[:500], db.now(), rid))


async def _snapshot(rid, project_id, base_url, pg, vp, baseline_id, sort):
    sid = db.uid("s_")
    t0 = time.time()
    url = _url(base_url, pg["path"])
    try:
        loads = await capturer.capture(url, vp, 2 if baseline_id else 3, headers=_run_headers.get(rid))
        result = await asyncio.to_thread(_process, sid, loads, baseline_id)
        _persist(sid, rid, project_id, pg, vp, baseline_id, result, int((time.time() - t0) * 1000), sort)
    except Exception as e:
        log.warning("snapshot %s %s failed: %s", url, vp, e)
        traceback.print_exc()
        db.x("insert into snapshots(id,run_id,project_id,path,name,viewport,status,baseline_id,error,duration_ms,sort)"
             " values(?,?,?,?,?,?,?,?,?,?,?)",
             (sid, rid, project_id, pg["path"], pg["name"], vp, "failed", baseline_id, str(e)[:400],
              int((time.time() - t0) * 1000), sort))
    finally:
        db.x("update runs set progress_done=progress_done+1 where id=?", (rid,))


def _process(sid, loads, baseline_id):
    img, dom = loads[0]
    vol, noise = engine.learn_volatility(loads)
    save_images(sid, img, dom)
    if not baseline_id:
        ordc = engine.ordinals(dom["els"])
        rects = [e["r"] for e, o in zip(dom["els"], ordc) if engine.is_volatile(e, o, vol)] + noise
        return {"new": True, "img": img, "volatile": sorted(vol), "noise_rects": engine.dedupe_rects(rects)[:300]}
    b_img, b_dom, b_vol = load_baseline(baseline_id)
    res = engine.compare(b_img, b_dom, b_vol, loads, vol, noise)
    if res["pixel_regions"]:
        save_overlay(sid, img, res["naive_mask"])
    res["img"] = img
    return res


def _persist(sid, rid, project_id, pg, vp, baseline_id, res, dur, sort):
    h, w = res["img"].shape[:2]
    if res.get("new"):
        db.x("insert into snapshots(id,run_id,project_id,path,name,viewport,status,width,height,noise_rects,"
             "pixel_regions,pixel_pct,layout_shifts,volatile,duration_ms,sort) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
             (sid, rid, project_id, pg["path"], pg["name"], vp, "new", w, h, db.j(res["noise_rects"]), "[]", 0,
              "[]", db.j(res["volatile"]), dur, sort))
        db.x("insert or replace into baselines(project_id,path,viewport,snapshot_id,updated_at) values(?,?,?,?,?)",
             (project_id, pg["path"], vp, sid, db.now()))
        return
    changes = res["changes"]
    status = "changed" if changes else "unchanged"

    def write():
        db.x("insert into snapshots(id,run_id,project_id,path,name,viewport,status,width,height,baseline_id,noise_rects,"
             "pixel_regions,pixel_pct,has_overlay,layout_shifts,noise_ignored,volatile,duration_ms,sort)"
             " values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
             (sid, rid, project_id, pg["path"], pg["name"], vp, status, w, h, baseline_id, db.j(res["noise_rects"]),
              db.j(res["pixel_regions"]), res["pixel_pct"], 1 if res["pixel_regions"] else 0, "[]",
              res["noise_ignored"], db.j(res["volatile"]), dur, sort))
        ids = []
        for i, ch in enumerate(changes):
            gid = _group_for(rid, ch)
            cid = db.uid("c_")
            ids.append(cid)
            db.x("insert into changes(id,snapshot_id,run_id,group_id,kind,title,detail,selector,bbox,base_bbox,before,after,idx)"
                 " values(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                 (cid, sid, rid, gid, ch["kind"], ch["title"], ch["detail"], ch["selector"], db.j(ch["bbox"]),
                  db.j(ch["base_bbox"]), ch["before"], ch["after"], i))
        shifts = [{"dx": s["dx"], "dy": s["dy"], "from_y": s["from_y"], "elements": s["elements"],
                   "cause_change_id": ids[s["cause_index"]] if s.get("cause_index") is not None else None}
                  for s in res["layout_shifts"]]
        db.x("update snapshots set layout_shifts=? where id=?", (db.j(shifts), sid))
        if not changes:   # learned volatility keeps improving the baseline
            row = db.one("select volatile from snapshots where id=?", (baseline_id,))
            merged = sorted(set(db.uj(row["volatile"], [])) | set(res["volatile"]))
            db.x("update snapshots set volatile=? where id=?", (db.j(merged), baseline_id))
    with _group_lock:
        db.tx(write)


def _group_for(rid, ch):
    g = db.one("select id from groups where run_id=? and sig=?", (rid, ch["sig"]))
    if g:
        return g["id"]
    gid = db.uid("g_")
    db.x("insert into groups(id,run_id,sig,kind,title,detail,selector,review) values(?,?,?,?,?,?,?,?)",
         (gid, rid, ch["sig"], ch["kind"], ch["title"], ch["detail"], ch["selector"], "pending"))
    return gid


# ---------------------------------------------------------------- review
def review_groups(rid, group_ids, status):
    assert status in ("approved", "rejected", "pending")

    def apply():
        for gid in group_ids:
            db.x("update groups set review=? where id=? and run_id=?", (status, gid, rid))
        _sync_baselines(rid)
    with _group_lock:
        db.tx(apply)


def _sync_baselines(rid):
    """A changed snapshot whose every change is approved becomes the baseline; otherwise its old baseline stands."""
    run = db.one("select project_id from runs where id=?", (rid,))
    gmap = {g["id"]: g["review"] for g in db.q("select id, review from groups where run_id=?", (rid,))}
    per_snap = {}
    for c in db.q("select snapshot_id, group_id from changes where run_id=?", (rid,)):
        per_snap.setdefault(c["snapshot_id"], []).append(gmap[c["group_id"]])
    for s in db.q("select id, path, viewport, baseline_id from snapshots where run_id=? and status='changed'", (rid,)):
        cur = db.one("select snapshot_id from baselines where project_id=? and path=? and viewport=?",
                     (run["project_id"], s["path"], s["viewport"]))
        approved = all(r == "approved" for r in per_snap.get(s["id"], []))
        if approved:
            db.x("insert or replace into baselines(project_id,path,viewport,snapshot_id,updated_at) values(?,?,?,?,?)",
                 (run["project_id"], s["path"], s["viewport"], s["id"], db.now()))
        elif cur and cur["snapshot_id"] == s["id"] and s["baseline_id"]:
            db.x("update baselines set snapshot_id=?, updated_at=? where project_id=? and path=? and viewport=?",
                 (s["baseline_id"], db.now(), run["project_id"], s["path"], s["viewport"]))


# ---------------------------------------------------------------- serialization
def _iso(t):
    return None if t is None else time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))


def run_summary(r, groups=None, snaps=None):
    groups = groups if groups is not None else db.q("select review from groups where run_id=?", (r["id"],))
    snaps = snaps if snaps is not None else db.q(
        "select status, noise_ignored, pixel_regions from snapshots where run_id=?", (r["id"],))
    nchanges = db.one("select count(*) n from changes where run_id=?", (r["id"],))["n"]
    counts = {"snapshots": r["progress_total"], "unchanged": 0, "changed": 0, "new": 0, "failed": 0,
              "changes": nchanges, "groups": len(groups), "noise_ignored": 0, "pixel_regions": 0}
    for s in snaps:
        counts[s["status"]] = counts.get(s["status"], 0) + 1
        counts["noise_ignored"] += s.get("noise_ignored") or 0
        pr = s.get("pixel_regions")
        counts["pixel_regions"] += len(pr if isinstance(pr, list) else db.uj(pr, []))
    reviews = [g["review"] for g in groups]
    if r["status"] in ("queued", "capturing", "diffing"):
        result = "running"
    elif r["status"] == "failed" or (counts["failed"] and counts["failed"] == counts["snapshots"]):
        result = "failed"
    elif not reviews:
        result = "passed"
    elif "rejected" in reviews:
        result = "rejected"
    elif all(x == "approved" for x in reviews):
        result = "approved"
    else:
        result = "changes"
    return {"id": r["id"], "project_id": r["project_id"], "number": r["number"], "label": r["label"],
            "base_url": r["base_url"], "status": r["status"], "error": r["error"],
            "created_at": _iso(r["created_at"]), "finished_at": _iso(r["finished_at"]), "duration_ms": r["duration_ms"],
            "progress": {"done": r["progress_done"], "total": r["progress_total"]},
            "is_baseline_build": bool(r["is_baseline_build"]), "result": result, "counts": counts}


def run_detail(rid):
    r = db.one("select * from runs where id=?", (rid,))
    if not r:
        return None
    p = db.one("select id, name from projects where id=?", (r["project_id"],))
    groups = db.q("select * from groups where run_id=?", (rid,))
    snaps = db.q("select * from snapshots where run_id=? order by sort", (rid,))
    changes = db.q("select * from changes where run_id=? order by idx", (rid,))
    base_ids = list({s["baseline_id"] for s in snaps if s["baseline_id"]})
    base_rows = {s["id"]: s for s in db.q(
        f"select id, width, height from snapshots where id in ({','.join('?' * len(base_ids))})", base_ids)} if base_ids else {}
    gmap = {g["id"]: g for g in groups}
    by_snap, by_group = {}, {}
    for c in changes:
        cj = {"id": c["id"], "snapshot_id": c["snapshot_id"], "group_id": c["group_id"], "kind": c["kind"],
              "title": c["title"], "detail": c["detail"], "selector": c["selector"], "bbox": db.uj(c["bbox"]),
              "base_bbox": db.uj(c["base_bbox"]), "before": c["before"], "after": c["after"]}
        by_snap.setdefault(c["snapshot_id"], []).append(cj)
        by_group.setdefault(c["group_id"], []).append(cj)
    out_snaps = []
    for s in snaps:
        sch = by_snap.get(s["id"], [])
        if s["status"] == "changed":
            revs = [gmap[c["group_id"]]["review"] for c in sch]
            review = "rejected" if "rejected" in revs else "approved" if all(x == "approved" for x in revs) else "pending"
        else:
            review = None
        b = base_rows.get(s["baseline_id"]) if s["baseline_id"] else None
        img = f"/files/{s['id']}.webp" if s["status"] != "failed" else None
        out_snaps.append({
            "id": s["id"], "run_id": rid, "path": s["path"], "name": s["name"], "viewport": s["viewport"],
            "status": s["status"], "review": review, "image_url": img, "width": s["width"], "height": s["height"],
            "baseline_image_url": f"/files/{s['baseline_id']}.webp" if b else None,
            "baseline_width": b["width"] if b else None, "baseline_height": b["height"] if b else None,
            "noise_rects": db.uj(s["noise_rects"], []),
            "pixel_diff": {"regions": db.uj(s["pixel_regions"], []), "pct": s["pixel_pct"] or 0,
                           "overlay_url": f"/files/{s['id']}.overlay.webp" if s["has_overlay"] else None},
            "layout_shifts": db.uj(s["layout_shifts"], []), "changes": sch,
            "duration_ms": s["duration_ms"], "error": s["error"]})
    out_groups = []
    for g in groups:
        chs = by_group.get(g["id"], [])
        sids = list(dict.fromkeys(c["snapshot_id"] for c in chs))
        details = list(dict.fromkeys(c["detail"] for c in chs))
        detail = g["detail"] if len(details) <= 1 else f'{details[0]}  (+{len(details) - 1} similar)'
        out_groups.append({"id": g["id"], "run_id": rid, "kind": g["kind"], "title": g["title"], "detail": detail,
                           "selector": g["selector"], "change_ids": [c["id"] for c in chs], "snapshot_ids": sids,
                           "count": len(chs), "review": g["review"]})
    sort_order = {s["id"]: i for i, s in enumerate(snaps)}
    out_groups.sort(key=lambda g: (min((sort_order.get(x, 0) for x in g["snapshot_ids"]), default=0), -g["count"]))
    snaps_for_counts = [{"status": s["status"], "noise_ignored": s["noise_ignored"], "pixel_regions": db.uj(s["pixel_regions"], [])}
                        for s in snaps]
    summary = run_summary(r, groups, snaps_for_counts)
    return {**summary, "project": p, "snapshots": out_snaps, "groups": out_groups}


def project_json(p):
    last = db.one("select * from runs where project_id=? order by number desc limit 1", (p["id"],))
    nb = db.one("select count(*) n from baselines where project_id=?", (p["id"],))["n"]
    out = {"id": p["id"], "name": p["name"], "base_url": p["base_url"], "paths": db.uj(p["paths"]),
           "viewports": db.uj(p["viewports"]), "created_at": _iso(p["created_at"]), "is_demo": bool(p["is_demo"]),
           "baseline_count": nb, "last_run": run_summary(last) if last else None}
    if p["is_demo"]:
        root = p["base_url"].rsplit("/demo/", 1)[0]
        out["demo_urls"] = [{"label": "v1 · baseline", "url": f"{root}/demo/v1"},
                            {"label": "v2 · with regressions", "url": f"{root}/demo/v2"}]
    return out
