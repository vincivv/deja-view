#!/usr/bin/env python3
"""Sightline pull-request check: start a build, wait for it, post a sticky PR comment and a commit status,
route Wren tests to the flows that changed, and (optionally) wait for the human review in Sightline.

Standard library only, plus PyYAML for reading seldon.yml / wren.yml (JSON files work without it).

Configuration comes from flags or the environment (the composite action sets the env vars):
  SIGHTLINE_URL, SIGHTLINE_TOKEN, SIGHTLINE_PROJECT_ID, SIGHTLINE_BASE_URL, SIGHTLINE_LABEL,
  SIGHTLINE_WREN_MAP, SIGHTLINE_TIMEOUT_MINUTES, SIGHTLINE_WAIT_FOR_REVIEW, SIGHTLINE_HEADERS (JSON object),
  SIGHTLINE_RUN_WREN (auto|true|false), SIGHTLINE_STATUS_CONTEXT, SIGHTLINE_DRY_RUN,
  GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_PATH, GITHUB_SHA, GITHUB_API_URL, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY.

Exit code: 0 for passed / approved, 1 for changes still pending at the timeout, rejected, failed or unreachable.

Local dry run (prints the GitHub calls instead of making them and writes the comment to a file):
  python3 sightline_check.py --dry-run --comment-out comment.md --url http://127.0.0.1:8000 \
      --project p_123 --base-url http://127.0.0.1:4173 --wren-map path/to/.sightline/wren.yml
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import comment as C          # noqa: E402
import wren_routing as W     # noqa: E402

FINAL_STATUSES = ("done", "failed")


def log(*a):
    print("[sightline]", *a, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- HTTP
class HttpError(Exception):
    def __init__(self, code, detail):
        super().__init__(f"HTTP {code}: {detail}")
        self.code, self.detail = code, detail


class Unreachable(Exception):
    pass


def http(method, url, body=None, headers=None, timeout=30):
    h = {"Accept": "application/json", "User-Agent": "sightline-check/1"}
    h.update(headers or {})
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read() or b""
        try:
            detail = json.loads(raw).get("detail") or json.loads(raw).get("message") or raw.decode()[:300]
        except Exception:
            detail = raw.decode(errors="replace")[:300]
        raise HttpError(e.code, detail) from None
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
        raise Unreachable(f"{type(e).__name__}: {getattr(e, 'reason', e)}") from None


class Sightline:
    def __init__(self, base, token):
        self.base, self.h = base.rstrip("/"), {"Authorization": f"Bearer {token}"} if token else {}

    def call(self, method, path, body=None, retries=3):
        last = None
        for i in range(retries):
            try:
                return http(method, self.base + path, body, self.h)
            except Unreachable as e:          # tunnels hiccup: retry a few times before giving up
                last = e
                time.sleep(2 * (i + 1))
            except HttpError as e:
                if e.code in (502, 503, 504, 530) and i < retries - 1:   # 530: Cloudflare tunnel origin down
                    last = e
                    time.sleep(2 * (i + 1))
                    continue
                raise
        raise Unreachable(str(last))

    def start_run(self, project_id, base_url, label, headers=None):
        body = {"base_url": base_url, "label": label}
        if headers:
            body["headers"] = headers
        return self.call("POST", f"/api/projects/{project_id}/runs", body, retries=2)

    def status(self, rid):
        return self.call("GET", f"/api/runs/{rid}/status")

    def run(self, rid):
        return self.call("GET", f"/api/runs/{rid}")


class GitHub:
    """Just the three calls we need. In dry-run mode every write is printed instead."""

    def __init__(self, token, repo, api="https://api.github.com", dry_run=False):
        self.token, self.repo, self.api, self.dry = token, repo, api.rstrip("/"), dry_run
        self.comment_id = None

    def _h(self):
        return {"Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"}

    def set_status(self, sha, state, desc, url, context):
        body = {"state": state, "description": desc, "context": context}
        if url:
            body["target_url"] = url
        if self.dry or not (self.token and self.repo and sha):
            log(f"DRY status {context}: {state} — {desc} {url or ''}")
            return
        try:
            http("POST", f"{self.api}/repos/{self.repo}/statuses/{sha}", body, self._h())
        except (HttpError, Unreachable) as e:
            log(f"could not set commit status: {e}")

    def upsert_comment(self, pr, body):
        if not pr:
            return
        if self.dry or not (self.token and self.repo):
            log(f"DRY {'update' if self.comment_id else 'create'} sticky comment on PR #{pr} ({len(body)} chars)")
            self.comment_id = self.comment_id or "dry"
            return
        try:
            if self.comment_id is None:
                self.comment_id = self._find(pr)
            if self.comment_id:
                http("PATCH", f"{self.api}/repos/{self.repo}/issues/comments/{self.comment_id}", {"body": body}, self._h())
            else:
                r = http("POST", f"{self.api}/repos/{self.repo}/issues/{pr}/comments", {"body": body}, self._h())
                self.comment_id = r.get("id")
        except (HttpError, Unreachable) as e:
            log(f"could not post the PR comment: {e}")

    def _find(self, pr):
        for page in range(1, 11):
            items = http("GET", f"{self.api}/repos/{self.repo}/issues/{pr}/comments?per_page=100&page={page}", None, self._h())
            for c in items:
                if C.MARKER in (c.get("body") or ""):
                    return c["id"]
            if len(items) < 100:
                return None
        return None


# ---------------------------------------------------------------- config files
def load_structured(path: Path):
    text = path.read_text()
    try:
        import yaml
        return yaml.safe_load(text)
    except ImportError:
        return json.loads(text)


def dump_yaml(doc) -> str:
    try:
        import yaml
        return yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=1000)
    except ImportError:
        return json.dumps(doc, indent=2, ensure_ascii=False)


def event_context():
    pr, sha = None, os.environ.get("GITHUB_SHA")
    p = os.environ.get("GITHUB_EVENT_PATH")
    if p and Path(p).is_file():
        ev = json.loads(Path(p).read_text())
        pull = ev.get("pull_request")
        if pull:
            pr, sha = pull.get("number"), pull.get("head", {}).get("sha") or sha
    return pr, sha


def set_output(name, value):
    f = os.environ.get("GITHUB_OUTPUT")
    if f:
        with open(f, "a") as fh:
            fh.write(f"{name}={value}\n")


# ---------------------------------------------------------------- Wren
def prepare_wren(args, run, result):
    """Route Wren cases and write the filtered seldon.yml. Returns (routing, cfg_extras) or (None, {}).
    A broken map or Seldon file never fails the visual check: routing is just left out of the comment."""
    try:
        return _prepare_wren(args, run, result)
    except Exception as e:
        log(f"Wren routing skipped: {type(e).__name__}: {e}")
        return None, {}


def _prepare_wren(args, run, result):
    map_path = Path(args.wren_map) if args.wren_map else None
    if not map_path or not map_path.is_file():
        if args.wren_map:
            log(f"no Wren map at {args.wren_map}; skipping Wren routing")
        return None, {}
    mapping = load_structured(map_path) or {}
    seldon_rel = mapping.get("seldon", "seldon.yml")
    root = Path(args.repo_root) if args.repo_root else map_path.resolve().parent.parent
    seldon_path = (root / seldon_rel)
    if not seldon_path.is_file():
        log(f"Seldon file {seldon_path} not found; skipping Wren routing")
        return None, {}
    doc = load_structured(seldon_path) or {}
    pages = W.affected_pages(run or {}) if run else {}
    routing = W.route(doc.get("testCases", []), mapping, pages.keys(), result)
    out_dir = Path(args.wren_out)
    out_dir.mkdir(parents=True, exist_ok=True)
    filtered = W.filter_seldon(doc, [c["id"] for c in routing["selected"]])
    if args.base_url:
        filtered.setdefault("run", {})["url"] = args.base_url
    (out_dir / "seldon.yml").write_text(
        f"# Generated by Sightline: {len(routing['selected'])} of {routing['total']} cases, "
        f"routed from the pages this build changed ({', '.join(routing['changed_paths']) or 'none'}).\n"
        + dump_yaml(filtered))
    (out_dir / "routing.json").write_text(json.dumps(routing, indent=2))
    extras = {"price_per_run": mapping.get("price_per_run"), "seldon_file": seldon_rel,
              "preview_url": args.base_url, "command": W.seldon_command(args.base_url or "<preview-url>", out_dir.name),
              "artifact_name": "sightline-wren"}
    set_output("wren_selected", ",".join(c["id"] for c in routing["selected"]))
    set_output("wren_file", str(out_dir / "seldon.yml"))
    log(f"Wren: {len(routing['selected'])} of {routing['total']} cases selected -> {out_dir / 'seldon.yml'}")
    return routing, extras


def maybe_run_wren(args, routing):
    """Run the Seldon CLI on the selected cases if it's installed and allowed. Never invents CLI flags:
    it runs `seldon run --url <preview>` from the folder that holds the filtered seldon.yml."""
    mode = (args.run_wren or "auto").lower()
    if not routing or not routing["selected"] or mode == "false":
        return None
    exe = shutil.which("seldon")
    if not exe:
        if mode == "true":
            log("run_wren is true but no `seldon` binary is on PATH")
        return None
    log(f"running Wren on {len(routing['selected'])} cases")
    try:
        p = subprocess.run([exe, "run", "--url", args.base_url], cwd=args.wren_out, capture_output=True, text=True,
                           timeout=int(args.wren_timeout_minutes) * 60)
        out = (p.stdout or "") + ("\n" + p.stderr if p.returncode and p.stderr else "")
        first = next((ln for ln in out.splitlines() if "passed" in ln.lower()), "")
        summary = first.split("·")[-1].strip(" *") if first else ("passed" if p.returncode == 0 else "failed")
        cases = {}
        for ln in out.splitlines():   # the CLI's markdown table rows look like: | ✅ | `case-id` Name |
            for it in routing["selected"]:
                if f"`{it['id']}`" in ln:
                    cases[it["id"]] = "passed" if "✅" in ln else "failed" if "❌" in ln else cases.get(it["id"])
        return {"ran": True, "ok": p.returncode == 0, "summary": summary, "output": out, "cases": cases}
    except Exception as e:
        return {"ran": True, "ok": False, "summary": f"could not run: {e}", "output": ""}


# ---------------------------------------------------------------- main
def parse_args(argv=None):
    env = os.environ.get
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("--url", default=env("SIGHTLINE_URL"), help="Sightline server, e.g. https://x.trycloudflare.com")
    a.add_argument("--token", default=env("SIGHTLINE_TOKEN"))
    a.add_argument("--project", default=env("SIGHTLINE_PROJECT_ID"))
    a.add_argument("--base-url", default=env("SIGHTLINE_BASE_URL"), help="the preview URL to capture")
    a.add_argument("--label", default=env("SIGHTLINE_LABEL"))
    a.add_argument("--headers", default=env("SIGHTLINE_HEADERS"), help="JSON object of extra HTTP headers for capture")
    a.add_argument("--wren-map", default=env("SIGHTLINE_WREN_MAP", ".sightline/wren.yml"))
    a.add_argument("--repo-root", default=env("GITHUB_WORKSPACE"))
    a.add_argument("--wren-out", default=env("SIGHTLINE_WREN_OUT", "sightline-wren"))
    a.add_argument("--run-wren", default=env("SIGHTLINE_RUN_WREN", "auto"))
    a.add_argument("--wren-timeout-minutes", default=env("SIGHTLINE_WREN_TIMEOUT_MINUTES", "20"))
    a.add_argument("--timeout-minutes", default=env("SIGHTLINE_TIMEOUT_MINUTES", "15"),
                   help="total time to wait for the build and then the human review")
    a.add_argument("--wait-for-review", default=env("SIGHTLINE_WAIT_FOR_REVIEW", "true"))
    a.add_argument("--poll-seconds", default=env("SIGHTLINE_POLL_SECONDS", "5"))
    a.add_argument("--context", default=env("SIGHTLINE_STATUS_CONTEXT", "Sightline"))
    a.add_argument("--dry-run", action="store_true", default=env("SIGHTLINE_DRY_RUN", "").lower() in ("1", "true"))
    a.add_argument("--comment-out", default=env("SIGHTLINE_COMMENT_OUT"), help="also write each comment version here")
    a.add_argument("--pr", default=None, help="PR number (default: from the GitHub event)")
    return a.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    missing = [n for n, v in (("sightline_url", args.url), ("sightline_token", args.token),
                              ("project_id", args.project)) if not v]
    if missing:
        log("missing inputs: " + ", ".join(missing))
        return 2
    headers = None
    if args.headers:
        try:
            headers = json.loads(args.headers)
            assert isinstance(headers, dict)
        except Exception:
            log("headers must be a JSON object")
            return 2
    pr, sha = event_context()
    pr = int(args.pr) if args.pr else pr
    label = args.label or (f"PR #{pr}" if pr else (os.environ.get("GITHUB_REF_NAME") or "CI build"))
    gh = GitHub(os.environ.get("GITHUB_TOKEN"), os.environ.get("GITHUB_REPOSITORY"),
                os.environ.get("GITHUB_API_URL", "https://api.github.com"), args.dry_run)
    sl = Sightline(args.url, args.token)
    cfg = {"label": label, "sha": sha, "sightline_url": args.url}
    deadline = time.time() + float(args.timeout_minutes) * 60
    poll = float(args.poll_seconds)

    def publish(status, run, routing=None, wren=None, waiting=False, override=None, error=None):
        body = C.render(status, run, routing, wren, cfg, waiting=waiting, result_override=override, error=error)
        state, desc = C.status_for(override or (status or {}).get("result", "failed"), (status or {}).get("counts"),
                                   error=error, pending=C.pending_groups(run))
        gh.set_status(sha, state, desc, (status or {}).get("url"), args.context)
        gh.upsert_comment(pr, body)
        if args.comment_out:
            Path(args.comment_out).write_text(body + "\n")
        return body

    gh.set_status(sha, "pending", f"Capturing {args.base_url or 'the project URL'}"[:140], None, args.context)

    # 1. start the build
    try:
        started = sl.start_run(args.project, args.base_url, label, headers)
    except Unreachable as e:
        log(f"Sightline unreachable: {e}")
        routing, extras = prepare_wren(args, None, "failed")
        cfg.update(extras)
        publish(None, None, routing, override="unreachable", error=f"Could not reach Sightline: {e}")
        return 1
    except HttpError as e:
        log(f"Sightline refused the build: {e}")
        publish(None, None, override="failed", error=f"Sightline refused the build ({e.code}): {e.detail}")
        return 1
    rid = started["id"]
    log(f"build #{started.get('number')} {rid} queued")
    set_output("run_id", rid)

    # 2. wait for capture + diff
    st = None
    while time.time() < deadline:
        try:
            st = sl.status(rid)
        except Unreachable as e:
            log(f"status poll failed, retrying: {e}")
            time.sleep(poll)
            continue
        if st["status"] in FINAL_STATUSES:
            break
        time.sleep(poll)
    else:
        publish(st, None, override="timeout",
                error=f"The build was still {(st or {}).get('status', 'queued')} after {args.timeout_minutes} min.")
        return 1
    set_output("run_url", st.get("url", ""))

    run = sl.run(rid)
    result = st["result"]
    log(f"build #{st['number']} {st['status']} -> {result} ({st['counts'].get('groups', 0)} groups)")

    # 3. route Wren, optionally run it
    routing, extras = prepare_wren(args, run, result)
    cfg.update(extras)
    wren = maybe_run_wren(args, routing) if result in ("changes", "failed") else None

    waiting = result == "changes" and args.wait_for_review.lower() == "true"
    publish(st, run, routing, wren, waiting=waiting, error=run.get("error"))
    write_summary(C.render(st, run, routing, wren, cfg))

    # 4. wait for the human review in Sightline; each decision updates the comment and the status
    last_sig = _review_sig(run)
    while waiting and time.time() < deadline:
        time.sleep(poll)
        try:
            st = sl.status(rid)
            run_now = sl.run(rid)
        except (Unreachable, HttpError) as e:
            log(f"review poll failed, retrying: {e}")
            continue
        sig = _review_sig(run_now)
        if sig != last_sig:          # a group was approved or rejected: refresh the comment
            last_sig, run = sig, run_now
            log(f"review update: {st['result']}")
            publish(st, run, routing, wren, waiting=st["result"] == "changes", error=run.get("error"))
        if st["result"] != "changes":
            result = st["result"]
            break
    if result == "changes" and waiting:
        log("timed out waiting for review")
        publish(st, run, routing, wren, waiting=False, error=run.get("error"))

    set_output("result", result)
    log(f"final result: {result}")
    return 0 if result in ("passed", "approved") else 1


def _review_sig(run):
    return tuple(sorted((g["id"], g.get("review")) for g in (run or {}).get("groups", [])))


def write_summary(md):
    f = os.environ.get("GITHUB_STEP_SUMMARY")
    if f:
        with open(f, "a") as fh:
            fh.write(md.replace(C.MARKER, "") + "\n")


if __name__ == "__main__":
    sys.exit(main())
