// Mirrors docs/API.md exactly.

export type Review = "pending" | "approved" | "rejected";
export type RunStatus = "queued" | "capturing" | "diffing" | "done" | "failed";
export type Rect = [number, number, number, number];

export interface ProjectPath {
  path: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  base_url: string;
  paths: ProjectPath[];
  viewports: number[];
  created_at: string;
  is_demo: boolean;
  demo_urls?: { label: string; url: string }[];
  baseline_count: number;
  last_run: RunSummary | null;
}

export type RunResult = "passed" | "changes" | "approved" | "rejected" | "failed" | "running";

export interface RunCounts {
  snapshots: number;
  unchanged: number;
  changed: number;
  new: number;
  failed: number;
  changes: number;
  groups: number;
  noise_ignored: number;
  pixel_regions: number;
}

export interface RunSummary {
  id: string;
  project_id: string;
  number: number;
  label: string;
  base_url: string;
  status: RunStatus;
  error: string | null;
  created_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  progress: { done: number; total: number };
  is_baseline_build: boolean;
  result: RunResult;
  counts: RunCounts;
}

export type ChangeKind = "style" | "text" | "image" | "added" | "removed" | "moved" | "resized" | "visual";

export interface Change {
  id: string;
  snapshot_id: string;
  group_id: string;
  kind: ChangeKind;
  title: string;
  detail: string;
  selector: string;
  bbox: Rect | null;
  base_bbox: Rect | null;
  before: string | null;
  after: string | null;
}

export interface LayoutShift {
  dy: number;
  dx: number;
  from_y: number;
  elements: number;
  cause_change_id: string | null;
}

export type SnapshotStatus = "new" | "unchanged" | "changed" | "failed";

export interface PixelDiff {
  regions: Rect[];
  pct: number;
  overlay_url: string | null;
}

export interface Snapshot {
  id: string;
  run_id: string;
  path: string;
  name: string;
  viewport: number;
  status: SnapshotStatus;
  review: Review | null;
  image_url: string;
  width: number;
  height: number;
  baseline_image_url: string | null;
  baseline_width: number | null;
  baseline_height: number | null;
  noise_rects: Rect[];
  pixel_diff: PixelDiff;
  layout_shifts: LayoutShift[];
  changes: Change[];
  duration_ms: number | null;
  error: string | null;
}

export interface Group {
  id: string;
  run_id: string;
  kind: ChangeKind;
  title: string;
  detail: string;
  selector: string;
  change_ids: string[];
  snapshot_ids: string[];
  count: number;
  review: Review;
}

export interface RunDetail extends RunSummary {
  project: { id: string; name: string };
  snapshots: Snapshot[];
  groups: Group[];
}

export interface Baseline {
  path: string;
  name: string;
  viewport: number;
  image_url: string;
  run_id: string;
  updated_at: string;
}

export interface CreateProjectBody {
  name: string;
  base_url: string;
  paths: string[] | ProjectPath[];
  viewports?: number[];
}

export type UpdateProjectBody = Partial<{
  name: string;
  base_url: string;
  paths: string[] | ProjectPath[];
  viewports: number[];
}>;

export interface CreateRunBody {
  base_url?: string;
  label?: string;
}

export type ReviewStatus = "approved" | "rejected";

export interface User {
  id: string;
  email: string | null; // null for guests
  name: string;
  is_guest: boolean;
  created_at: string;
}

export interface ApiToken {
  id: string;
  name: string;
  prefix: string; // "sl_3fa9…"
  created_at: string;
  last_used_at: string | null;
}

export interface CreatedApiToken extends ApiToken {
  token: string; // full token, returned only once
}

export interface SignupBody {
  email: string;
  password: string;
  name?: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface SightlineApi {
  health(): Promise<{ ok: boolean }>;
  listProjects(): Promise<Project[]>;
  createProject(body: CreateProjectBody): Promise<Project>;
  getProject(id: string): Promise<Project>;
  updateProject(id: string, body: UpdateProjectBody): Promise<Project>;
  deleteProject(id: string): Promise<{ ok: boolean }>;
  listRuns(projectId: string): Promise<RunSummary[]>;
  createRun(projectId: string, body: CreateRunBody): Promise<RunSummary>;
  listBaselines(projectId: string): Promise<Baseline[]>;
  getRun(id: string): Promise<RunDetail>;
  reviewRun(id: string, status: ReviewStatus): Promise<RunDetail>;
  reviewGroup(id: string, status: ReviewStatus): Promise<RunDetail>;
  reviewSnapshot(id: string, status: ReviewStatus): Promise<RunDetail>;
  createDemo(): Promise<Project>;
  me(): Promise<User>;
  login(body: LoginBody): Promise<User>;
  signup(body: SignupBody): Promise<User>;
  logout(): Promise<{ ok: boolean }>;
  listTokens(): Promise<ApiToken[]>;
  createToken(name: string): Promise<CreatedApiToken>;
  deleteToken(id: string): Promise<{ ok: boolean }>;
}
