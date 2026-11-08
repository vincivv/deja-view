"""Comment rendering and the check's main loop against a fake Sightline server.
Run: python3 -m unittest discover -s ci/github-action/tests"""
import copy
import json
import os
import socket
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import comment as C           # noqa: E402
import sightline_check as SC  # noqa: E402
import wren_routing as W      # noqa: E402

FIX = HERE / "fixtures"
RUN = json.loads((FIX / "run_changes.json").read_text())
STATUS = json.loads((FIX / "status_changes.json").read_text())


def routing_for(run):
    cases = [{"id": i, "name": i} for i in ("home-bestsellers", "product-add-to-cart", "cart-checkout")]
    mapping = {"cases": {"home-bestsellers": {"pages": ["/"]}, "product-add-to-cart": {"pages": ["/product", "/cart"]},
                         "cart-checkout": {"pages": ["/cart"]}}}
    return W.route(cases, mapping, W.affected_pages(run).keys(), run["result"])


class RenderTests(unittest.TestCase):
    def test_changes_comment(self):
        cfg = {"label": "PR #1", "sha": "abcdef1234", "price_per_run": 3, "preview_url": "https://p.dev",
               "command": "cd sightline-wren && seldon run --url https://p.dev"}
        md = C.render(STATUS, RUN, routing_for(RUN), None, cfg, waiting=True)
        self.assertTrue(md.startswith(C.MARKER))
        self.assertIn("❌ Sightline: 5 visual changes need review", md)
        self.assertIn("**Button background changed**: `background #4c6ef5 → #d9480f`", md)
        self.assertIn("| Cart · 1280px + 390px |", md)
        self.assertIn("**Image missing**", md)
        self.assertIn("[Review in Sightline →](http://127.0.0.1:8000/builds/", md)
        self.assertIn("Wren: run 2 of 3 tests", md)
        self.assertIn("About $6 of Wren runs instead of $9", md)
        self.assertIn("seldon run --url https://p.dev", md)
        self.assertIn("for abcdef1", md)

    def test_partial_review(self):
        run = copy.deepcopy(RUN)
        run["groups"][0]["review"] = "approved"
        self.assertIn("4 of 5 visual changes still need review", C.render(STATUS, run))
        self.assertEqual(C.status_for("changes", STATUS["counts"], pending=4)[1],
                         "4 of 5 visual changes still need review in Sightline")

    def test_approved_and_rejected(self):
        run = copy.deepcopy(RUN)
        for g in run["groups"]:
            g["review"] = "approved"
        st = dict(STATUS, result="approved")
        md = C.render(st, run)
        self.assertIn("✅ Sightline: 5 visual changes approved", md)
        self.assertNotIn("⏳", md)
        self.assertEqual(C.status_for("approved", st["counts"])[0], "success")
        self.assertEqual(C.status_for("rejected", st["counts"])[0], "failure")

    def test_passed(self):
        st = {"id": "r", "number": 3, "status": "done", "result": "passed", "url": "http://x/builds/r",
              "counts": {"snapshots": 8, "unchanged": 8, "changes": 0, "groups": 0, "noise_ignored": 12}}
        run = {"result": "passed", "snapshots": [], "groups": []}
        md = C.render(st, run, W.route([{"id": "a", "name": "a"}], {"cases": {"a": {"pages": ["/"]}}}, [], "passed"))
        self.assertIn("✅ Sightline: no visual changes", md)
        self.assertIn("Wren: no tests needed (0 of 1)", md)
        self.assertEqual(C.status_for("passed", st["counts"]), ("success", "No visual changes across 8 snapshots"))

    def test_unreachable(self):
        md = C.render(None, None, result_override="unreachable", error="Could not reach Sightline: refused",
                      cfg={"sightline_url": "https://gone.trycloudflare.com"})
        self.assertIn("⚠️ Sightline: server unreachable", md)
        self.assertIn("gone.trycloudflare.com", md)
        self.assertEqual(C.status_for("unreachable", None)[0], "error")

    def test_failed_build(self):
        st = {"id": "r", "number": 2, "status": "failed", "result": "failed", "url": "u",
              "counts": {"snapshots": 8, "failed": 8}}
        run = {"result": "failed", "error": None, "groups": [], "snapshots": [
            {"id": "s1", "name": "Home", "path": "/", "viewport": 1280, "status": "failed",
             "error": "HTTP 530 for https://x/", "changes": [], "layout_shifts": []}]}
        md = C.render(st, run)
        self.assertIn("Sightline: build failed", md)
        self.assertIn("Could not capture:** Home 1280px (HTTP 530", md)

    def test_table_cells_are_escaped(self):
        run = copy.deepcopy(RUN)
        run["groups"][0]["detail"] = 'text "a | b"'
        self.assertIn("a \\| b", C.render(STATUS, run))


# ---------------------------------------------------------------- main() against a fake server
class FakeSightline:
    """Serves the fixture build; the review flips to `final_result` after `review_after` status polls."""

    def __init__(self, result="changes", final_result=None, review_after=2, start_status=200):
        self.result, self.final, self.review_after, self.start_status = result, final_result, review_after, start_status
        self.polls, self.started = 0, None
        fake = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _send(self, code, obj):
                b = json.dumps(obj).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(b)))
                self.end_headers()
                self.wfile.write(b)

            def do_POST(self):
                n = int(self.headers.get("Content-Length") or 0)
                fake.started = json.loads(self.rfile.read(n) or b"{}")
                if self.headers.get("Authorization") != "Bearer sl_test":
                    return self._send(401, {"detail": "Not signed in"})
                if fake.start_status != 200:
                    return self._send(fake.start_status, {"detail": "Project not found"})
                self._send(200, {"id": RUN["id"], "number": RUN["number"], "status": "queued", "result": "running"})

            def do_GET(self):
                if self.path.endswith("/status"):
                    fake.polls += 1
                    self._send(200, fake.status())
                else:
                    self._send(200, fake.run())

        self.srv = HTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.srv.server_address[1]}"
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def current(self):
        if self.polls <= 1:
            return "running"
        if self.final and self.polls > self.review_after:
            return self.final
        return self.result

    def status(self):
        r = self.current()
        return dict(STATUS, status="capturing" if r == "running" else "done", result=r)

    def run(self):
        run = copy.deepcopy(RUN)
        r = self.current()
        run["result"] = r
        if r in ("approved", "rejected"):
            for g in run["groups"]:
                g["review"] = r
        if r == "passed":
            run["groups"], run["snapshots"] = [], [dict(s, status="unchanged", changes=[]) for s in run["snapshots"]]
        return run

    def close(self):
        self.srv.shutdown()


class MainTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name) / "comment.md"
        for k in ("GITHUB_EVENT_PATH", "GITHUB_OUTPUT", "GITHUB_STEP_SUMMARY", "GITHUB_TOKEN"):
            os.environ.pop(k, None)

    def tearDown(self):
        self.tmp.cleanup()

    def main(self, url, *extra):
        return SC.main(["--dry-run", "--url", url, "--token", "sl_test", "--project", "p_1", "--base-url",
                        "https://preview.example", "--pr", "7", "--poll-seconds", "0.05", "--timeout-minutes", "0.1",
                        "--wren-map", str(FIX / "wren.yml"), "--repo-root", str(FIX),
                        "--wren-out", str(Path(self.tmp.name) / "wren"), "--comment-out", str(self.out), *extra])

    def test_approved_after_review(self):
        fake = FakeSightline(final_result="approved", review_after=3)
        try:
            self.assertEqual(self.main(fake.url), 0)
        finally:
            fake.close()
        self.assertEqual(fake.started["label"], "PR #7")
        self.assertIn("✅ Sightline: 5 visual changes approved", self.out.read_text())

    def test_rejected_after_review(self):
        fake = FakeSightline(final_result="rejected", review_after=3)
        try:
            self.assertEqual(self.main(fake.url), 1)
        finally:
            fake.close()
        self.assertIn("❌ Sightline: visual changes rejected", self.out.read_text())

    def test_review_timeout_fails(self):
        fake = FakeSightline()
        try:
            self.assertEqual(self.main(fake.url), 1)
        finally:
            fake.close()
        self.assertIn("5 visual changes need review", self.out.read_text())

    def test_passed_exits_zero(self):
        fake = FakeSightline(result="passed")
        try:
            self.assertEqual(self.main(fake.url), 0)
        finally:
            fake.close()
        self.assertIn("no visual changes", self.out.read_text())

    def test_unreachable(self):
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()
        SC.time.sleep, real = (lambda *_: None), SC.time.sleep   # skip retry backoff
        try:
            self.assertEqual(self.main(f"http://127.0.0.1:{port}"), 1)
        finally:
            SC.time.sleep = real
        self.assertIn("server unreachable", self.out.read_text())

    def test_bad_project_is_reported(self):
        fake = FakeSightline(start_status=404)
        try:
            self.assertEqual(self.main(fake.url), 1)
        finally:
            fake.close()
        self.assertIn("Project not found", self.out.read_text())

    @unittest.skipUnless(__import__("importlib").util.find_spec("yaml"), "PyYAML not installed")
    def test_writes_filtered_seldon_file(self):
        import yaml
        fake = FakeSightline(final_result="approved", review_after=2)
        try:
            self.main(fake.url)
        finally:
            fake.close()
        doc = yaml.safe_load((Path(self.tmp.name) / "wren" / "seldon.yml").read_text())
        self.assertEqual([c["id"] for c in doc["testCases"]], ["product-add-to-cart", "cart-checkout"])
        self.assertEqual(doc["run"]["url"], "https://preview.example")


if __name__ == "__main__":
    unittest.main()
