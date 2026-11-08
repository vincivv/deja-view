"""Unit tests for change-aware Wren routing. Run: python3 -m unittest discover -s ci/github-action/tests"""
import json
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import wren_routing as W  # noqa: E402

FIX = HERE / "fixtures"
CASES = [{"id": i, "name": i.replace("-", " ")} for i in
         ("home-bestsellers", "nav-links", "pricing-plans", "join-acme-plus", "product-add-to-cart", "cart-checkout")]
MAPPING = {"unmapped": "run", "cases": {
    "home-bestsellers": {"pages": ["/"]},
    "nav-links": {"pages": ["/", "/pricing"]},
    "pricing-plans": {"pages": ["/pricing"]},
    "join-acme-plus": {"pages": ["/", "/pricing"]},
    "product-add-to-cart": {"pages": ["/", "/product", "/cart"]},
    "cart-checkout": {"pages": ["/cart"]},
}}


def ids(items):
    return [i["id"] for i in items]


class PathTests(unittest.TestCase):
    def test_norm_path(self):
        self.assertEqual(W.norm_path(""), "/")
        self.assertEqual(W.norm_path("/"), "/")
        self.assertEqual(W.norm_path("product/"), "/product")
        self.assertEqual(W.norm_path("https://x.dev/cart?a=1#top"), "/cart")

    def test_page_matches(self):
        self.assertTrue(W.page_matches("/cart", "/cart/"))
        self.assertFalse(W.page_matches("/", "/cart"))           # root is exact, not a prefix
        self.assertTrue(W.page_matches("/docs/*", "/docs/a/b"))
        self.assertFalse(W.page_matches("/docs/*", "/docs"))


class AffectedPagesTests(unittest.TestCase):
    def test_real_run_detail(self):
        run = json.loads((FIX / "run_changes.json").read_text())
        pages = W.affected_pages(run)
        self.assertEqual(sorted(pages), ["/cart", "/product"])
        self.assertEqual(sorted(pages["/product"]["viewports"]), [390, 1280])
        self.assertIn("Image missing", pages["/product"]["changes"])

    def test_failed_snapshot_counts_new_only_after_baseline(self):
        run = {"is_baseline_build": False, "snapshots": [
            {"path": "/a", "name": "A", "viewport": 1280, "status": "failed", "changes": []},
            {"path": "/b", "name": "B", "viewport": 1280, "status": "new", "changes": []},
            {"path": "/c", "name": "C", "viewport": 1280, "status": "unchanged", "changes": []}]}
        self.assertEqual(sorted(W.affected_pages(run)), ["/a", "/b"])
        run["is_baseline_build"] = True
        self.assertEqual(sorted(W.affected_pages(run)), ["/a"])


class RouteTests(unittest.TestCase):
    def test_only_flows_through_changed_pages(self):
        r = W.route(CASES, MAPPING, ["/product", "/cart"], "changes")
        self.assertEqual(ids(r["selected"]), ["product-add-to-cart", "cart-checkout"])
        self.assertEqual(r["total"], 6)
        self.assertEqual(len(r["skipped"]), 4)
        self.assertEqual(r["selected"][0]["matched"], ["/cart", "/product"])

    def test_no_changes_selects_nothing_but_always(self):
        m = json.loads(json.dumps(MAPPING))
        m["cases"]["home-bestsellers"]["always"] = True
        r = W.route(CASES, m, [], "passed")
        self.assertEqual(r["mode"], "none")
        self.assertEqual(ids(r["selected"]), ["home-bestsellers"])

    def test_failed_build_selects_everything(self):
        r = W.route(CASES, MAPPING, [], "failed")
        self.assertEqual(r["mode"], "all")
        self.assertEqual(len(r["selected"]), 6)

    def test_unmapped_policy(self):
        cases = CASES + [{"id": "new-flow", "name": "New flow"}]
        self.assertIn("new-flow", ids(W.route(cases, MAPPING, ["/cart"], "changes")["selected"]))
        skip = dict(MAPPING, unmapped="skip")
        self.assertIn("new-flow", ids(W.route(cases, skip, ["/cart"], "changes")["skipped"]))

    def test_no_mapping_at_all_runs_everything(self):
        r = W.route(CASES, None, ["/cart"], "changes")
        self.assertEqual(len(r["selected"]), 6)

    def test_home_change_routes_home_flows(self):
        r = W.route(CASES, MAPPING, ["/"], "changes")
        self.assertEqual(ids(r["selected"]), ["home-bestsellers", "nav-links", "join-acme-plus", "product-add-to-cart"])


class SeldonFileTests(unittest.TestCase):
    def test_filter_keeps_order_and_leaves_source_alone(self):
        doc = {"version": 1, "name": "x", "testCases": [{"id": "a"}, {"id": "b"}, {"id": "c"}]}
        out = W.filter_seldon(doc, ["c", "a"])
        self.assertEqual(ids(out["testCases"]), ["a", "c"])
        self.assertEqual(len(doc["testCases"]), 3)

    def test_command_is_quoted(self):
        self.assertEqual(W.seldon_command("https://p.dev", "sightline-wren"),
                         "cd sightline-wren && seldon run --url https://p.dev")
        self.assertIn("'a b'", W.seldon_command("https://p.dev", "a b"))

    @unittest.skipUnless(__import__("importlib").util.find_spec("yaml"), "PyYAML not installed")
    def test_demo_repo_files(self):
        import yaml
        doc = yaml.safe_load((FIX / "seldon.yml").read_text())
        mapping = yaml.safe_load((FIX / "wren.yml").read_text())
        self.assertEqual({c["id"] for c in doc["testCases"]}, set(mapping["cases"]))
        r = W.route(doc["testCases"], mapping, ["/product", "/cart"], "changes")
        self.assertEqual(ids(r["selected"]), ["product-add-to-cart", "cart-checkout"])


if __name__ == "__main__":
    unittest.main()
