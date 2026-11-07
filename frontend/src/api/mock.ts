// In-memory mock of the Sightline backend (enable with VITE_MOCK=1).
// Implements the same contract as docs/API.md, including streaming builds.
import { ABOUT_TEXT, CTA_COLORS, renderOverlay, renderPage, type PageKind, type Rendered } from "./mockPages";
import type {
  Baseline,
  Change,
  CreateProjectBody,
  CreateRunBody,
  Group,
  LayoutShift,
  Project,
  ProjectPath,
  Rect,
  Review,
  ReviewStatus,
  RunDetail,
  RunSummary,
  SightlineApi,
  Snapshot,
  UpdateProjectBody,
} from "./types";
import { ApiError } from "./client";

const DEMO_ORIGIN = "http://127.0.0.1:8000";
const SNAP_MS = 380; // simulated capture+diff time per snapshot
const QUEUE_MS = 700;

interface StoredProject extends Omit<Project, "last_run" | "baseline_count"> {}

interface BaselineEntry {
  render: Rendered;
  variant: "v1" | "v2";
  run_id: string;
  updated_at: string;
}

interface StoredRun {
  detail: RunDetail; // final state
  startedAt: number;
}

const projects: StoredProject[] = [];
const runs: StoredRun[] = [];
const baselines = new Map<string, Map<string, BaselineEntry>>(); // projectId -> key -> entry

let idSeq = 100;
const uid = (p: string) => `${p}_${(idSeq++).toString(36)}`;
const delay = (ms = 120 + Math.random() * 120) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(v: T): T => structuredClone(v);
const bkey = (path: string, vp: number) => `${path}@${vp}`;

function kindFor(path: string, isDemo: boolean): PageKind {
  if (!isDemo) return path === "/" ? "home" : "generic";
  if (path === "/") return "home";
  if (path.startsWith("/products/")) return "product";
  if (path.startsWith("/products")) return "products";
  if (path.startsWith("/cart")) return "cart";
  if (path.startsWith("/about")) return "about";
  return "generic";
}

function clockAt(t: number) {
  const d = new Date(t);
  return d.toTimeString().slice(0, 8);
}

function area([x1, y1, x2, y2]: Rect) {
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function splitRect([x1, y1, x2, y2]: Rect, n: number): Rect[] {
  const w = (x2 - x1) / n;
  return Array.from({ length: n }, (_, i) => [Math.round(x1 + i * w + 2), y1 + 4, Math.round(x1 + (i + 1) * w - 2), y2 - 4] as Rect);
}

// ---------- diff engine (fake) ----------

interface PlannedChange extends Omit<Change, "id" | "snapshot_id" | "group_id"> {
  groupKey: string;
}

function plannedChanges(kind: PageKind, base: Rendered, baseV: "v1" | "v2", next: Rendered, nextV: "v1" | "v2"): PlannedChange[] {
  if (baseV === nextV) return [];
  const out: PlannedChange[] = [];
  const before = CTA_COLORS[baseV];
  const after = CTA_COLORS[nextV];
  if (base.boxes.cta && next.boxes.cta) {
    out.push({
      groupKey: "style:cta",
      kind: "style",
      title: "Button color changed",
      detail: `background-color ${before} → ${after}`,
      selector: "a.btn.cta",
      bbox: next.boxes.cta,
      base_bbox: base.boxes.cta,
      before,
      after,
    });
  }
  if (kind === "about") {
    const b = ABOUT_TEXT[baseV];
    const a = ABOUT_TEXT[nextV];
    out.push({
      groupKey: "text:about",
      kind: "text",
      title: "Text changed",
      detail: `“${b.slice(0, 38)}…” → “${a.slice(0, 38)}…”`,
      selector: "section.story > p.lead",
      bbox: next.boxes.aboutText,
      base_bbox: base.boxes.aboutText,
      before: b,
      after: a,
    });
  }
  if (kind === "product") {
    if (base.boxes.thumb3 && !next.boxes.thumb3) {
      out.push({
        groupKey: "removed:thumb",
        kind: "removed",
        title: "Image missing",
        detail: "Gallery thumbnail 3 of 4 is no longer rendered",
        selector: "ul.gallery > li:nth-child(3) > img",
        bbox: null,
        base_bbox: base.boxes.thumb3,
        before: "/img/linen-shirt-3.jpg",
        after: null,
      });
    } else if (!base.boxes.thumb3 && next.boxes.thumb3) {
      out.push({
        groupKey: "added:thumb",
        kind: "added",
        title: "Image added",
        detail: "Gallery thumbnail 3 of 4 now rendered",
        selector: "ul.gallery > li:nth-child(3) > img",
        bbox: next.boxes.thumb3,
        base_bbox: null,
        before: null,
        after: "/img/linen-shirt-3.jpg",
      });
    }
  }
  return out;
}

function buildSnapshot(
  run_id: string,
  p: ProjectPath,
  vp: number,
  kind: PageKind,
  next: Rendered,
  nextV: "v1" | "v2",
  base: BaselineEntry | undefined,
  rand: () => number,
): { snap: Snapshot; planned: PlannedChange[] } {
  const id = uid("snap");
  const noise: Rect[] = [];
  const regions: Rect[] = [];
  const shifts: LayoutShift[] = [];
  let planned: PlannedChange[] = [];

  if (base) {
    // dynamic content + anti-aliasing = noise
    if (next.boxes.clock) {
      noise.push(next.boxes.clock);
      regions.push(...splitRect(next.boxes.clock, 2));
    }
    if (next.boxes.carousel) {
      const [x1, y1, x2] = next.boxes.carousel;
      const cx = (x1 + x2) / 2;
      const quote: Rect = [Math.round(cx - Math.min(300, (x2 - x1) / 2 - 10)), y1 + 76, Math.round(cx + Math.min(300, (x2 - x1) / 2 - 10)), y1 + 154];
      noise.push(quote, [Math.round(cx - 34), y1 + 180, Math.round(cx + 34), y1 + 200]);
      regions.push(...splitRect(quote, vp < 700 ? 3 : 6), [Math.round(cx - 34), y1 + 180, Math.round(cx + 34), y1 + 200]);
    }
    const aa = next.aa.filter(() => rand() > 0.15).slice(0, 24);
    noise.push(...aa);
    regions.push(...aa);

    planned = plannedChanges(kind, base.render, base.variant, next, nextV);
    for (const c of planned) {
      if (c.bbox) regions.push(c.bbox);
      else if (c.base_bbox) regions.push(c.base_bbox);
    }
    // text reflow -> layout shift
    const t = planned.find((c) => c.kind === "text");
    if (t && t.bbox && t.base_bbox) {
      const dy = t.bbox[3] - t.base_bbox[3];
      if (dy !== 0) {
        const from_y = t.base_bbox[3];
        const moved = next.els.filter((e) => e.r[1] > t.bbox![3] + 4);
        shifts.push({ dy, dx: 0, from_y, elements: moved.length, cause_change_id: null });
        // naive pixel diff flags every moved element
        regions.push(...moved.map((e) => e.r));
      }
    }
  }

  const pct = base ? +((regions.reduce((s, r) => s + area(r), 0) / (next.width * next.height)) * 100).toFixed(2) : 0;
  const status: Snapshot["status"] = !base ? "new" : planned.length ? "changed" : "unchanged";
  const snap: Snapshot = {
    id,
    run_id,
    path: p.path,
    name: p.name,
    viewport: vp,
    status,
    review: status === "changed" ? "pending" : null,
    image_url: next.url,
    width: next.width,
    height: next.height,
    baseline_image_url: base?.render.url ?? null,
    baseline_width: base?.render.width ?? null,
    baseline_height: base?.render.height ?? null,
    noise_rects: noise,
    pixel_diff: { regions, pct, overlay_url: base && regions.length ? renderOverlay(next.width, next.height, regions) : null },
    layout_shifts: shifts,
    changes: [],
    duration_ms: Math.round(700 + rand() * 1900),
    error: null,
  };
  return { snap, planned };
}

function rngSeed(seed: number) {
  let s = seed || 7;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function variantOf(project: StoredProject, url: string): "v1" | "v2" {
  return project.is_demo && /\/v2\b/.test(url) ? "v2" : "v1";
}

function emptyCounts(): RunSummary["counts"] {
  return { snapshots: 0, unchanged: 0, changed: 0, new: 0, failed: 0, changes: 0, groups: 0, noise_ignored: 0, pixel_regions: 0 };
}

function createRunInternal(project: StoredProject, body: CreateRunBody, startedAt: number, opts?: { failPath?: string; runError?: string }) {
  const id = uid("run");
  const target = (body.base_url || project.base_url).replace(/\/$/, "");
  const variant = variantOf(project, target);
  const projBaselines = baselines.get(project.id) ?? new Map<string, BaselineEntry>();
  baselines.set(project.id, projBaselines);
  const isBaseline = projBaselines.size === 0;
  const number = runs.filter((r) => r.detail.project_id === project.id).length + 1;
  const rand = rngSeed(number * 97 + project.name.length);

  const snapshots: Snapshot[] = [];
  const groups = new Map<string, Group>();
  for (const p of project.paths) {
    for (const vp of project.viewports) {
      const kind = kindFor(p.path, project.is_demo);
      const render = renderPage(kind, vp, { v2: variant === "v2", clock: clockAt(startedAt + snapshots.length * 1300), slide: number, title: p.name }, number);
      const base = projBaselines.get(bkey(p.path, vp));
      const { snap, planned } = buildSnapshot(id, p, vp, kind, render, variant, base, rand);
      if (opts?.failPath === p.path) {
        snap.status = "failed";
        snap.review = null;
        snap.error = `TimeoutError: page.goto: Timeout 30000ms exceeded.\nnavigating to "${target}${p.path}", waiting until "networkidle"`;
        snap.changes = [];
        snap.noise_rects = [];
        snap.pixel_diff = { regions: [], pct: 0, overlay_url: null };
        snapshots.push(snap);
        continue;
      }
      for (const pc of planned) {
        let g = groups.get(pc.groupKey);
        if (!g) {
          g = {
            id: uid("grp"),
            run_id: id,
            kind: pc.kind,
            title: pc.title,
            detail: pc.detail,
            selector: pc.selector,
            change_ids: [],
            snapshot_ids: [],
            count: 0,
            review: "pending",
          };
          groups.set(pc.groupKey, g);
        }
        const { groupKey: _gk, ...rest } = pc;
        void _gk;
        const change: Change = { ...rest, id: uid("chg"), snapshot_id: snap.id, group_id: g.id };
        snap.changes.push(change);
        g.change_ids.push(change.id);
        if (!g.snapshot_ids.includes(snap.id)) g.snapshot_ids.push(snap.id);
        g.count++;
      }
      for (const ls of snap.layout_shifts) ls.cause_change_id = snap.changes.find((c) => c.kind === "text")?.id ?? null;
      snapshots.push(snap);
    }
  }
  // text group: details are page-specific; keep the more specific first change's detail
  const total = snapshots.length;
  const duration = QUEUE_MS + total * SNAP_MS + 300;
  const detail: RunDetail = {
    id,
    project_id: project.id,
    project: { id: project.id, name: project.name },
    number,
    label: body.label ?? "",
    base_url: target,
    status: opts?.runError ? "failed" : "done",
    error: opts?.runError ?? null,
    created_at: new Date(startedAt).toISOString(),
    finished_at: new Date(startedAt + duration).toISOString(),
    duration_ms: duration,
    progress: { done: total, total },
    is_baseline_build: isBaseline,
    result: "passed",
    counts: emptyCounts(),
    snapshots,
    groups: [...groups.values()],
  };
  recompute(detail);
  const stored: StoredRun = { detail, startedAt };
  runs.push(stored);
  return stored;
}

function recompute(d: RunDetail) {
  const s = d.snapshots;
  d.counts = {
    snapshots: d.progress.total,
    unchanged: s.filter((x) => x.status === "unchanged").length,
    changed: s.filter((x) => x.status === "changed").length,
    new: s.filter((x) => x.status === "new").length,
    failed: s.filter((x) => x.status === "failed").length,
    changes: s.reduce((n, x) => n + x.changes.length, 0),
    groups: d.groups.length,
    noise_ignored: s.reduce((n, x) => n + x.noise_rects.length, 0),
    pixel_regions: s.reduce((n, x) => n + x.pixel_diff.regions.length, 0),
  };
  // snapshot review derived from its groups
  const gById = new Map(d.groups.map((g) => [g.id, g]));
  for (const snap of s) {
    if (snap.status !== "changed") continue;
    const reviews = snap.changes.map((c) => gById.get(c.group_id)?.review ?? "pending");
    snap.review = reviews.includes("rejected") ? "rejected" : reviews.every((r) => r === "approved") ? "approved" : "pending";
  }
  if (d.status === "failed") d.result = "failed";
  else if (d.status !== "done") d.result = "running";
  else if (d.groups.length === 0) d.result = d.counts.failed > 0 ? "failed" : "passed";
  else if (d.groups.some((g) => g.review === "rejected")) d.result = "rejected";
  else if (d.groups.every((g) => g.review === "approved")) d.result = "approved";
  else d.result = "changes";
}

/** Commit baselines for a finished run (baseline build: all; else approved/unchanged snapshots). */
function promoteBaselines(run: StoredRun, onlyApproved: boolean) {
  const d = run.detail;
  const project = projects.find((p) => p.id === d.project_id);
  if (!project) return;
  const map = baselines.get(project.id) ?? new Map<string, BaselineEntry>();
  baselines.set(project.id, map);
  const variant = variantOf(project, d.base_url);
  for (const snap of d.snapshots) {
    if (snap.status === "failed") continue;
    const ok = !onlyApproved ? snap.status === "new" || snap.status === "unchanged" : snap.review === "approved";
    if (!ok) continue;
    const kind = kindFor(snap.path, project.is_demo);
    const render = renderPage(kind, snap.viewport, { v2: variant === "v2", clock: "", slide: d.number, title: snap.name }, d.number);
    render.url = snap.image_url;
    map.set(bkey(snap.path, snap.viewport), { render, variant, run_id: d.id, updated_at: new Date().toISOString() });
  }
}

/** Live view of a run, simulating progress. */
function view(run: StoredRun): RunDetail {
  const d = run.detail;
  const elapsed = Date.now() - run.startedAt;
  if (elapsed >= (d.duration_ms ?? 0) || d.status === "failed") {
    if (!(run as StoredRun & { _promoted?: boolean })._promoted) {
      (run as StoredRun & { _promoted?: boolean })._promoted = true;
      if (d.status === "done") promoteBaselines(run, false);
    }
    return clone(d);
  }
  const total = d.progress.total;
  const done = Math.max(0, Math.min(total, Math.floor((elapsed - QUEUE_MS) / SNAP_MS)));
  const v = clone(d);
  v.status = elapsed < QUEUE_MS ? "queued" : done < total ? "capturing" : "diffing";
  v.progress = { done, total };
  v.finished_at = null;
  v.duration_ms = null;
  v.snapshots = d.snapshots.slice(0, done).map((s) => clone(s));
  v.groups = [];
  v.result = "running";
  recompute(v);
  v.counts.snapshots = total;
  return v;
}

function summary(d: RunDetail): RunSummary {
  const { snapshots: _s, groups: _g, project: _p, ...rest } = d;
  void _s;
  void _g;
  void _p;
  return rest;
}

function projectOut(p: StoredProject): Project {
  const pr = runs.filter((r) => r.detail.project_id === p.id);
  const last = pr.length ? summary(view(pr[pr.length - 1])) : null;
  return { ...clone(p), baseline_count: baselines.get(p.id)?.size ?? 0, last_run: last };
}

function findProject(id: string) {
  const p = projects.find((x) => x.id === id);
  if (!p) throw new ApiError(404, "Project not found");
  return p;
}
function findRun(id: string) {
  const r = runs.find((x) => x.detail.id === id);
  if (!r) throw new ApiError(404, "Build not found");
  return r;
}

function normPaths(paths: string[] | ProjectPath[]): ProjectPath[] {
  return paths.map((p) => {
    if (typeof p !== "string") return p;
    const path = p.startsWith("/") ? p : `/${p}`;
    const seg = path.split("/").filter(Boolean).pop();
    const name = seg ? seg.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Home";
    return { path, name };
  });
}

function applyReview(run: StoredRun, groupIds: string[], status: ReviewStatus) {
  const d = run.detail;
  if (d.status !== "done") throw new ApiError(409, "Build is still running");
  for (const g of d.groups) if (groupIds.includes(g.id)) g.review = status as Review;
  recompute(d);
  promoteBaselines(run, true);
  return clone(d);
}

// ---------- seed ----------

function makeDemo(startedAt: number, withHistory: boolean): StoredProject {
  const p: StoredProject = {
    id: uid("proj"),
    name: "Acme Store",
    base_url: `${DEMO_ORIGIN}/demo/v1`,
    paths: [
      { path: "/", name: "Home" },
      { path: "/products", name: "Products" },
      { path: "/products/linen-shirt", name: "Product" },
      { path: "/cart", name: "Cart" },
      { path: "/about", name: "About" },
    ],
    viewports: [1280, 390],
    created_at: new Date(startedAt).toISOString(),
    is_demo: true,
    demo_urls: [
      { label: "v1 (baseline)", url: `${DEMO_ORIGIN}/demo/v1` },
      { label: "v2 (with regressions)", url: `${DEMO_ORIGIN}/demo/v2` },
    ],
  };
  projects.push(p);
  const r1 = createRunInternal(p, { label: "Initial baseline" }, startedAt);
  if (withHistory) {
    promoteBaselines(r1, false);
    (r1 as StoredRun & { _promoted?: boolean })._promoted = true;
    createRunInternal(p, { base_url: `${DEMO_ORIGIN}/demo/v2`, label: "feat: new checkout styles (#482)" }, Date.now() - 18 * 60_000);
  }
  return p;
}

function seed() {
  const now = Date.now();
  makeDemo(now - 3 * 3600_000, true);

  const docs: StoredProject = {
    id: uid("proj"),
    name: "Docs site",
    base_url: "https://docs.example.dev",
    paths: [
      { path: "/", name: "Home" },
      { path: "/getting-started", name: "Getting Started" },
      { path: "/api", name: "API Reference" },
    ],
    viewports: [1280, 768],
    created_at: new Date(now - 5 * 86400_000).toISOString(),
    is_demo: false,
  };
  projects.push(docs);
  const d1 = createRunInternal(docs, { label: "Initial baseline" }, now - 4 * 86400_000);
  promoteBaselines(d1, false);
  (d1 as StoredRun & { _promoted?: boolean })._promoted = true;
  createRunInternal(docs, { label: "chore: bump deps" }, now - 2 * 86400_000);
  createRunInternal(docs, { base_url: "https://staging.docs.example.dev", label: "staging smoke" }, now - 26 * 3600_000, {
    failPath: "/api",
  });
}
seed();

// ---------- API ----------

export const mockApi: SightlineApi = {
  async health() {
    await delay(30);
    return { ok: true };
  },
  async listProjects() {
    await delay();
    return [...projects].reverse().map(projectOut);
  },
  async createProject(body: CreateProjectBody) {
    await delay();
    if (!body.name?.trim()) throw new ApiError(422, "Name is required");
    if (!/^https?:\/\//.test(body.base_url ?? "")) throw new ApiError(422, "Base URL must start with http:// or https://");
    const p: StoredProject = {
      id: uid("proj"),
      name: body.name.trim(),
      base_url: body.base_url.replace(/\/$/, ""),
      paths: normPaths(body.paths?.length ? body.paths : ["/"]),
      viewports: body.viewports?.length ? body.viewports : [1280],
      created_at: new Date().toISOString(),
      is_demo: false,
    };
    projects.push(p);
    return projectOut(p);
  },
  async getProject(id) {
    await delay();
    return projectOut(findProject(id));
  },
  async updateProject(id, body: UpdateProjectBody) {
    await delay();
    const p = findProject(id);
    if (body.name !== undefined) p.name = body.name;
    if (body.base_url !== undefined) p.base_url = body.base_url;
    if (body.paths !== undefined) p.paths = normPaths(body.paths);
    if (body.viewports !== undefined) p.viewports = body.viewports;
    return projectOut(p);
  },
  async deleteProject(id) {
    await delay();
    const i = projects.findIndex((p) => p.id === id);
    if (i < 0) throw new ApiError(404, "Project not found");
    projects.splice(i, 1);
    baselines.delete(id);
    for (let j = runs.length - 1; j >= 0; j--) if (runs[j].detail.project_id === id) runs.splice(j, 1);
    return { ok: true };
  },
  async listRuns(projectId) {
    await delay();
    findProject(projectId);
    return runs
      .filter((r) => r.detail.project_id === projectId)
      .map((r) => summary(view(r)))
      .reverse();
  },
  async createRun(projectId, body: CreateRunBody) {
    await delay();
    const p = findProject(projectId);
    const active = runs.find((r) => r.detail.project_id === projectId && view(r).result === "running");
    if (active) throw new ApiError(409, `Build #${active.detail.number} is still running`);
    return summary(view(createRunInternal(p, body, Date.now())));
  },
  async listBaselines(projectId) {
    await delay();
    findProject(projectId);
    const p = findProject(projectId);
    const map = baselines.get(projectId) ?? new Map<string, BaselineEntry>();
    const out: Baseline[] = [];
    for (const path of p.paths)
      for (const vp of p.viewports) {
        const e = map.get(bkey(path.path, vp));
        if (e) out.push({ path: path.path, name: path.name, viewport: vp, image_url: e.render.url, run_id: e.run_id, updated_at: e.updated_at });
      }
    return out;
  },
  async getRun(id) {
    await delay(60);
    return view(findRun(id));
  },
  async reviewRun(id, status) {
    await delay();
    const r = findRun(id);
    return applyReview(
      r,
      r.detail.groups.filter((g) => g.review === "pending").map((g) => g.id),
      status,
    );
  },
  async reviewGroup(id, status) {
    await delay();
    const r = runs.find((x) => x.detail.groups.some((g) => g.id === id));
    if (!r) throw new ApiError(404, "Group not found");
    return applyReview(r, [id], status);
  },
  async reviewSnapshot(id, status) {
    await delay();
    const r = runs.find((x) => x.detail.snapshots.some((s) => s.id === id));
    if (!r) throw new ApiError(404, "Snapshot not found");
    const snap = r.detail.snapshots.find((s) => s.id === id)!;
    return applyReview(r, [...new Set(snap.changes.map((c) => c.group_id))], status);
  },
  async createDemo() {
    await delay(300);
    const existing = projects.find((p) => p.is_demo);
    if (existing) return projectOut(existing);
    return projectOut(makeDemo(Date.now(), false));
  },
};
