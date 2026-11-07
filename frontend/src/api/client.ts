import type {
  Baseline,
  CreateProjectBody,
  CreateRunBody,
  Project,
  ReviewStatus,
  RunDetail,
  RunSummary,
  SightlineApi,
  UpdateProjectBody,
} from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const MOCK = import.meta.env.VITE_MOCK === "1";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the Sightline backend. Is it running on :8000?");
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const detail =
      data && typeof data === "object" && "detail" in data
        ? formatDetail((data as { detail: unknown }).detail)
        : `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, detail);
  }
  return data as T;
}

function formatDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  // FastAPI validation errors: [{loc, msg}]
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : String(d)))
      .join("; ");
  }
  return "Request failed";
}

const enc = encodeURIComponent;

const http: SightlineApi = {
  health: () => request("GET", "/api/health"),
  listProjects: () => request<Project[]>("GET", "/api/projects"),
  createProject: (body: CreateProjectBody) => request<Project>("POST", "/api/projects", body),
  getProject: (id) => request<Project>("GET", `/api/projects/${enc(id)}`),
  updateProject: (id, body: UpdateProjectBody) => request<Project>("PATCH", `/api/projects/${enc(id)}`, body),
  deleteProject: (id) => request<{ ok: boolean }>("DELETE", `/api/projects/${enc(id)}`),
  listRuns: (projectId) => request<RunSummary[]>("GET", `/api/projects/${enc(projectId)}/runs`),
  createRun: (projectId, body: CreateRunBody) => request<RunSummary>("POST", `/api/projects/${enc(projectId)}/runs`, body),
  listBaselines: (projectId) => request<Baseline[]>("GET", `/api/projects/${enc(projectId)}/baselines`),
  getRun: (id) => request<RunDetail>("GET", `/api/runs/${enc(id)}`),
  reviewRun: (id, status: ReviewStatus) => request<RunDetail>("POST", `/api/runs/${enc(id)}/review`, { status }),
  reviewGroup: (id, status: ReviewStatus) => request<RunDetail>("POST", `/api/groups/${enc(id)}/review`, { status }),
  reviewSnapshot: (id, status: ReviewStatus) => request<RunDetail>("POST", `/api/snapshots/${enc(id)}/review`, { status }),
  createDemo: () => request<Project>("POST", "/api/demo"),
};

let mockImpl: Promise<SightlineApi> | null = null;
function impl(): Promise<SightlineApi> {
  if (!MOCK) return Promise.resolve(http);
  mockImpl ??= import("./mock").then((m) => m.mockApi);
  return mockImpl;
}

type Fn = (...args: never[]) => Promise<unknown>;
function proxy<K extends keyof SightlineApi>(key: K): SightlineApi[K] {
  const f = (async (...args: Parameters<SightlineApi[K]>) => {
    const api = await impl();
    return (api[key] as unknown as (...a: Parameters<SightlineApi[K]>) => ReturnType<SightlineApi[K]>)(...args);
  }) as unknown as SightlineApi[K];
  return f;
}

export const api: SightlineApi = Object.fromEntries(
  (Object.keys(http) as (keyof SightlineApi)[]).map((k) => [k, proxy(k) as Fn]),
) as unknown as SightlineApi;
