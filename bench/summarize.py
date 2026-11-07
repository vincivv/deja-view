"""Print the mutation-benchmark scorecard from bench/results/mutations.json."""
import json, statistics as st, sys
from collections import defaultdict
from pathlib import Path
d = json.load(open(Path(__file__).resolve().parent / "results/mutations.json"))
cases = [dict(c, site=s["site"]) for s in d for c in s["cases"] if not c.get("skip") and not c.get("error")]
muts = [c for c in cases if c["op"] != "none"]
ctrl = [c for c in cases if c["op"] == "none"]
pct = lambda xs: f"{100 * sum(xs) / len(xs):.0f}%" if xs else "-"
print(f"sites {len(d)} | mutation cases {len(muts)} | controls {len(ctrl)} | skipped {sum(1 for s in d for c in s['cases'] if c.get('skip'))} | errors {sum(1 for s in d for c in s['cases'] if c.get('error'))}")
print(f"DETECTED {pct([c['detected'] for c in muts])} | LABEL RIGHT {pct([c['label_ok'] for c in muts])} | "
      f"cases with 0 false alarms {pct([c['false_alarms'] == 0 for c in muts])} | mean false alarms/case {st.mean(c['false_alarms'] for c in muts):.2f}")
print(f"controls (no change): Sightline false alarms mean {st.mean(c['false_alarms'] for c in ctrl):.2f}, clean {pct([c['false_alarms'] == 0 for c in ctrl])} | "
      f"pixel-diff regions mean {st.mean(c['pixel_regions'] for c in ctrl):.1f}, clean {pct([c['pixel_regions'] == 0 for c in ctrl])}")
print(f"pixel diff on mutation cases: mean regions {st.mean(c['pixel_regions'] for c in muts):.1f}, mean regions outside the change {st.mean(c['pixel_noise'] for c in muts):.1f}; "
      f"Sightline items reported mean {st.mean(c['hits'] + c['false_alarms'] for c in muts):.2f}")
print(f"\n{'operator':12} {'n':>3} {'found':>6} {'label':>6} {'0 FA':>5} {'FA/case':>8} {'px regions':>10} {'our items':>9}")
by = defaultdict(list)
for c in muts:
    by[c["op"]].append(c)
for op, cs in by.items():
    print(f"{op:12} {len(cs):3} {pct([c['detected'] for c in cs]):>6} {pct([c['label_ok'] for c in cs]):>6} {pct([c['false_alarms'] == 0 for c in cs]):>5} "
          f"{st.mean(c['false_alarms'] for c in cs):8.2f} {st.mean(c['pixel_regions'] for c in cs):10.1f} {st.mean(c['hits'] + c['false_alarms'] for c in cs):9.2f}")
if "-v" in sys.argv:
    print("\nMISSES / WRONG LABEL / FALSE ALARMS")
    for c in cases:
        if c["op"] == "none" and c["false_alarms"] or c["op"] != "none" and (not c["detected"] or not c["label_ok"] or c["false_alarms"]):
            print(f"- {c['site'].split('//')[1][:28]:28} {c['op']:11} found={c['detected']} label={c['label_ok']} hits={c.get('hit_detail')} FA={c['false_detail']}")
