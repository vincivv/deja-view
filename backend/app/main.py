"""Sightline API server."""
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import db, jobs
from .demo import DEMO_PATHS, router as demo_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
PORT = int(os.environ.get("PORT", "8000"))
DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app):
    # builds interrupted by a restart can't resume: mark them failed so the UI doesn't spin forever
    db.x("update runs set status='failed', error='Server restarted during the build' where status in ('queued','capturing','diffing')")
    yield
    await jobs.capturer.close()


app = FastAPI(title="Sightline", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(demo_router)


class StaticCached(StaticFiles):
    async def get_response(self, path, scope):
        resp = await super().get_response(path, scope)
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"   # snapshot files never change
        return resp


app.mount("/files", StaticCached(directory=db.FILES), name="files")


# ---------------------------------------------------------------- models
class PathIn(BaseModel):
    path: str
    name: str | None = None


class ProjectIn(BaseModel):
    name: str
    base_url: str
    paths: list[str | PathIn]
    viewports: list[int] | None = None


class ProjectPatch(BaseModel):
    name: str | None = None
    base_url: str | None = None
    paths: list[str | PathIn] | None = None
    viewports: list[int] | None = None


class RunIn(BaseModel):
    base_url: str | None = None
    label: str | None = None


class ReviewIn(BaseModel):
    status: str


def _norm_paths(paths):
    out, seen = [], set()
    for p in paths:
        path = p if isinstance(p, str) else p.path
        name = None if isinstance(p, str) else p.name
        path = path.strip()
        if not path:
            continue
        if not path.startswith("/"):
            path = "/" + path
        if path in seen:
            continue
        seen.add(path)
        out.append({"path": path, "name": name or ("Home" if path == "/" else path.strip("/").replace("-", " ").replace("/", " / ").title())})
    if not out:
        raise HTTPException(422, "At least one page path is required")
    return out


def _norm_viewports(vps):
    vps = sorted({int(v) for v in (vps or [1280])}, reverse=True)
    if any(v < 320 or v > 2560 for v in vps):
        raise HTTPException(422, "Viewport widths must be between 320 and 2560")
    return vps[:4]


def _norm_url(u):
    u = u.strip().rstrip("/")
    if not u.startswith(("http://", "https://")):
        u = "https://" + u
    return u


def _project(pid):
    p = db.one("select * from projects where id=?", (pid,))
    if not p:
        raise HTTPException(404, "Project not found")
    return p


# ---------------------------------------------------------------- routes
@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/projects")
def list_projects():
    return [jobs.project_json(p) for p in db.q("select * from projects order by created_at desc")]


@app.post("/api/projects")
def create_project(body: ProjectIn):
    pid = db.uid("p_")
    db.x("insert into projects(id,name,base_url,paths,viewports,created_at) values(?,?,?,?,?,?)",
         (pid, body.name.strip() or "Untitled", _norm_url(body.base_url), db.j(_norm_paths(body.paths)),
          db.j(_norm_viewports(body.viewports)), db.now()))
    return jobs.project_json(_project(pid))


@app.get("/api/projects/{pid}")
def get_project(pid: str):
    return jobs.project_json(_project(pid))


@app.patch("/api/projects/{pid}")
def patch_project(pid: str, body: ProjectPatch):
    _project(pid)
    if body.name is not None:
        db.x("update projects set name=? where id=?", (body.name.strip() or "Untitled", pid))
    if body.base_url is not None:
        db.x("update projects set base_url=? where id=?", (_norm_url(body.base_url), pid))
    if body.paths is not None:
        db.x("update projects set paths=? where id=?", (db.j(_norm_paths(body.paths)), pid))
    if body.viewports is not None:
        db.x("update projects set viewports=? where id=?", (db.j(_norm_viewports(body.viewports)), pid))
    return jobs.project_json(_project(pid))


@app.delete("/api/projects/{pid}")
def delete_project(pid: str):
    _project(pid)
    runs = [r["id"] for r in db.q("select id from runs where project_id=?", (pid,))]

    def rm():
        for rid in runs:
            for t in ("changes", "groups", "snapshots"):
                db.x(f"delete from {t} where run_id=?", (rid,))
        db.x("delete from runs where project_id=?", (pid,))
        db.x("delete from baselines where project_id=?", (pid,))
        db.x("delete from projects where id=?", (pid,))
    db.tx(rm)
    return {"ok": True}


@app.get("/api/projects/{pid}/runs")
def list_runs(pid: str):
    _project(pid)
    return [jobs.run_summary(r) for r in db.q("select * from runs where project_id=? order by number desc limit 100", (pid,))]


@app.post("/api/projects/{pid}/runs")
async def start_run(pid: str, body: RunIn):
    _project(pid)
    rid = jobs.create_run(pid, _norm_url(body.base_url) if body.base_url else None, (body.label or "").strip() or None)
    return jobs.run_summary(db.one("select * from runs where id=?", (rid,)))


@app.get("/api/projects/{pid}/baselines")
def baselines(pid: str):
    p = _project(pid)
    names = {x["path"]: x["name"] for x in db.uj(p["paths"])}
    rows = db.q("select b.*, s.run_id from baselines b join snapshots s on s.id=b.snapshot_id where b.project_id=? "
                "order by b.path, b.viewport desc", (pid,))
    return [{"path": r["path"], "name": names.get(r["path"], r["path"]), "viewport": r["viewport"],
             "image_url": f"/files/{r['snapshot_id']}.webp", "run_id": r["run_id"],
             "updated_at": jobs._iso(r["updated_at"])} for r in rows]


@app.get("/api/runs/{rid}")
def get_run(rid: str):
    d = jobs.run_detail(rid)
    if not d:
        raise HTTPException(404, "Build not found")
    return d


def _check_status(s):
    if s not in ("approved", "rejected", "pending"):
        raise HTTPException(422, "status must be approved, rejected or pending")


@app.post("/api/runs/{rid}/review")
def review_run(rid: str, body: ReviewIn):
    _check_status(body.status)
    if not db.one("select id from runs where id=?", (rid,)):
        raise HTTPException(404, "Build not found")
    gids = [g["id"] for g in db.q("select id from groups where run_id=?", (rid,))]
    jobs.review_groups(rid, gids, body.status)
    return jobs.run_detail(rid)


@app.post("/api/groups/{gid}/review")
def review_group(gid: str, body: ReviewIn):
    _check_status(body.status)
    g = db.one("select run_id from groups where id=?", (gid,))
    if not g:
        raise HTTPException(404, "Group not found")
    jobs.review_groups(g["run_id"], [gid], body.status)
    return jobs.run_detail(g["run_id"])


@app.post("/api/snapshots/{sid}/review")
def review_snapshot(sid: str, body: ReviewIn):
    _check_status(body.status)
    s = db.one("select run_id from snapshots where id=?", (sid,))
    if not s:
        raise HTTPException(404, "Snapshot not found")
    gids = [r["group_id"] for r in db.q("select distinct group_id from changes where snapshot_id=?", (sid,))]
    jobs.review_groups(s["run_id"], gids, body.status)
    return jobs.run_detail(s["run_id"])


@app.post("/api/demo")
async def demo():
    p = db.one("select * from projects where is_demo=1 order by created_at limit 1")
    if not p:
        pid = db.uid("p_")
        db.x("insert into projects(id,name,base_url,paths,viewports,created_at,is_demo) values(?,?,?,?,?,?,1)",
             (pid, "Acme Supply (demo)", f"http://127.0.0.1:{PORT}/demo/v1", db.j(DEMO_PATHS), db.j([1280, 390]), db.now()))
        p = _project(pid)
    if not db.one("select id from runs where project_id=? limit 1", (p["id"],)):
        jobs.create_run(p["id"], label="Baseline · v1")
    return jobs.project_json(_project(p["id"]))


# ---------------------------------------------------------------- frontend (production build)
if DIST.exists():
    app.mount("/assets", StaticCached(directory=DIST / "assets"), name="assets")

    @app.get("/{full:path}", include_in_schema=False)
    def spa(full: str):
        if full.startswith(("api/", "files/", "demo/")):
            raise HTTPException(404)
        f = DIST / full
        if full and f.is_file():
            return FileResponse(f)
        return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache"})
