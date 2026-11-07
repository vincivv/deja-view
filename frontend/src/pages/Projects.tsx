import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Globe, Layers, Monitor, Plus, Sparkles } from "lucide-react";
import { api } from "../api/client";
import type { Project } from "../api/types";
import { useResource, useNow } from "../hooks/useResource";
import { useBreadcrumbs, useStartDemo } from "../components/Layout";
import { Button, Dialog, EmptyState, ErrorBox, Field, Input, Skeleton, Textarea, ViewportChips } from "../components/ui";
import { ResultBadge } from "../components/status";
import { useToast } from "../components/Toast";
import { isActive, plural, shortUrl, timeAgo } from "../lib/format";

export function ProjectsPage() {
  useBreadcrumbs([], []);
  useNow();
  const projects = useResource(() => api.listProjects(), [], {
    poll: (d) => !!d?.some((p) => p.last_run && isActive(p.last_run.status)),
    interval: 2000,
  });
  const [creating, setCreating] = useState(false);
  const { start, busy } = useStartDemo();

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-50">Projects</h1>
          <p className="mt-1 text-[13px] text-zinc-500">Visual regression tests that understand the DOM: real changes, without the noise.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Sparkles className="size-3.5 text-accent-400" />} onClick={start} loading={busy} data-testid="try-demo">
            Try the demo
          </Button>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)} data-testid="new-project">
            New project
          </Button>
        </div>
      </div>

      {projects.error && <ErrorBox message={projects.error} onRetry={projects.reload} />}

      {projects.loading && !projects.data && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[148px] rounded-xl" />
          ))}
        </div>
      )}

      {projects.data && projects.data.length === 0 && (
        <EmptyState
          icon={<Layers className="size-5" />}
          title="No projects yet"
          action={
            <>
              <Button variant="primary" icon={<Sparkles className="size-3.5" />} onClick={start} loading={busy} data-testid="try-demo-empty">
                Try the demo
              </Button>
              <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                New project
              </Button>
            </>
          }
        >
          Register a site (a base URL, the pages to capture and the viewport widths). Or try the demo: a small shop with a baseline and a release that has planted regressions.
        </EmptyState>
      )}

      {projects.data && projects.data.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {projects.data.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      )}

      <NewProjectDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function ProjectCard({ p }: { p: Project }) {
  const r = p.last_run;
  return (
    <Link
      to={`/projects/${p.id}`}
      data-testid="project-card"
      className="group flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold text-zinc-100">{p.name}</h3>
            {p.is_demo && <span className="rounded border border-accent-500/30 bg-accent-500/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-accent-300">Demo</span>}
          </div>
          <div className="mt-1 flex items-center gap-1.5 truncate font-mono text-[11.5px] text-zinc-500">
            <Globe className="size-3 shrink-0" />
            <span className="truncate">{shortUrl(p.base_url)}</span>
          </div>
        </div>
        {r && <ResultBadge result={r.result} baseline={r.is_baseline_build} />}
      </div>
      <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <Layers className="size-3.5" />
          {plural(p.paths.length, "page")}
        </span>
        <span className="flex items-center gap-1.5">
          <Monitor className="size-3.5" />
          <span className="font-mono">{p.viewports.join(" · ")}</span>
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-zinc-800/80 pt-3 text-xs">
        {r ? (
          <>
            <span className="text-zinc-400">
              <span className="font-mono text-zinc-500">#{r.number}</span> {r.label || "Build"}
            </span>
            <span className="text-zinc-500">{isActive(r.status) ? `${r.progress.done}/${r.progress.total}` : timeAgo(r.created_at)}</span>
          </>
        ) : (
          <span className="text-zinc-500">No builds yet</span>
        )}
      </div>
    </Link>
  );
}

export function parsePaths(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith("/") || /^https?:/.test(s) ? s : `/${s}`));
}

function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [paths, setPaths] = useState("/\n/pricing\n/about");
  const [viewports, setViewports] = useState<number[]>([1280, 390]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr("Give the project a name.");
    if (!/^https?:\/\/.+/.test(baseUrl.trim())) return setErr("Base URL must start with http:// or https://");
    const ps = parsePaths(paths);
    if (!ps.length) return setErr("Add at least one path.");
    if (!viewports.length) return setErr("Pick at least one viewport.");
    setBusy(true);
    try {
      const p = await api.createProject({ name: name.trim(), base_url: baseUrl.trim().replace(/\/$/, ""), paths: ps, viewports });
      toast({ tone: "success", title: `Created ${p.name}`, body: "Run the first build to capture baselines." });
      onClose();
      navigate(`/projects/${p.id}?run=1`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  };

  const nPaths = parsePaths(paths).length;
  return (
    <Dialog open={open} onClose={onClose} title="New project" description="Sightline will screenshot every page at every viewport." testId="new-project-dialog">
      <form onSubmit={submit} className="space-y-4 px-5 py-4">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Marketing site" data-testid="project-name" />
        </Field>
        <Field label="Base URL">
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://example.com" className="font-mono" data-testid="project-base-url" />
        </Field>
        <Field label="Paths" hint={`one per line · ${plural(nPaths, "page")}`}>
          <Textarea rows={5} value={paths} onChange={(e) => setPaths(e.target.value)} data-testid="project-paths" />
        </Field>
        <Field label="Viewports" hint={`${nPaths * viewports.length} snapshots per build`}>
          <ViewportChips value={viewports} onChange={setViewports} />
        </Field>
        {err && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{err}</div>}
        <div className="flex justify-end gap-2 border-t border-zinc-800 pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} data-testid="create-project-submit">
            Create project
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
