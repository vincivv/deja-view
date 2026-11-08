import type {
  ApiToken,
  Baseline,
  CreatedApiToken,
  LoginBody,
  SignupBody,
  User,
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

/** Fired on window when a non-auth request comes back 401 (session expired / signed out elsewhere). */
export const UNAUTHORIZED_EVENT = "sightline:unauthorized";
/** Fired on window when the project list changes (created, deleted, reviewed) so the sidebar can refresh. */
export const PROJECTS_CHANGED_EVENT = "sightline:projects-changed";

export function notifyProjectsChanged() {
  window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT));
}

export function notifyUnauthorized(path: string) {
  if (!path.startsWith("/api/auth/")) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the Deja View backend. Is it running on :8000?");
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
    if (res.status === 401) notifyUnauthorized(path);
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
  me: () => request<User>("GET", "/api/auth/me"),
  login: (body: LoginBody) => request<User>("POST", "/api/auth/login", body),
  signup: (body: SignupBody) => request<User>("POST", "/api/auth/signup", body),
  logout: () => request<{ ok: boolean }>("POST", "/api/auth/logout"),
  listTokens: () => request<ApiToken[]>("GET", "/api/tokens"),
  createToken: (name: string) => request<CreatedApiToken>("POST", "/api/tokens", { name }),
  deleteToken: (id) => request<{ ok: boolean }>("DELETE", `/api/tokens/${enc(id)}`),
};

let mockImpl: Promise<SightlineApi> | null = null;
function impl(): Promise<SightlineApi> {
  if (!MOCK) return Promise.resolve(http);
  mockImpl ??= import("./mock").then((m) => m.mockApi);
  return mockImpl;
}

const AUTH_KEYS = new Set<keyof SightlineApi>(["me", "login", "signup", "logout"]);

type Fn = (...args: never[]) => Promise<unknown>;
function proxy<K extends keyof SightlineApi>(key: K): SightlineApi[K] {
  const f = (async (...args: Parameters<SightlineApi[K]>) => {
    const api = await impl();
    try {
      return await (api[key] as unknown as (...a: Parameters<SightlineApi[K]>) => ReturnType<SightlineApi[K]>)(...args);
    } catch (e) {
      // the real client notifies inside request(); the mock throws ApiError directly
      if (MOCK && e instanceof ApiError && e.status === 401 && !AUTH_KEYS.has(key)) notifyUnauthorized("/api/");
      throw e;
    }
  }) as unknown as SightlineApi[K];
  return f;
}

export const api: SightlineApi = Object.fromEntries(
  (Object.keys(http) as (keyof SightlineApi)[]).map((k) => [k, proxy(k) as Fn]),
) as unknown as SightlineApi;
