"""SQLite persistence (WAL mode, one connection guarded by a lock: writes are tiny and infrequent)."""
import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
FILES = DATA / "files"
FILES.mkdir(parents=True, exist_ok=True)

SCHEMA = """
create table if not exists projects(
  id text primary key, name text not null, base_url text not null, paths text not null, viewports text not null,
  created_at real not null, is_demo integer not null default 0);
create table if not exists runs(
  id text primary key, project_id text not null, number integer not null, label text, base_url text not null,
  status text not null, error text, created_at real not null, finished_at real, duration_ms integer,
  progress_done integer not null default 0, progress_total integer not null default 0,
  is_baseline_build integer not null default 0);
create index if not exists runs_project on runs(project_id, number);
create table if not exists snapshots(
  id text primary key, run_id text not null, project_id text not null, path text not null, name text not null,
  viewport integer not null, status text not null, width integer, height integer, baseline_id text,
  noise_rects text, pixel_regions text, pixel_pct real, has_overlay integer default 0, layout_shifts text,
  noise_ignored integer default 0, volatile text, duration_ms integer, error text, sort integer default 0);
create index if not exists snaps_run on snapshots(run_id);
create table if not exists groups(
  id text primary key, run_id text not null, sig text not null, kind text not null, title text not null,
  detail text, selector text, review text not null default 'pending');
create index if not exists groups_run on groups(run_id);
create table if not exists changes(
  id text primary key, snapshot_id text not null, run_id text not null, group_id text not null, kind text not null,
  title text not null, detail text, selector text, bbox text, base_bbox text, before text, after text, idx integer);
create index if not exists changes_run on changes(run_id);
create table if not exists users(
  id text primary key, email text unique, name text not null, pw_hash text, is_guest integer not null default 0,
  created_at real not null);
create table if not exists sessions(
  token_hash text primary key, user_id text not null, created_at real not null, expires_at real not null);
create table if not exists api_tokens(
  id text primary key, user_id text not null, name text not null, token_hash text unique not null, prefix text not null,
  created_at real not null, last_used_at real);
create table if not exists baselines(
  project_id text not null, path text not null, viewport integer not null, snapshot_id text not null,
  updated_at real not null, primary key(project_id, path, viewport));
"""

_lock = threading.RLock()
_conn = sqlite3.connect(DATA / "sightline.db", check_same_thread=False, isolation_level=None)
_conn.row_factory = sqlite3.Row
_conn.execute("pragma journal_mode=wal")
_conn.execute("pragma synchronous=normal")
_conn.executescript(SCHEMA)
# migrations for databases created before accounts existed
if "owner_id" not in [r[1] for r in _conn.execute("pragma table_info(projects)").fetchall()]:
    _conn.execute("alter table projects add column owner_id text")
_conn.execute("create index if not exists projects_owner on projects(owner_id, created_at)")


def uid(prefix=""):
    return prefix + uuid.uuid4().hex[:12]


def now():
    return time.time()


def q(sql, args=()):
    with _lock:
        return [dict(r) for r in _conn.execute(sql, args).fetchall()]


def one(sql, args=()):
    r = q(sql, args)
    return r[0] if r else None


def x(sql, args=()):
    with _lock:
        _conn.execute(sql, args)


def many(sql, rows):
    with _lock:
        _conn.execute("begin")
        try:
            _conn.executemany(sql, rows)
            _conn.execute("commit")
        except Exception:
            _conn.execute("rollback")
            raise


def tx(fn):
    """Run fn() inside a transaction."""
    with _lock:
        _conn.execute("begin")
        try:
            out = fn()
            _conn.execute("commit")
            return out
        except Exception:
            _conn.execute("rollback")
            raise


def j(v):
    return json.dumps(v, separators=(",", ":"))


def uj(s, default=None):
    return json.loads(s) if s else default
