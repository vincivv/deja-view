"""Deja View API server."""
import logging
import os
import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import auth, db, jobs
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


app = FastAPI(title="Deja View", lifespan=lifespan)
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
    headers: dict[str, str] | None = None   # extra capture headers for this build only (not stored)


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


def _project(pid, user):
    p = db.one("select * from projects where id=? and owner_id=?", (pid, user["id"]))
    if not p:
        raise HTTPException(404, "Project not found")
    return p


def _owned_run(rid, user):
    r = db.one("select r.* from runs r join projects p on p.id=r.project_id where r.id=? and p.owner_id=?", (rid, user["id"]))
    if not r:
        raise HTTPException(404, "Build not found")
    return r


# Showcase: projects every signed-in visitor (guests from "Try the demo" included) can VIEW, read-only.
# Writes (runs, reviews, edits) still go through _project/_owned_run, so only the owner can change them.
PUBLIC_PROJECTS = {p.strip() for p in os.environ.get("DEJAVIEW_PUBLIC_PROJECTS", "p_4ae6d6e53452").split(",") if p.strip()}


def _readable_project(pid, user):
    p = db.one("select * from projects where id=?", (pid,))
    if not p or (p["owner_id"] != user["id"] and pid not in PUBLIC_PROJECTS):
        raise HTTPException(404, "Project not found")
    return p


def _readable_run(rid, user):
    r = db.one("select r.*, p.owner_id as _owner from runs r join projects p on p.id=r.project_id where r.id=?", (rid,))
    if not r or (r["_owner"] != user["id"] and r["project_id"] not in PUBLIC_PROJECTS):
        raise HTTPException(404, "Build not found")
    return r


class SignupIn(BaseModel):
    email: str
    password: str
    name: str | None = None


class LoginIn(BaseModel):
    email: str
    password: str


class TokenIn(BaseModel):
    name: str


# ---------------------------------------------------------------- auth
@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/auth/me")
def me(user=Depends(auth.current_user)):
    return auth.user_json(user)


@app.post("/api/auth/signup")
def signup(body: SignupIn, request: Request, response: Response):
    email = body.email.strip().lower()
    if "@" not in email or len(email) > 200:
        raise HTTPException(422, "Enter a valid email")
    if len(body.password) < 8:
        raise HTTPException(422, "Password must be at least 8 characters")
    if db.one("select id from users where email=?", (email,)):
        raise HTTPException(409, "An account with this email already exists")
    name = (body.name or "").strip() or email.split("@")[0]
    cur = auth.optional_user(request)
    if cur and cur["is_guest"]:
        # upgrade the guest in place: their demo projects carry over
        db.x("update users set email=?, name=?, pw_hash=?, is_guest=0 where id=?",
             (email, name, auth.hash_password(body.password), cur["id"]))
        user = db.one("select * from users where id=?", (cur["id"],))
    else:
        user = auth.create_user(email=email, name=name, password=body.password)
    auth.start_session(response, request, user["id"])
    return auth.user_json(user)


@app.post("/api/auth/login")
def login(body: LoginIn, request: Request, response: Response):
    user = db.one("select * from users where email=? and is_guest=0", (body.email.strip().lower(),))
    if not user or not auth.check_password(body.password, user["pw_hash"]):
        raise HTTPException(401, "Wrong email or password")
    auth.start_session(response, request, user["id"])
    return auth.user_json(user)


@app.post("/api/auth/logout")
def logout(request: Request, response: Response):
    auth.end_session(response, request)
    return {"ok": True}


@app.get("/api/tokens")
def list_tokens(user=Depends(auth.current_user)):
    return [{"id": t["id"], "name": t["name"], "prefix": t["prefix"], "created_at": jobs._iso(t["created_at"]),
             "last_used_at": jobs._iso(t["last_used_at"]) if t["last_used_at"] else None}
            for t in db.q("select * from api_tokens where user_id=? order by created_at desc", (user["id"],))]


@app.post("/api/tokens")
def create_token(body: TokenIn, user=Depends(auth.current_user)):
    token, h, prefix = auth.new_api_token()
    tid = db.uid("t_")
    name = body.name.strip()[:80] or "CI"
    db.x("insert into api_tokens(id,user_id,name,token_hash,prefix,created_at) values(?,?,?,?,?,?)",
         (tid, user["id"], name, h, prefix, db.now()))
    return {"id": tid, "name": name, "prefix": prefix, "created_at": jobs._iso(db.now()), "last_used_at": None, "token": token}


@app.delete("/api/tokens/{tid}")
def delete_token(tid: str, user=Depends(auth.current_user)):
    if not db.one("select id from api_tokens where id=? and user_id=?", (tid, user["id"])):
        raise HTTPException(404, "Token not found")
    db.x("delete from api_tokens where id=?", (tid,))
    return {"ok": True}


# ---------------------------------------------------------------- projects
@app.get("/api/projects")
def list_projects(user=Depends(auth.current_user)):
    # every "Try the demo" click makes its own demo project; list only the newest so the page stays clean
    rows, seen_demo = [], False
    for p in db.q("select * from projects where owner_id=? order by created_at desc", (user["id"],)):
        if p["is_demo"]:
            if seen_demo:
                continue
            seen_demo = True
        rows.append(jobs.project_json(p))
    # then the read-only showcase projects (a real store), for everyone signed in, guests included
    for pid in sorted(PUBLIC_PROJECTS):
        p = db.one("select * from projects where id=? and owner_id!=?", (pid, user["id"]))
        if p:
            rows.append(jobs.project_json(p))
    return rows


@app.post("/api/projects")
def create_project(body: ProjectIn, user=Depends(auth.current_user)):
    pid = db.uid("p_")
    db.x("insert into projects(id,name,base_url,paths,viewports,created_at,owner_id) values(?,?,?,?,?,?,?)",
         (pid, body.name.strip() or "Untitled", _norm_url(body.base_url), db.j(_norm_paths(body.paths)),
          db.j(_norm_viewports(body.viewports)), db.now(), user["id"]))
    return jobs.project_json(_project(pid, user))


@app.get("/api/projects/{pid}")
def get_project(pid: str, user=Depends(auth.current_user)):
    return jobs.project_json(_readable_project(pid, user))


@app.patch("/api/projects/{pid}")
def patch_project(pid: str, body: ProjectPatch, user=Depends(auth.current_user)):
    _project(pid, user)
    if body.name is not None:
        db.x("update projects set name=? where id=?", (body.name.strip() or "Untitled", pid))
    if body.base_url is not None:
        db.x("update projects set base_url=? where id=?", (_norm_url(body.base_url), pid))
    if body.paths is not None:
        db.x("update projects set paths=? where id=?", (db.j(_norm_paths(body.paths)), pid))
    if body.viewports is not None:
        db.x("update projects set viewports=? where id=?", (db.j(_norm_viewports(body.viewports)), pid))
    return jobs.project_json(_project(pid, user))


def _delete_project(pid):
    runs = [r["id"] for r in db.q("select id from runs where project_id=?", (pid,))]

    def rm():
        for rid in runs:
            for t in ("changes", "groups", "snapshots"):
                db.x(f"delete from {t} where run_id=?", (rid,))
        db.x("delete from runs where project_id=?", (pid,))
        db.x("delete from baselines where project_id=?", (pid,))
        db.x("delete from projects where id=?", (pid,))
    db.tx(rm)


@app.delete("/api/projects/{pid}")
def delete_project(pid: str, user=Depends(auth.current_user)):
    _project(pid, user)
    if db.one("select 1 x from runs where project_id=? and status in ('queued','capturing','diffing')", (pid,)):
        raise HTTPException(409, "A build is still running. Try again when it finishes.")
    _delete_project(pid)
    return {"ok": True}


@app.get("/api/projects/{pid}/runs")
def list_runs(pid: str, user=Depends(auth.current_user)):
    _readable_project(pid, user)
    return [jobs.run_summary(r) for r in db.q("select * from runs where project_id=? order by number desc limit 100", (pid,))]


@app.post("/api/projects/{pid}/runs")
async def start_run(pid: str, body: RunIn, user=Depends(auth.current_user)):
    _project(pid, user)
    rid = jobs.create_run(pid, _norm_url(body.base_url) if body.base_url else None, (body.label or "").strip() or None,
                          _check_headers(body.headers))
    return jobs.run_summary(db.one("select * from runs where id=?", (rid,)))


@app.get("/api/projects/{pid}/baselines")
def baselines(pid: str, user=Depends(auth.current_user)):
    p = _readable_project(pid, user)
    names = {x["path"]: x["name"] for x in db.uj(p["paths"])}
    rows = db.q("select b.*, s.run_id from baselines b join snapshots s on s.id=b.snapshot_id where b.project_id=? "
                "order by b.path, b.viewport desc", (pid,))
    return [{"path": r["path"], "name": names.get(r["path"], r["path"]), "viewport": r["viewport"],
             "image_url": f"/files/{r['snapshot_id']}.webp", "run_id": r["run_id"],
             "updated_at": jobs._iso(r["updated_at"])} for r in rows]


# ---------------------------------------------------------------- builds and review
@app.get("/api/runs/{rid}")
def get_run(rid: str, user=Depends(auth.current_user)):
    _readable_run(rid, user)
    return jobs.run_detail(rid)


@app.get("/api/runs/{rid}/status")
def run_status(rid: str, request: Request, user=Depends(auth.current_user)):
    """Small polling payload for CI."""
    s = jobs.run_summary(_owned_run(rid, user))
    return {"id": s["id"], "number": s["number"], "status": s["status"], "result": s["result"], "counts": s["counts"],
            "url": f"{_origin(request)}/builds/{rid}"}


def _origin(request: Request):
    # behind a tunnel or proxy, build links from the forwarded host the client actually used
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto}://{host}"


def _check_headers(h):
    if not h:
        return None
    if len(h) > 10 or any(not re.fullmatch(r"[A-Za-z0-9-]{1,64}", k) or len(v) > 1024 or "\n" in v or "\r" in v
                          for k, v in h.items()):
        raise HTTPException(422, "headers: up to 10 headers, names of letters, digits and dashes, values up to 1024 chars")
    if any(k.lower() in ("host", "cookie", "content-length") for k in h):
        raise HTTPException(422, "headers: host, cookie and content-length can't be set")
    return h


def _check_status(s):
    if s not in ("approved", "rejected", "pending"):
        raise HTTPException(422, "status must be approved, rejected or pending")


@app.post("/api/runs/{rid}/review")
def review_run(rid: str, body: ReviewIn, user=Depends(auth.current_user)):
    _check_status(body.status)
    _owned_run(rid, user)
    gids = [g["id"] for g in db.q("select id from groups where run_id=?", (rid,))]
    jobs.review_groups(rid, gids, body.status)
    return jobs.run_detail(rid)


@app.post("/api/groups/{gid}/review")
def review_group(gid: str, body: ReviewIn, user=Depends(auth.current_user)):
    _check_status(body.status)
    g = db.one("select run_id from groups where id=?", (gid,))
    if not g:
        raise HTTPException(404, "Group not found")
    _owned_run(g["run_id"], user)
    jobs.review_groups(g["run_id"], [gid], body.status)
    return jobs.run_detail(g["run_id"])


@app.post("/api/snapshots/{sid}/review")
def review_snapshot(sid: str, body: ReviewIn, user=Depends(auth.current_user)):
    _check_status(body.status)
    s = db.one("select run_id from snapshots where id=?", (sid,))
    if not s:
        raise HTTPException(404, "Snapshot not found")
    _owned_run(s["run_id"], user)
    gids = [r["group_id"] for r in db.q("select distinct group_id from changes where snapshot_id=?", (sid,))]
    jobs.review_groups(s["run_id"], gids, body.status)
    return jobs.run_detail(s["run_id"])


@app.post("/api/demo")
async def demo(request: Request, response: Response):
    # "Try the demo" never needs a login: a visitor without an account gets a throwaway guest account.
    # Every click gets its own fresh demo project at the v1 baseline, so parallel visitors and QA agents never collide.
    user = auth.optional_user(request)
    if not user:
        user = auth.create_user(name="Guest", guest=True)
        auth.start_session(response, request, user["id"])
    pid = db.uid("p_")
    db.x("insert into projects(id,name,base_url,paths,viewports,created_at,is_demo,owner_id) values(?,?,?,?,?,?,1,?)",
         (pid, "Acme Supply (demo)", f"http://127.0.0.1:{PORT}/demo/v1", db.j(DEMO_PATHS), db.j([1280, 390]), db.now(), user["id"]))
    jobs.create_run(pid, label="Baseline · v1")
    for old in db.q("select id from projects where is_demo=1 and owner_id=? order by created_at desc limit -1 offset 5", (user["id"],)):
        if not db.one("select 1 x from runs where project_id=? and status in ('queued','capturing','diffing')", (old["id"],)):
            _delete_project(old["id"])
    return jobs.project_json(_project(pid, user))


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
