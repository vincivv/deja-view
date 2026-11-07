import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { ChevronRight, Sparkles } from "lucide-react";
import { api, MOCK } from "../api/client";
import { Button } from "./ui";
import { useToast } from "./Toast";

export function Logo({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#18181b" stroke="#3f3f46" />
      <path d="M5 16c3-5.5 6.8-8 11-8s8 2.5 11 8c-3 5.5-6.8 8-11 8s-8-2.5-11-8z" fill="none" stroke="#a78bfa" strokeWidth="2.2" />
      <circle cx="16" cy="16" r="3.6" fill="#a78bfa" />
      <path d="M3 16h26" stroke="#a78bfa" strokeOpacity=".45" strokeWidth="1.2" />
    </svg>
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

export function useStartDemo() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const p = await api.createDemo();
      toast({ tone: "success", title: "Demo project ready", body: "Acme Supply: capturing the v1 baseline…" });
      navigate(`/projects/${p.id}`);
    } catch (e) {
      toast({ tone: "error", title: "Couldn't start the demo", body: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };
  return { start, busy };
}

function ApiStatus() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
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
  const label = MOCK ? "Mock API" : ok === false ? "Backend offline" : ok ? "Connected" : "Connecting…";
  const dot = MOCK ? "bg-accent-400" : ok === false ? "bg-red-500" : ok ? "bg-emerald-400" : "bg-zinc-500";
  return (
    <span className="hidden items-center gap-1.5 text-[11px] text-zinc-500 md:inline-flex" data-testid="api-status">
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

export function Layout() {
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const { start, busy } = useStartDemo();
  return (
    <CrumbCtx.Provider value={setCrumbs}>
      <div className="flex h-full flex-col">
        <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800/80 bg-zinc-950/85 px-4 backdrop-blur">
          <Link to="/projects" className="flex items-center gap-2 rounded-md pr-1 text-[14px] font-semibold tracking-tight text-zinc-100" data-testid="nav-home">
            <Logo />
            Sightline
          </Link>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px]">
            {crumbs.map((c, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="size-3.5 shrink-0 text-zinc-700" />
                {c.to ? (
                  <Link to={c.to} className="truncate rounded px-1 text-zinc-400 hover:text-zinc-100">
                    {c.label}
                  </Link>
                ) : (
                  <span className="truncate px-1 text-zinc-200">{c.label}</span>
                )}
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <ApiStatus />
            <Button size="sm" variant="secondary" icon={<Sparkles className="size-3.5 text-accent-400" />} onClick={start} loading={busy} data-testid="try-demo-header">
              Try the demo
            </Button>
          </div>
        </header>
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </CrumbCtx.Provider>
  );
}
