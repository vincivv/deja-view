import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, KeyRound, LayoutGrid, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, UserPlus, X } from "lucide-react";
import { PROJECTS_CHANGED_EVENT, api, MOCK } from "../api/client";
import type { Project, RunResult } from "../api/types";
import { useResource, type Resource } from "../hooks/useResource";
import { initials, useAuth } from "../auth/auth";
import { IconButton, Kbd } from "./ui";
import { useToast } from "./Toast";
import { NewProjectDialog } from "./NewProjectDialog";
import { RESULT_LABEL, cn, isActive } from "../lib/format";
import { PixelMark } from "../landing/kit";

export function Logo({ className = "size-6" }: { className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center border border-zinc-50 bg-zinc-50 p-[3px]", className)} aria-hidden>
      <PixelMark className="size-full" color="var(--color-accent-500)" />
    </span>
  );
}

export interface Crumb {
  label: ReactNode;
  to?: string;
}

const CrumbCtx = createContext<(c: Crumb[]) => void>(() => {});

export function useBreadcrumbs(crumbs: Crumb[], deps: unknown[]) {
  const set = useContext(CrumbCtx);
  useEffect(() => {
    set(crumbs);
    return () => set([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ---------- shell context: the user's projects + the shared "New project" dialog ----------

interface ShellApi {
  projects: Resource<Project[]> | null;
  openNewProject: () => void;
}
const ShellCtx = createContext<ShellApi>({ projects: null, openNewProject: () => {} });
export function useShell() {
  return useContext(ShellCtx);
}

export function useStartDemo() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const p = await api.createDemo();
      // the demo endpoint may have just created a guest session: pick it up before entering the app
      await refresh();
      toast({ tone: "success", title: "Demo ready" });
      navigate(`/projects/${p.id}`);
    } catch (e) {
      toast({ tone: "error", title: "Couldn't start the demo", body: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  return { start, busy };
}

export function resultDot(result: RunResult | undefined | null) {
  switch (result) {
    case "passed":
    case "approved":
      return "bg-emerald-400";
    case "changes":
      return "bg-amber-400";
    case "rejected":
    case "failed":
      return "bg-red-400";
    case "running":
      return "bg-sky-400 animate-pulse";
    default:
      return "bg-zinc-600";
  }
}

// ---------- persisted UI prefs (storage may be unavailable) ----------

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

const COLLAPSE_KEY = "sl.sidebar.collapsed";
const GUEST_PROMPT_KEY = "sl.guestPrompt.dismissed";

function useIsNarrow() {
  const q = "(max-width: 767px)";
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

// ---------- layout ----------

export function Layout() {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [collapsed, setCollapsed] = useState(() => readPref(COLLAPSE_KEY) === "1");
  const [drawer, setDrawer] = useState(false);
  const [creating, setCreating] = useState(false);
  const [guestDismissed, setGuestDismissed] = useState(() => readPref(GUEST_PROMPT_KEY) === "1");
  const narrow = useIsNarrow();
  const loc = useLocation();
  const { user } = useAuth();

  const projects = useResource(() => api.listProjects(), [user?.id], {
    poll: (d) => !!d?.some((p) => p.last_run && isActive(p.last_run.status)),
    interval: 2000,
  });
  const { reload } = projects;

  // refresh the list on navigation and whenever a page says it changed
  useEffect(() => {
    void reload();
  }, [loc.pathname, reload]);
  useEffect(() => {
    const on = () => void reload();
    window.addEventListener(PROJECTS_CHANGED_EVENT, on);
    return () => window.removeEventListener(PROJECTS_CHANGED_EVENT, on);
  }, [reload]);

  useEffect(() => setDrawer(false), [loc.pathname]);

  const toggle = useCallback(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setDrawer((v) => !v);
    else
      setCollapsed((v) => {
        writePref(COLLAPSE_KEY, v ? "0" : "1");
        return !v;
      });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const dismissGuest = () => {
    setGuestDismissed(true);
    writePref(GUEST_PROMPT_KEY, "1");
  };

  const isGuest = !!user?.is_guest;
  // one sign-up prompt at a time: the sidebar card when it is visible, else a small pill in the top bar
  const sidebarCardVisible = isGuest && !guestDismissed && !collapsed && !narrow;
  const shell: ShellApi = { projects, openNewProject: () => setCreating(true) };

  return (
    <ShellCtx.Provider value={shell}>
      <CrumbCtx.Provider value={setCrumbs}>
        <div className="flex h-full">
          <aside
            className={cn(
              "hidden shrink-0 border-r border-zinc-800 bg-zinc-900 transition-[width] duration-150 motion-reduce:transition-none md:block",
              collapsed ? "w-14" : "w-60",
            )}
            data-testid="app-sidebar"
            data-collapsed={collapsed}
          >
            <SidebarContent collapsed={collapsed} onToggle={toggle} guestDismissed={guestDismissed} onDismissGuest={dismissGuest} />
          </aside>

          {drawer && (
            <div className="fixed inset-0 z-50 md:hidden" data-testid="app-drawer">
              <div className="absolute inset-0 bg-[#0d0d0c]/30 animate-fade-in" onClick={() => setDrawer(false)} />
              <aside className="absolute inset-y-0 left-0 w-[264px] border-r border-zinc-800 bg-zinc-900 shadow-[8px_0_30px_-12px_rgba(13,13,12,0.3)] animate-fade-in">
                <SidebarContent collapsed={false} onToggle={() => setDrawer(false)} guestDismissed={guestDismissed} onDismissGuest={dismissGuest} drawer />
              </aside>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900/90 px-3 backdrop-blur sm:px-4">
              <IconButton label="Open menu" className="md:hidden" onClick={() => setDrawer(true)} data-testid="open-drawer">
                <Menu className="size-4" />
              </IconButton>
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-0.5 text-[13px]" data-testid="breadcrumbs">
                {crumbs.map((c, i) => (
                  <span key={i} className="flex min-w-0 items-center gap-0.5">
                    {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-zinc-600" />}
                    {c.to ? (
                      <Link to={c.to} className="truncate rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-50">
                        {c.label}
                      </Link>
                    ) : (
                      <span className="truncate px-1.5 font-medium text-zinc-50">{c.label}</span>
                    )}
                  </span>
                ))}
              </nav>
              <div className="ml-auto flex items-center gap-2">
                <ApiStatus />
                {isGuest && !sidebarCardVisible && (
                  <Link
                    to={`/signup?next=${encodeURIComponent(loc.pathname + loc.search)}`}
                    className="app-btn-primary inline-flex h-7 items-center gap-1.5 rounded-[3px] border border-zinc-50 bg-accent-500 px-2.5 text-xs font-semibold text-white hover:bg-accent-600"
                    data-testid="guest-pill"
                  >
                    <UserPlus className="size-3.5" />
                    Sign up
                  </Link>
                )}
              </div>
            </header>
            <main className="app-grid min-h-0 flex-1 overflow-y-auto">
              <Outlet />
            </main>
          </div>
        </div>
        <NewProjectDialog open={creating} onClose={() => setCreating(false)} />
        <div className="app-grain" aria-hidden />
      </CrumbCtx.Provider>
    </ShellCtx.Provider>
  );
}

function SidebarContent({
  collapsed,
  onToggle,
  guestDismissed,
  onDismissGuest,
  drawer,
}: {
  collapsed: boolean;
  onToggle: () => void;
  guestDismissed: boolean;
  onDismissGuest: () => void;
  drawer?: boolean;
}) {
  const { projects, openNewProject } = useShell();
  const list = projects?.data ?? [];
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-12 shrink-0 items-center gap-2 border-b border-zinc-800", collapsed ? "justify-center" : "px-3")}>
        {!collapsed && (
          <Link to="/projects" className="font-pixel flex min-w-0 items-center gap-2 text-[17px] font-semibold text-zinc-50" data-testid="nav-home">
            <Logo />
            Deja View
          </Link>
        )}
        <IconButton
          label={drawer ? "Close menu" : collapsed ? "Expand sidebar ([)" : "Collapse sidebar ([)"}
          onClick={onToggle}
          className={cn(!collapsed && "ml-auto")}
          data-testid="toggle-sidebar"
        >
          {drawer ? <X className="size-4" /> : collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </IconButton>
      </div>

      <nav className={cn("space-y-0.5 py-2", collapsed ? "px-2" : "px-2")}>
        <NavItem to="/projects" icon={<LayoutGrid className="size-4" />} label="Projects" collapsed={collapsed} end testId="nav-projects" />
        <NavItem to="/settings" icon={<KeyRound className="size-4" />} label="Settings" collapsed={collapsed} testId="nav-settings" />
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-zinc-800 py-2">
        {!collapsed && (
          <div className="flex items-center justify-between px-4 pb-1 pt-1">
            <span className="app-eyebrow">Projects</span>
            <IconButton label="New project" className="size-6" onClick={openNewProject} data-testid="sidebar-new-project">
              <Plus className="size-3.5" />
            </IconButton>
          </div>
        )}
        <ul className={cn("space-y-px", collapsed ? "px-2" : "px-2")} data-testid="sidebar-projects">
          {list.map((p) => (
            <li key={p.id}>
              <NavLink
                to={`/projects/${p.id}`}
                title={collapsed ? `${p.name}${p.last_run ? ` · ${RESULT_LABEL[p.last_run.result]}` : ""}` : undefined}
                data-testid="sidebar-project"
                className={({ isActive: on }) =>
                  cn(
                    "flex items-center rounded-[3px] text-[13px] transition-colors",
                    collapsed ? "relative size-10 justify-center" : "gap-2.5 px-2 py-1.5",
                    on ? "bg-zinc-950 text-zinc-50 shadow-[inset_2px_0_0_var(--color-accent-500)]" : "text-zinc-500 hover:bg-zinc-950 hover:text-zinc-100",
                  )
                }
              >
                {collapsed ? (
                  <>
                    <span className="flex size-7 items-center justify-center rounded-[3px] border border-zinc-700 bg-zinc-950 font-mono text-[11px] font-semibold text-zinc-300">
                      {p.name.trim()[0]?.toUpperCase() ?? "?"}
                    </span>
                    <span className={cn("absolute right-1.5 top-1.5 size-2 rounded-full ring-2 ring-zinc-900", resultDot(p.last_run?.result))} />
                  </>
                ) : (
                  <>
                    <span className={cn("size-2 shrink-0 rounded-full", resultDot(p.last_run?.result))} title={p.last_run ? RESULT_LABEL[p.last_run.result] : "No builds"} />
                    <span className="truncate">{p.name}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
          {collapsed && (
            <li>
              <button
                type="button"
                onClick={openNewProject}
                title="New project"
                aria-label="New project"
                className="flex size-10 items-center justify-center rounded-[3px] text-zinc-500 hover:bg-zinc-950 hover:text-zinc-100"
                data-testid="sidebar-new-project-rail"
              >
                <Plus className="size-4" />
              </button>
            </li>
          )}
          {!collapsed && projects?.data && list.length === 0 && <li className="px-2 py-1.5 text-xs text-zinc-600">No projects yet</li>}
        </ul>
      </div>

      <AccountArea collapsed={collapsed} guestDismissed={guestDismissed} onDismissGuest={onDismissGuest} />
    </div>
  );
}

function NavItem({ to, icon, label, collapsed, end, testId }: { to: string; icon: ReactNode; label: string; collapsed: boolean; end?: boolean; testId?: string }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      data-testid={testId}
      className={({ isActive: on }) =>
        cn(
          "flex items-center rounded-[3px] text-[13px] font-medium transition-colors",
          collapsed ? "size-10 justify-center" : "gap-2.5 px-2 py-1.5",
          on ? "bg-zinc-950 text-zinc-50 shadow-[inset_2px_0_0_var(--color-accent-500)]" : "text-zinc-500 hover:bg-zinc-950 hover:text-zinc-100",
        )
      }
    >
      {icon}
      {!collapsed && label}
    </NavLink>
  );
}

function AccountArea({ collapsed, guestDismissed, onDismissGuest }: { collapsed: boolean; guestDismissed: boolean; onDismissGuest: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  if (!user) return null;
  const signupTo = `/signup?next=${encodeURIComponent(loc.pathname + loc.search)}`;
  const signOut = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  if (collapsed)
    return (
      <div className="flex shrink-0 flex-col items-center gap-1 border-t border-zinc-800 py-2">
        {user.is_guest ? (
          <Link to={signupTo} title="Save your work: sign up" className="flex size-10 items-center justify-center rounded-[3px] text-accent-300 hover:bg-zinc-950" data-testid="guest-signup-rail">
            <UserPlus className="size-4" />
          </Link>
        ) : (
          <Link to="/settings" title={user.email ?? user.name} className="flex size-10 items-center justify-center rounded-[3px] hover:bg-zinc-950" data-testid="account-rail">
            <Avatar label={initials(user)} />
          </Link>
        )}
      </div>
    );

  return (
    <div className="shrink-0 border-t border-zinc-800 p-2" data-testid="account-area">
      {user.is_guest && !guestDismissed && (
        <div className="relative mb-2 rounded-[3px] border border-zinc-700 bg-zinc-950 p-3" data-testid="guest-prompt">
          <button onClick={onDismissGuest} className="absolute right-1.5 top-1.5 rounded p-0.5 text-zinc-500 hover:text-zinc-200" aria-label="Dismiss" data-testid="guest-prompt-dismiss">
            <X className="size-3.5" />
          </button>
          <div className="text-[13px] font-medium text-zinc-100">Save your work</div>
          <div className="mt-0.5 text-xs text-zinc-500">Free account keeps this demo.</div>
          <Link
            to={signupTo}
            className="app-btn-primary mt-2.5 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[3px] border border-zinc-50 bg-accent-500 text-xs font-semibold text-white hover:bg-accent-600"
            data-testid="guest-signup"
          >
            <UserPlus className="size-3.5" />
            Sign up
          </Link>
        </div>
      )}
      <div className="flex items-center gap-2 rounded-[3px] px-1.5 py-1">
        <Link to="/settings" className="flex min-w-0 flex-1 items-center gap-2.5" data-testid="account-link">
          <Avatar label={initials(user)} />
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-medium text-zinc-200">{user.is_guest ? "Guest" : user.name}</span>
            <span className="block truncate text-[11px] text-zinc-500">{user.is_guest ? "Not saved" : user.email}</span>
          </span>
        </Link>
        <IconButton label="Sign out" onClick={signOut} data-testid="sign-out">
          <LogOut className="size-3.5" />
        </IconButton>
      </div>
      <div className="mt-1 hidden items-center gap-1 px-1.5 text-[10.5px] text-zinc-600 md:flex">
        <Kbd>[</Kbd> toggles sidebar
      </div>
    </div>
  );
}

function Avatar({ label }: { label: string }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-[3px] bg-zinc-50 font-mono text-[10.5px] font-semibold text-white">
      {label}
    </span>
  );
}

function ApiStatus() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (MOCK) return;
    let alive = true;
    const check = () =>
      api
        .health()
        .then(() => alive && setOk(true))
        .catch(() => alive && setOk(false));
    void check();
    const t = setInterval(check, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  // only speak up when it matters: mock mode, or the backend is unreachable
  if (!MOCK && ok !== false) return null;
  return (
    <span className="hidden items-center gap-1.5 text-[11px] text-zinc-500 sm:inline-flex" data-testid="api-status" title={MOCK ? "Using the in-memory mock API" : "Can't reach the backend"}>
      <span className={cn("size-1.5 rounded-full", MOCK ? "bg-accent-400" : "bg-red-500")} />
      {MOCK ? "Mock" : "Offline"}
    </span>
  );
}
