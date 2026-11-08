#!/usr/bin/env python3
"""Create a Sightline project for CI and (optionally) capture its first build as the baseline.

  SIGHTLINE_URL=http://127.0.0.1:8000 SIGHTLINE_TOKEN=sl_... python3 bootstrap_project.py \
      --name "Acme Shop" --paths / /product /pricing /cart --viewports 1280 390 \
      --baseline-url http://127.0.0.1:4173

Prints the project id (put it in the repo variable SIGHTLINE_PROJECT_ID). Standard library only.
"""
import argparse
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sightline_check import Sightline  # noqa: E402


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--url", default=os.environ.get("SIGHTLINE_URL", "http://127.0.0.1:8000"))
    a.add_argument("--name", required=True)
    a.add_argument("--paths", nargs="+", default=["/"])
    a.add_argument("--viewports", nargs="+", type=int, default=[1280, 390])
    a.add_argument("--baseline-url", help="capture this URL now as the first (baseline) build")
    args = a.parse_args()
    token = os.environ.get("SIGHTLINE_TOKEN")
    if not token:
        sys.exit("set SIGHTLINE_TOKEN (create one in Sightline > Settings > API tokens)")
    sl = Sightline(args.url, token)
    p = sl.call("POST", "/api/projects", {"name": args.name, "base_url": args.baseline_url or "https://example.com",
                                          "paths": args.paths, "viewports": args.viewports})
    print(f"project {p['id']} created", file=sys.stderr)
    if args.baseline_url:
        r = sl.start_run(p["id"], args.baseline_url, "Baseline · main")
        while True:
            s = sl.status(r["id"])
            if s["status"] in ("done", "failed"):
                break
            time.sleep(1)
        print(f"baseline build #{s['number']}: {s['status']} {s['result']} "
              f"({s['counts']['snapshots']} snapshots, {s['counts']['failed']} failed)", file=sys.stderr)
    print(p["id"])


if __name__ == "__main__":
    main()
