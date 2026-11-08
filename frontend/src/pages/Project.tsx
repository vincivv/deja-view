import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ExternalLink, History, ImageIcon, MoreHorizontal, Play, Settings2, Trash2, Zap } from "lucide-react";
import { api, notifyProjectsChanged } from "../api/client";
import type { Baseline, Project, RunSummary } from "../api/types";
import { useResource, useNow } from "../hooks/useResource";
import { useBreadcrumbs } from "../components/Layout";
import { Button, Dialog, EmptyState, ErrorBox, Field, IconButton, Input, MenuItem, Popover, ProgressBar, Skeleton, Tabs, Textarea, ViewportChips } from "../components/ui";
import { ResultBadge } from "../components/status";
import { useToast } from "../components/Toast";
import { STATUS_LABEL, cn, duration, isActive, shortUrl, timeAgo } from "../lib/format";
import { parsePaths } from "../components/NewProjectDialog";

type Tab = "builds" | "baselines" | "settings";

export function ProjectPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "builds";
  const project = useResource(() => api.getProject(id), [id]);
  const runs = useResource(() => api.listRuns(id), [id], { poll: (d) => !!d?.some((r) => isActive(r.status)), interval: 1000 });
  const [runOpen, setRunOpen] = useState(params.get("run") === "1");
  const [deleteOpen, setDeleteOpen] = useState(false);
  useNow();

  useBreadcrumbs([{ label: "Projects", to: "/projects" }, ...(project.data ? [{ label: project.data.name }] : [])], [project.data?.name]);

  // keep the header counts (baselines, last run) live: refresh the project on every runs update
  useEffect(() => {
    if (project.data) void project.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs.data]);

  const setTab = (t: Tab) => {
    const next = new URLSearchParams(params);
    next.set("tab", t);
    next.delete("run");
    setParams(next, { replace: true });
  };

  if (project.error) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <ErrorBox message={project.error} onRetry={project.reload} />
      </div>
    );
  }

  const p = project.data;
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {p ? (
            <>
              <div className="flex items-center gap-2.5">
                <h1 className="font-pixel truncate text-[24px] sm:text-[30px] font-semibold leading-tight text-zinc-50" data-testid="project-title">
                  {p.name}
                </h1>
                {p.is_demo && <span className="rounded border border-accent-500/30 bg-accent-500/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-accent-300">Demo</span>}
              </div>
              <a href={p.base_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 font-mono text-xs text-zinc-500 hover:text-zinc-300">
                {shortUrl(p.base_url)}
                <ExternalLink className="size-3" />
              </a>
            </>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="primary" icon={<Play className="size-3.5 fill-current" />} onClick={() => setRunOpen(true)} disabled={!p} data-testid="run-build">
            Run build
          </Button>
          {p && (
            <Popover
              width="w-48"
              testId="project-menu"
              trigger={({ open, toggle }) => (
                <IconButton label="More actions" onClick={toggle} aria-expanded={open} aria-haspopup="menu" className={cn("size-8 border border-zinc-800", open && "bg-zinc-800 text-zinc-100")} data-testid="project-menu-button">
                  <MoreHorizontal className="size-4" />
                </IconButton>
              )}
            >
              {(close) => (
                <div role="menu">
                  <MenuItem
                    icon={<Settings2 className="size-3.5" />}
                    onClick={() => {
                      close();
                      setTab("settings");
                    }}
                    data-testid="menu-settings"
                  >
                    Project settings
                  </MenuItem>
                  <MenuItem
                    danger
                    icon={<Trash2 className="size-3.5" />}
                    onClick={() => {
                      close();
                      setDeleteOpen(true);
                    }}
                    data-testid="menu-delete-project"
                  >
                    Delete project
                  </MenuItem>
                </div>
              )}
            </Popover>
          )}
        </div>
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "builds", label: "Builds", count: runs.data?.length },
          { id: "baselines", label: "Baselines", count: p?.baseline_count },
          { id: "settings", label: "Settings" },
        ]}
      />
      <div className="pt-5">
        {tab === "builds" && <BuildsTable runs={runs.data} loading={runs.loading} error={runs.error} onRun={() => setRunOpen(true)} />}
        {tab === "baselines" && p && <BaselinesGrid project={p} runs={runs.data ?? []} />}
        {tab === "settings" && p && <SettingsForm project={p} onSaved={project.setData} />}
      </div>

      {p && <RunBuildDialog open={runOpen} onClose={() => setRunOpen(false)} project={p} />}
      {p && <DeleteProjectDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} project={p} />}
    </div>
  );
}

function BuildsTable({ runs, loading, error, onRun }: { runs: RunSummary[] | null; loading: boolean; error: string | null; onRun: () => void }) {
  const navigate = useNavigate();
  if (error) return <ErrorBox message={error} />;
  if (loading && !runs)
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  if (!runs?.length)
    return (
      <EmptyState
        icon={<History className="size-5" />}
        title="No builds yet"
        action={
          <Button variant="primary" icon={<Play className="size-3.5 fill-current" />} onClick={onRun}>
            Run first build
          </Button>
        }
      >
        The first build captures every page and viewport and becomes the baseline. Later builds are compared with it.
      </EmptyState>
    );
  return (
    <div className="overflow-x-auto rounded-[3px] border border-zinc-800 bg-zinc-900">
      <table className="w-full text-left text-[13px]" data-testid="builds-table">
        <tbody className="divide-y divide-zinc-800">
          {runs.map((r) => {
            const active = isActive(r.status);
            return (
              <tr
                key={r.id}
                data-testid="build-row"
                data-build-number={r.number}
                onClick={() => navigate(`/builds/${r.id}`)}
                className="cursor-pointer bg-zinc-900 transition-colors hover:bg-zinc-950"
                title={`${shortUrl(r.base_url)}${r.duration_ms != null ? ` · ${duration(r.duration_ms)}` : ""}`}
              >
                <td className="w-14 py-3.5 pl-4 font-mono text-zinc-500">#{r.number}</td>
                <td className="max-w-[150px] px-2 py-3.5 sm:max-w-[360px]">
                  <Link to={`/builds/${r.id}`} className="block truncate font-medium text-zinc-50 hover:underline" onClick={(e) => e.stopPropagation()}>
                    {r.label || (r.is_baseline_build ? "Baseline build" : "Build")}
                  </Link>
                </td>
                <td className="px-3 py-3.5 sm:px-4">
                  {active ? (
                    <div className="flex w-40 items-center gap-2">
                      <ProgressBar done={r.progress.done} total={r.progress.total} />
                      <span className="font-mono text-[11px] text-sky-300" title={STATUS_LABEL[r.status]}>
                        {r.progress.done}/{r.progress.total}
                      </span>
                    </div>
                  ) : (
                    <ResultBadge result={r.result} baseline={r.is_baseline_build} />
                  )}
                </td>
                <td className="hidden px-4 py-3.5 sm:table-cell">
                  {!r.is_baseline_build && r.counts.groups > 0 && (
                    <span className="rounded-[2px] border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-zinc-300" title={`${r.counts.changes} occurrences`}>
                      {r.counts.groups} {r.counts.groups === 1 ? "change" : "changes"}
                    </span>
                  )}
                  {r.counts.failed > 0 && <span className="ml-2 rounded-[2px] border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-mono text-[11px] text-red-300">{r.counts.failed} failed</span>}
                </td>
                <td className="hidden px-4 py-3.5 text-right font-mono text-[11.5px] text-zinc-500 sm:table-cell" title={new Date(r.created_at).toLocaleString()}>
                  {timeAgo(r.created_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RunBuildDialog({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [url, setUrl] = useState(project.base_url);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setUrl(project.demo_urls?.[project.last_run ? 1 : 0]?.url ?? project.base_url);
      setErr(null);
    }
  }, [open, project]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const run = await api.createRun(project.id, { base_url: url.trim() || undefined, label: label.trim() || undefined });
      toast({ tone: "info", title: `Build #${run.number} started` });
      notifyProjectsChanged();
      onClose();
      setLabel("");
      navigate(`/builds/${run.id}`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Run build" description={`${project.paths.length} pages × ${project.viewports.length} viewports`} width="max-w-md" testId="run-build-dialog">
      <form onSubmit={submit} className="space-y-4 px-5 py-4">
        <Field label="Target URL" hint="paths are appended to this">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} className="font-mono" data-testid="run-target-url" />
        </Field>
        {project.demo_urls && project.demo_urls.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-zinc-300">Quick picks</div>
            <div className="flex flex-wrap gap-1.5">
              {project.demo_urls.map((d, i) => (
                <button
                  key={d.url}
                  type="button"
                  data-testid={`demo-url-${i}`}
                  onClick={() => setUrl(d.url)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-[3px] border px-2.5 text-xs transition-colors",
                    url === d.url ? "border-accent-500/60 bg-accent-500/15 text-accent-200" : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200",
                  )}
                >
                  {i > 0 && <Zap className="size-3" />}
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <Field label="Label" hint="optional">
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="feat: new pricing page (#512)" data-testid="run-label" />
        </Field>
        {err && <div className="rounded-[3px] border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{err}</div>}
        <div className="flex justify-end gap-2 border-t border-zinc-800 pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} icon={<Play className="size-3.5 fill-current" />} data-testid="run-build-submit">
            Start build
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function BaselinesGrid({ project, runs }: { project: Project; runs: RunSummary[] }) {
  const baselines = useResource(() => api.listBaselines(project.id), [project.id, project.baseline_count, runs.map((r) => r.result).join()]);
  const numberOf = useMemo(() => new Map(runs.map((r) => [r.id, r.number])), [runs]);
  if (baselines.error) return <ErrorBox message={baselines.error} onRetry={baselines.reload} />;
  if (!baselines.data)
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-56 rounded-[3px]" />
        ))}
      </div>
    );
  if (!baselines.data.length)
    return (
      <EmptyState icon={<ImageIcon className="size-5" />} title="No baselines yet">
        Run a build. The first one is accepted automatically as the baseline.
      </EmptyState>
    );
  const byPath = new Map<string, Baseline[]>();
  for (const b of baselines.data) byPath.set(b.path, [...(byPath.get(b.path) ?? []), b]);
  return (
    <div className="space-y-6" data-testid="baselines-grid">
      {[...byPath.entries()].map(([path, list]) => (
        <section key={path}>
          <div className="mb-2 flex items-baseline gap-2">
            <h3 className="text-[13px] font-semibold text-zinc-200">{list[0].name}</h3>
            <span className="font-mono text-[11px] text-zinc-500">{path}</span>
          </div>
          <div className="flex flex-wrap gap-3">
            {list.map((b) => (
              <Link
                key={b.viewport}
                to={`/builds/${b.run_id}`}
                data-testid="baseline-card"
                data-run-id={b.run_id}
                className="group w-[200px] overflow-hidden rounded-[3px] border border-zinc-800 bg-zinc-900 transition-[border-color,box-shadow] hover:border-zinc-50 hover:shadow-[3px_3px_0_0_var(--color-zinc-50)]"
              >
                <div className="h-[220px] overflow-hidden bg-white">
                  <img src={b.image_url} alt={`${b.name} at ${b.viewport}px`} loading="lazy" className="w-full object-cover object-top" />
                </div>
                <div className="flex items-center justify-between border-t border-zinc-800 px-2.5 py-2 text-[11px]">
                  <span className="font-mono text-zinc-300">{b.viewport}px</span>
                  <span className="text-zinc-500">
                    {numberOf.has(b.run_id) ? `#${numberOf.get(b.run_id)} · ` : ""}
                    {timeAgo(b.updated_at)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SettingsForm({ project, onSaved }: { project: Project; onSaved: (p: Project) => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(project.name);
  const [baseUrl, setBaseUrl] = useState(project.base_url);
  const [paths, setPaths] = useState(project.paths.map((p) => p.path).join("\n"));
  const [viewports, setViewports] = useState(project.viewports);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const p = await api.updateProject(project.id, { name, base_url: baseUrl, paths: parsePaths(paths), viewports });
      onSaved(p);
      notifyProjectsChanged();
      toast({ tone: "success", title: "Settings saved" });
    } catch (e2) {
      toast({ tone: "error", title: "Couldn't save", body: e2 instanceof Error ? e2.message : String(e2) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <form onSubmit={save} className="space-y-4 rounded-[3px] border border-zinc-800 bg-zinc-900 p-5">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Base URL">
          <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="font-mono" />
        </Field>
        <Field label="Paths" hint="one per line">
          <Textarea rows={6} value={paths} onChange={(e) => setPaths(e.target.value)} data-testid="settings-paths" />
        </Field>
        <Field label="Viewports">
          <ViewportChips value={viewports} onChange={setViewports} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={busy} data-testid="settings-save">
            Save changes
          </Button>
        </div>
      </form>
      <div className="flex items-center justify-between gap-4 rounded-[3px] border border-red-500/25 bg-red-500/5 p-5">
        <div>
          <div className="text-[13px] font-semibold text-red-200">Delete project</div>
          <div className="mt-0.5 text-xs text-zinc-500">This removes all builds, snapshots and baselines. It can't be undone.</div>
        </div>
        <Button variant="danger" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirmDelete(true)} data-testid="delete-project">
          Delete
        </Button>
      </div>
      <DeleteProjectDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} project={project} />
    </div>
  );
}

function DeleteProjectDialog({ open, onClose, project }: { open: boolean; onClose: () => void; project: Project }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [deleting, setDeleting] = useState(false);
  const del = async () => {
    setDeleting(true);
    try {
      await api.deleteProject(project.id);
      toast({ tone: "success", title: `Deleted ${project.name}` });
      notifyProjectsChanged();
      onClose();
      navigate("/projects");
    } catch (e2) {
      toast({ tone: "error", title: "Couldn't delete", body: e2 instanceof Error ? e2.message : String(e2) });
    } finally {
      setDeleting(false);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title={`Delete ${project.name}?`} description="All builds and baselines are removed for good." width="max-w-sm" testId="delete-project-dialog">
      <div className="flex justify-end gap-2 px-5 py-4">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="danger" loading={deleting} onClick={del} data-testid="confirm-delete" data-autofocus>
          Delete project
        </Button>
      </div>
    </Dialog>
  );
}
