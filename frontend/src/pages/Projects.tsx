import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ImageIcon, Layers, Plus, Sparkles } from "lucide-react";
import { api } from "../api/client";
import type { Project } from "../api/types";
import { useNow } from "../hooks/useResource";
import { useBreadcrumbs, useShell, useStartDemo } from "../components/Layout";
import { Button, EmptyState, ErrorBox, Skeleton } from "../components/ui";
import { ResultBadge } from "../components/status";
import { isActive, shortUrl, timeAgo } from "../lib/format";

export { parsePaths } from "../components/NewProjectDialog";

export function ProjectsPage() {
  useBreadcrumbs([{ label: "Projects" }], []);
  useNow();
  const { projects, openNewProject } = useShell();
  const { start, busy } = useStartDemo();
  const data = projects?.data ?? null;
  const hasDemo = !!data?.some((p) => p.is_demo);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-8 flex items-end justify-between gap-4 border-b border-zinc-800 pb-5">
        <h1 className="font-pixel text-[26px] font-semibold leading-none text-zinc-50 sm:text-[32px]">Projects</h1>
        <div className="flex gap-2">
          {data && data.length > 0 && !hasDemo && (
            <Button variant="ghost" icon={<Sparkles className="size-3.5 text-accent-400" />} onClick={start} loading={busy} data-testid="try-demo">
              Try the demo
            </Button>
          )}
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={openNewProject} data-testid="new-project">
            New project
          </Button>
        </div>
      </div>

      {projects?.error && <ErrorBox message={projects.error} onRetry={projects.reload} />}

      {!data && !projects?.error && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[232px] rounded-[3px]" />
          ))}
        </div>
      )}

      {data && data.length === 0 && (
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No projects yet"
          action={
            <>
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={openNewProject}>
                New project
              </Button>
              <Button icon={<Sparkles className="size-3.5 text-accent-400" />} onClick={start} loading={busy} data-testid="try-demo-empty">
                Try the demo
              </Button>
            </>
          }
        />
      )}

      {data && data.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}

// first baseline image per project, cached across renders (keyed by baseline count so approvals refresh it)
const thumbCache = new Map<string, string | null>();

function useThumb(p: Project, el: React.RefObject<HTMLElement | null>) {
  const key = `${p.id}:${p.baseline_count}`;
  const [url, setUrl] = useState<string | null | undefined>(() => (thumbCache.has(key) ? thumbCache.get(key) : undefined));
  useEffect(() => {
    if (thumbCache.has(key)) {
      setUrl(thumbCache.get(key));
      return;
    }
    if (!p.baseline_count) {
      setUrl(null);
      return;
    }
    const node = el.current;
    if (!node) return;
    let alive = true;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        api
          .listBaselines(p.id)
          .then((bs) => {
            const first = bs.find((b) => b.viewport >= 1000) ?? bs[0];
            thumbCache.set(key, first?.image_url ?? null);
            if (alive) setUrl(first?.image_url ?? null);
          })
          .catch(() => alive && setUrl(null));
      },
      { rootMargin: "200px" },
    );
    io.observe(node);
    return () => {
      alive = false;
      io.disconnect();
    };
  }, [key, p.id, p.baseline_count, el]);
  return url;
}

function ProjectCard({ p }: { p: Project }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const thumb = useThumb(p, ref);
  const r = p.last_run;
  return (
    <Link
      ref={ref}
      to={`/projects/${p.id}`}
      data-testid="project-card"
      className="group flex flex-col overflow-hidden rounded-[3px] border border-zinc-800 bg-zinc-900 transition-[border-color,box-shadow] hover:border-zinc-50 hover:shadow-[3px_3px_0_0_var(--color-zinc-50)]"
    >
      <div className="relative h-36 overflow-hidden border-b border-zinc-800 bg-zinc-900">
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" className="w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
        ) : thumb === undefined && p.baseline_count ? (
          <Skeleton className="h-full rounded-none" />
        ) : (
          <div className="checker flex h-full items-center justify-center text-zinc-700">
            <ImageIcon className="size-6" />
          </div>
        )}
        {r && (
          <span className="absolute right-2.5 top-2.5 bg-zinc-900">
            <ResultBadge result={r.result} baseline={r.is_baseline_build} />
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 px-4 pb-1 pt-3.5">
        <h3 className="truncate text-[14.5px] font-semibold text-zinc-50">{p.name}</h3>
        {p.is_demo && <span className="rounded-[2px] border border-accent-500/50 bg-accent-500/10 px-1.5 py-px font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-400">Demo</span>}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 pb-3.5 text-xs text-zinc-500">
        <span className="truncate font-mono text-[11.5px]">{shortUrl(p.base_url)}</span>
        <span className="shrink-0">{r ? (isActive(r.status) ? `${r.progress.done}/${r.progress.total}` : `#${r.number} · ${timeAgo(r.created_at)}`) : "No builds"}</span>
      </div>
    </Link>
  );
}
