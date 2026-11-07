"""Sightline diff engine.

Compares a candidate capture against a baseline by matching DOM elements rather than raw pixels:
  * volatility learning: elements whose content or pixels differ between repeated loads are dynamic (clocks,
    rotating content, ads) and are ignored, along with residual pixel noise
  * element matching: per structural key, sequence-aligned by content, then re-paired by text/src/position
  * classification: text / image / style / resized / added / removed / moved / visual
  * layout-shift attribution: elements that move together are explained by one upstream change, not reported
  * a plain pixel diff is computed alongside for comparison (what a naive tool would flag)
"""
from __future__ import annotations

import difflib
import hashlib
import re
from collections import defaultdict

import numpy as np
from scipy import ndimage

PIX_T = 25            # per-channel difference that counts as a changed pixel
Rect = list           # [x1, y1, x2, y2]


# ---------------------------------------------------------------- geometry helpers
def area(r): return max(0, r[2] - r[0]) * max(0, r[3] - r[1])


def inter(a, b): return [max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])]


def iou(a, b):
    i = area(inter(a, b))
    u = area(a) + area(b) - i
    return i / u if u else 0.0


def overlaps(a, b, pad=0):
    return not (a[2] + pad <= b[0] or b[2] + pad <= a[0] or a[3] + pad <= b[1] or b[3] + pad <= a[1])


def contains(outer, inner, tol=2):
    return outer[0] - tol <= inner[0] and outer[1] - tol <= inner[1] and outer[2] + tol >= inner[2] and outer[3] + tol >= inner[3]


def union(rects):
    return [min(r[0] for r in rects), min(r[1] for r in rects), max(r[2] for r in rects), max(r[3] for r in rects)]


def clamp(r, img):
    h, w = img.shape[:2]
    return [max(0, min(w, r[0])), max(0, min(h, r[1])), max(0, min(w, r[2])), max(0, min(h, r[3]))]


def crop(img, r):
    x1, y1, x2, y2 = clamp(r, img)
    return img[y1:y2, x1:x2]


def pixdiff(a, b):
    return np.abs(a.astype(np.int16) - b.astype(np.int16)).max(-1) > PIX_T


def crops_differ(a_img, ar, b_img, br, frac=0.004, min_px=12):
    a, b = crop(a_img, ar), crop(b_img, br)
    if a.shape != b.shape or a.size == 0:
        return a.shape != b.shape
    d = pixdiff(a, b)
    n = int(d.sum())
    return n >= min_px and n >= frac * d.size


def regions(mask, min_area=40, dilate=6, cap=400):
    if not mask.any():
        return []
    lab, _ = ndimage.label(ndimage.binary_dilation(mask, iterations=dilate))
    out = []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        if sl is None:
            continue
        sub = mask[sl]
        if (lab[sl] == i + 1).sum() >= min_area and sub.sum() >= 8:
            out.append([int(sl[1].start), int(sl[0].start), int(sl[1].stop), int(sl[0].stop)])
        if len(out) >= cap:
            break
    return out


def dedupe_rects(rects):
    rects = sorted((r for r in rects if area(r) > 0), key=area, reverse=True)
    out = []
    for r in rects:
        if not any(contains(o, r, 4) for o in out):
            out.append(r)
    return out


# ---------------------------------------------------------------- DOM helpers
def ordinals(els):
    seen = defaultdict(int)
    out = []
    for e in els:
        out.append(seen[e["k"]])
        seen[e["k"]] += 1
    return out


def content_sig(e):
    return f'{e["tag"]}|{e["text"]}|{e["src"]}|{e["bgi"]}'


TIMEISH = re.compile(r"^(?:\d+\s*(?:s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|d|days?|w|weeks?|mo|months?|y|years?)\s+ago"
                     r"|just now|now|today|yesterday|\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?)$", re.I)


def is_volatile(e, ordinal, vol):
    return (e.get("dyn") or f'{e["k"]}#{ordinal}' in vol or f'{e["k"]}#*' in vol
            or (e["text"] and len(e["text"]) <= 24 and TIMEISH.match(e["text"]) is not None))


def learn_volatility(loads):
    """loads: [(img, dom)] of the same URL. Returns (volatile id set, pixel noise rects in loads[0] space)."""
    img0, dom0 = loads[0]
    els0 = dom0["els"]
    ord0 = ordinals(els0)
    vol, noise = set(), []
    per_key_total = defaultdict(int)
    for e in els0:
        per_key_total[e["k"]] += 1
    for img1, dom1 in loads[1:]:
        idx1 = {}
        for e, o in zip(dom1["els"], ordinals(dom1["els"])):
            idx1[(e["k"], o)] = e
        vol_rects = []
        keys1 = {k for k, _ in idx1}
        for e, o in zip(els0, ord0):
            f = idx1.get((e["k"], o))
            if f is None:
                if e["k"] in keys1 or len(idx1) > 0:
                    vol.add(f'{e["k"]}#{o}')
                    vol_rects.append(e["r"])
                continue
            dynamic = content_sig(e) != content_sig(f) or e["st"] != f["st"]
            if not dynamic and e["r"] == f["r"] and e["tag"] in ("img", "svg", "canvas", "video", "iframe", "picture"):
                dynamic = crops_differ(img0, e["r"], img1, f["r"], frac=0.01)
            if dynamic:
                vol.add(f'{e["k"]}#{o}')
                vol_rects.append(e["r"])
        if img0.shape == img1.shape:
            m = pixdiff(img0, img1)
            for r in vol_rects:
                x1, y1, x2, y2 = clamp(r, img0)
                m[y1:y2, x1:x2] = False
            noise += regions(m, min_area=1, dilate=3)
    # keys where most instances are volatile are volatile as a whole (lists of rotating items)
    counts = defaultdict(int)
    for v in vol:
        counts[v.rsplit("#", 1)[0]] += 1
    for k, n in counts.items():
        if per_key_total[k] >= 2 and n >= 0.5 * per_key_total[k]:
            vol.add(f"{k}#*")
    return vol, dedupe_rects(noise)


def match(els_b, els_c):
    """Return (pairs [(ib, ic)], added [ic], removed [ib])."""
    by_b, by_c = defaultdict(list), defaultdict(list)
    for i, e in enumerate(els_b):
        by_b[e["k"]].append(i)
    for i, e in enumerate(els_c):
        by_c[e["k"]].append(i)
    pairs, added, removed = [], [], []
    for k in set(by_b) | set(by_c):
        lb, lc = by_b.get(k, []), by_c.get(k, [])
        if not lb:
            added += lc
            continue
        if not lc:
            removed += lb
            continue
        sb = [content_sig(els_b[i]) for i in lb]
        sc = [content_sig(els_c[i]) for i in lc]
        for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, sb, sc, autojunk=False).get_opcodes():
            if tag == "equal" or tag == "replace":
                n = min(i2 - i1, j2 - j1)
                pairs += [(lb[i1 + t], lc[j1 + t]) for t in range(n)]
                removed += lb[i1 + n:i2]
                added += lc[j1 + n:j2]
            elif tag == "delete":
                removed += lb[i1:i2]
            elif tag == "insert":
                added += lc[j1:j2]
    # re-pair elements whose key changed (class rename, wrapper added) but are clearly the same thing
    if added and removed and len(added) * len(removed) <= 250_000:
        cands = []
        for ib in removed:
            b = els_b[ib]
            for ic in added:
                c = els_c[ic]
                if b["tag"] != c["tag"]:
                    continue
                s = 0.0
                if b["text"] and b["text"] == c["text"]:
                    s += 2
                if b["src"] and b["src"] == c["src"]:
                    s += 2
                ov = iou(b["r"], c["r"])
                if ov > 0.6:
                    s += ov
                if s >= 1.6:
                    cands.append((s, ib, ic))
        used_b, used_c = set(), set()
        for s, ib, ic in sorted(cands, reverse=True):
            if ib in used_b or ic in used_c:
                continue
            used_b.add(ib); used_c.add(ic)
            pairs.append((ib, ic))
        removed = [i for i in removed if i not in used_b]
        added = [i for i in added if i not in used_c]
    return pairs, added, removed


# ---------------------------------------------------------------- wording
NOUNS = {"a": "Link", "button": "Button", "img": "Image", "svg": "Icon", "picture": "Image", "video": "Video",
         "h1": "Heading", "h2": "Heading", "h3": "Heading", "h4": "Heading", "h5": "Heading", "h6": "Heading",
         "p": "Paragraph", "span": "Text", "li": "List item", "nav": "Navigation", "header": "Header",
         "footer": "Footer", "input": "Input", "textarea": "Text field", "select": "Dropdown", "label": "Label",
         "table": "Table", "td": "Table cell", "th": "Table header", "form": "Form", "section": "Section",
         "canvas": "Canvas", "iframe": "Embed", "strong": "Text", "em": "Text", "small": "Text", "code": "Code"}
PROP_NAMES = {"color": "text color", "background": "background", "font-size": "font size", "font-weight": "font weight",
              "font-family": "font", "border-color": "border color", "border-width": "border width",
              "border-radius": "corner radius", "opacity": "opacity", "text-decoration": "text decoration",
              "box-shadow": "shadow"}


def noun(e):
    sel = e["sel"].lower()
    if e["tag"] == "button" or re.search(r"\.(btn|button|cta)", sel):
        return "Button"
    if e["tag"] in ("svg", "div", "picture") and re.search(r"\.(photo|image|img|picture|hero-img|thumb|avatar)", sel):
        return "Image"
    if e["tag"] in ("div", "section", "article", "aside", "main") and re.search(r"\.(card|tile|panel)", sel):
        return "Card"
    if e["tag"] in ("div", "section") and re.search(r"\.(banner|promo|alert|notice)", sel):
        return "Banner"
    return NOUNS.get(e["tag"], "Element" if not e["text"] else "Text")


_RGB = re.compile(r"rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)")


def fmt_val(v):
    m = _RGB.fullmatch(v.strip()) if isinstance(v, str) else None
    if m:
        r, g, b, a = m.groups()
        if a is not None and float(a) == 0:
            return "transparent"
        hx = "#%02x%02x%02x" % (int(r), int(g), int(b))
        return hx if a is None or float(a) == 1 else f"{hx} @ {float(a):.2f}"
    return v or "none"


def short(s, n=48):
    s = s or ""
    return s if len(s) <= n else s[: n - 1] + "…"


def src_name(s):
    if not s:
        return "none"
    if s.startswith("svg:"):
        return "inline SVG"
    return short(s.split("?")[0].rstrip("/").rsplit("/", 1)[-1] or s, 40)


# ---------------------------------------------------------------- main comparison
def compare(base_img, base_dom, base_vol, cand_loads, cand_vol=None, cand_noise=None):
    """Diff a candidate against a baseline. Returns a result dict (see jobs.py for persistence)."""
    cand_img, cand_dom = cand_loads[0]
    if cand_vol is None:
        cand_vol, cand_noise = learn_volatility(cand_loads)
    els_b, els_c = base_dom["els"], cand_dom["els"]
    ord_b, ord_c = ordinals(els_b), ordinals(els_c)
    vol_b = [is_volatile(e, o, base_vol) for e, o in zip(els_b, ord_b)]
    vol_c = [is_volatile(e, o, cand_vol) for e, o in zip(els_c, ord_c)]

    pairs, added, removed = match(els_b, els_c)
    page_area = cand_img.shape[0] * cand_img.shape[1]

    noise_rects = [els_c[i]["r"] for i, v in enumerate(vol_c) if v] + list(cand_noise or [])
    ignored_c = set(i for i, v in enumerate(vol_c) if v)
    for ib, ic in pairs:                      # base-side volatility carries over to the matched element
        if vol_b[ib] and ic not in ignored_c:
            ignored_c.add(ic)
            noise_rects.append(els_c[ic]["r"])

    changes, movers = [], []
    vol_rects_c = [els_c[i]["r"] for i in ignored_c]
    vol_rects_b = [els_b[i]["r"] for i, v in enumerate(vol_b) if v]
    noisy_geo = []      # size changes caused by dynamic content: explain shifts, never reported

    def add_change(kind, e_b, e_c, title, detail, before=None, after=None, sig_extra=""):
        e = e_c or e_b
        key = f"{kind}|{sig_extra}" if sig_extra.endswith("|style") else f"{kind}|{e['sel']}|{sig_extra or detail}"
        sig = hashlib.md5(key.encode()).hexdigest()[:16]
        changes.append({"kind": kind, "title": title, "detail": detail, "selector": e["sel"],
                        "bbox": e_c["r"] if e_c else None, "base_bbox": e_b["r"] if e_b else None,
                        "before": before, "after": after, "sig": sig, "_geom": False})
        return changes[-1]

    for ib, ic in pairs:
        if vol_b[ib] or ic in ignored_c:
            b, c = els_b[ib], els_c[ic]
            if (b["r"][2] - b["r"][0], b["r"][3] - b["r"][1]) != (c["r"][2] - c["r"][0], c["r"][3] - c["r"][1]):
                noisy_geo.append({"base_bbox": b["r"], "bbox": c["r"], "_noise": True})
            continue
        b, c = els_b[ib], els_c[ic]
        dw = (c["r"][2] - c["r"][0]) - (b["r"][2] - b["r"][0])
        dh = (c["r"][3] - c["r"][1]) - (b["r"][3] - b["r"][1])
        dx, dy = c["r"][0] - b["r"][0], c["r"][1] - b["r"][1]
        resized = abs(dw) > 2 or abs(dh) > 2
        props = [p for p in b["st"] if fmt_val(b["st"].get(p, "")) != fmt_val(c["st"].get(p, ""))]
        n = noun(c)
        found = []
        if b["text"] != c["text"]:
            found.append(add_change("text", b, c, f"{n} text changed", f'"{short(b["text"])}" → "{short(c["text"])}"',
                                    b["text"], c["text"]))
        if b["src"] != c["src"] or b["bgi"] != c["bgi"]:
            bs, cs = (b["src"], c["src"]) if b["src"] != c["src"] else (b["bgi"], c["bgi"])
            found.append(add_change("image", b, c, f"{'Image' if n in ('Image', 'Icon') else n} changed",
                                    f"{src_name(bs)} → {src_name(cs)}", bs, cs))
        if props:
            detail = ", ".join(f"{PROP_NAMES.get(p, p)} {fmt_val(b['st'].get(p, ''))} → {fmt_val(c['st'].get(p, ''))}"
                               for p in props[:3])
            what = PROP_NAMES.get(props[0], props[0]) if len(props) == 1 else "style"
            # group style changes by the value change itself: one CSS edit hits many selectors
            found.append(add_change("style", b, c, f"{n} {what} changed", detail,
                                    ", ".join(fmt_val(b["st"].get(p, "")) for p in props[:3]),
                                    ", ".join(fmt_val(c["st"].get(p, "")) for p in props[:3]),
                                    sig_extra=f"{c['tag']}|{detail}|style"))
        if resized and not found and (c.get("op") or any(contains(c["r"], vr) for vr in vol_rects_c if vr is not c["r"])):
            noisy_geo.append({"base_bbox": b["r"], "bbox": c["r"], "_noise": True})
            continue
        if resized and not found:
            bw_, bh_ = b["r"][2] - b["r"][0], b["r"][3] - b["r"][1]
            found.append(add_change("resized", b, c, f"{n} resized", f"{bw_}×{bh_} → {bw_ + dw}×{bh_ + dh}",
                                    f"{bw_}×{bh_}", f"{bw_ + dw}×{bh_ + dh}", sig_extra=f"{dw}x{dh}"))
        if not resized and (abs(dx) > 1 or abs(dy) > 1):
            movers.append((ib, ic, dx, dy))
        elif (not found and area(c["r"]) < 0.25 * page_area and (c["text"] or c["tag"] in ("img", "svg", "input", "picture"))
              and not any(overlaps(c["r"], vr) for vr in vol_rects_c) and not any(overlaps(b["r"], vr) for vr in vol_rects_b)):
            if crops_differ(base_img, b["r"], cand_img, c["r"]):
                w_, h_ = c["r"][2] - c["r"][0], c["r"][3] - c["r"][1]
                found.append(add_change("visual", b, c, f"{n} looks different", f"pixels changed in a {w_}×{h_} area",
                                        sig_extra="visual"))
        for ch in found:
            ch["_geom"] = resized
            ch["_ic"] = ic

    def collapse(idx, els):
        idx = [i for i in idx if area(els[i]["r"]) >= 16]
        idx.sort(key=lambda i: area(els[i]["r"]), reverse=True)
        kept = []
        for i in idx:
            if not any(contains(els[k]["r"], els[i]["r"]) for k in kept):
                kept.append(i)
        return kept

    for ic in collapse([i for i in added if i not in ignored_c], els_c):
        c = els_c[ic]
        what = f'"{short(c["text"], 60)}"' if c["text"] else src_name(c["src"]) if c["src"] else c["sel"]
        ch = add_change("added", None, c, f"{noun(c)} added", what, None, c["text"] or c["src"] or None)
        ch["_geom"] = True
    for ib in collapse([i for i, v in zip(removed, [vol_b[i] for i in removed]) if not v], els_b):
        b = els_b[ib]
        what = f'"{short(b["text"], 60)}"' if b["text"] else src_name(b["src"]) if b["src"] else b["sel"]
        ch = add_change("removed", b, None, f"{noun(b)} missing", what, b["text"] or b["src"] or None, None)
        ch["_geom"] = True

    # drop "resized" containers that merely wrap another change
    def explains(outer, inner):
        ro = outer["bbox"] or outer["base_bbox"]
        ri = inner["bbox"] or inner["base_bbox"]
        return outer is not inner and contains(ro, ri)
    changes = [ch for ch in changes if not (ch["kind"] == "resized" and any(explains(ch, o) for o in changes))]

    # ---- layout shifts: movers sharing a displacement vector are explained by one upstream geometric change
    clusters = defaultdict(list)
    for ib, ic, dx, dy in movers:
        clusters[(round(dx / 2) * 2, round(dy / 2) * 2)].append((ib, ic))
    geo = [ch for ch in changes if ch["_geom"]] + noisy_geo
    layout_shifts, moved_changes = [], []
    for (dx, dy), members in sorted(clusters.items(), key=lambda kv: -len(kv[1])):
        rb = [els_b[ib]["r"] for ib, _ in members]
        rc = [els_c[ic]["r"] for _, ic in members]
        from_y = min(r[1] for r in rb)
        min_x = min(r[0] for r in rb)
        cause = None
        best = None
        for ch in geo:
            r = ch["base_bbox"] or ch["bbox"]
            if dy != 0 and r[1] <= from_y + 4:
                score = r[3]
            elif dy == 0 and dx != 0 and r[0] <= min_x + 4 and any(overlaps([0, r[1], 10**6, r[3]], m) for m in rb):
                score = r[2]
            else:
                continue
            if best is None or score > best:
                best, cause = score, ch
        if cause is not None:
            layout_shifts.append({"dx": dx, "dy": dy, "from_y": from_y, "elements": len(members),
                                  "_cause": None if cause.get("_noise") else cause})
            continue
        # no upstream cause: the moved elements themselves are the regression. Report the outermost ones.
        top = collapse([ic for _, ic in members], els_c)
        if len(top) > 3:
            e = els_c[top[0]]
            ub = union(rb)
            uc = union(rc)
            changes.append({"kind": "moved", "title": f"{len(members)} elements moved", "detail": _dir(dx, dy),
                            "selector": e["sel"], "bbox": uc, "base_bbox": ub, "before": None, "after": None,
                            "sig": hashlib.md5(f"moved|{e['sel']}|{dx},{dy}".encode()).hexdigest()[:16], "_geom": True})
        else:
            ic_to_ib = {ic: ib for ib, ic in members}
            for ic in top:
                b, c = els_b[ic_to_ib[ic]], els_c[ic]
                add_change("moved", b, c, f"{noun(c)} moved", _dir(dx, dy), sig_extra=f"{dx},{dy}")

    # ---- naive pixel diff (for comparison) + residual pixel changes no element explains
    h = min(base_img.shape[0], cand_img.shape[0])
    w = min(base_img.shape[1], cand_img.shape[1])
    naive_mask = np.ones((cand_img.shape[0], cand_img.shape[1]), bool)
    naive_mask[:h, :w] = pixdiff(base_img[:h, :w], cand_img[:h, :w])
    if cand_img.shape[1] > w:
        naive_mask[:, w:] = True
    naive_regions = regions(naive_mask)
    naive_pct = round(float(naive_mask.mean() * 100), 2)

    bw0, cw0 = base_img.shape[1], cand_img.shape[1]
    if abs(cw0 - bw0) > 2:
        changes.append({"kind": "resized", "title": "Page width changed",
                        "detail": f"{bw0}px → {cw0}px" + (" (content overflows horizontally)" if cw0 > bw0 else ""),
                        "selector": "html", "bbox": [min(bw0, cw0), 0, cw0, cand_img.shape[0]] if cw0 > bw0 else None,
                        "base_bbox": [cw0, 0, bw0, base_img.shape[0]] if bw0 > cw0 else None,
                        "before": f"{bw0}px", "after": f"{cw0}px",
                        "sig": hashlib.md5(f"pagewidth|{bw0}|{cw0}".encode()).hexdigest()[:16], "_geom": False})
    changes += _container_check(base_img, cand_img, els_b, els_c, pairs, vol_b, ignored_c, movers, added, changes,
                                page_area)

    # finalize
    cid = {id(ch): i for i, ch in enumerate(changes)}
    for ls in layout_shifts:
        ls["cause_index"] = cid.get(id(ls.pop("_cause")))
    for ch in changes:
        for k in ("_geom", "_ib", "_ic"):
            ch.pop(k, None)
    change_boxes = [ch["bbox"] or ch["base_bbox"] for ch in changes]
    ignored = sum(1 for r in naive_regions if not any(overlaps(r, cb, 4) for cb in change_boxes))
    return {
        "changes": changes,
        "layout_shifts": layout_shifts,
        "noise_rects": dedupe_rects(noise_rects)[:300],
        "pixel_regions": naive_regions,
        "pixel_pct": naive_pct,
        "noise_ignored": ignored,
        "naive_mask": naive_mask,
        "volatile": sorted(cand_vol | {v for v in base_vol if v.endswith("#*")}),
    }


def _dir(dx, dy):
    parts = []
    if dy:
        parts.append(f"{abs(dy)}px {'down' if dy > 0 else 'up'}")
    if dx:
        parts.append(f"{abs(dx)}px {'right' if dx > 0 else 'left'}")
    return "moved " + " and ".join(parts)


def _container_check(base_img, cand_img, els_b, els_c, pairs, vol_b, ignored_c, movers, added, changes, page_area):
    """Catch paint changes the DOM doesn't describe (pseudo-elements, filters, backgrounds drawn by children).
    Compares each matched container's own crop, but only when nothing inside it is already explained, moving or
    volatile: then any pixel difference must come from the container itself. Shift-proof: crops are taken at each
    element's own position in its own screenshot."""
    if not pairs:
        return []
    dirty = set(ignored_c) | {ic for _, ic, *_ in movers} | set(added) | {ch["_ic"] for ch in changes if "_ic" in ch}
    for ib, ic in pairs:
        if vol_b[ib]:
            dirty.add(ic)
    rc = np.array([e["r"] for e in els_c], dtype=np.int32)
    dirty_idx = np.array(sorted(dirty), dtype=np.int32)
    dr = rc[dirty_idx] if len(dirty_idx) else np.zeros((0, 4), np.int32)
    removed_boxes = [ch["base_bbox"] for ch in changes if ch["kind"] == "removed" and ch["base_bbox"]]
    flagged = []
    for ib, ic in pairs:
        if ic in dirty:
            continue
        b, c = els_b[ib], els_c[ic]
        r = c["r"]
        if area(r) >= 0.25 * page_area or area(r) < 64 or b["r"][2] - b["r"][0] != r[2] - r[0] or b["r"][3] - b["r"][1] != r[3] - r[1]:
            continue
        if len(dr):
            inside = (dr[:, 0] >= r[0] - 2) & (dr[:, 1] >= r[1] - 2) & (dr[:, 2] <= r[2] + 2) & (dr[:, 3] <= r[3] + 2)
            ovl = (dr[:, 0] < r[2]) & (dr[:, 2] > r[0]) & (dr[:, 1] < r[3]) & (dr[:, 3] > r[1])
            if inside.any() or ovl.any():
                continue
        if any(overlaps(b["r"], rb) for rb in removed_boxes):
            continue
        if crops_differ(base_img, b["r"], cand_img, r, frac=0.01, min_px=40):
            flagged.append((ib, ic))
    # keep the innermost flagged element of each nested chain
    keep = [(ib, ic) for ib, ic in flagged
            if not any(o != ic and contains(els_c[ic]["r"], els_c[o]["r"]) for _, o in flagged)]
    out = []
    for ib, ic in keep[:10]:
        b, c = els_b[ib], els_c[ic]
        w_, h_ = c["r"][2] - c["r"][0], c["r"][3] - c["r"][1]
        out.append({"kind": "visual", "title": f"{noun(c)} looks different", "detail": f"pixels changed in a {w_}×{h_} area",
                    "selector": c["sel"], "bbox": c["r"], "base_bbox": b["r"], "before": None, "after": None,
                    "sig": hashlib.md5(f"visual|{c['sel']}|{w_}x{h_}".encode()).hexdigest()[:16], "_geom": False})
    return out
