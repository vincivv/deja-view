import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { ArrowDownUp, Check, Columns2, ExternalLink, EyeOff, Image as ImageIcon, Info, Keyboard, Layers, Maximize2, PanelRight, ScanSearch, ShieldCheck, SplitSquareHorizontal, X } from "lucide-react";
import { api, notifyProjectsChanged } from "../api/client";
import type { Change, Group, ReviewStatus, RunDetail, Snapshot } from "../api/types";
import { useResource, useNow } from "../hooks/useResource";
import { useBreadcrumbs } from "../components/Layout";
import { Button, Dialog, ErrorBox, IconButton, Kbd, Popover, ProgressBar, Segmented, Skeleton } from "../components/ui";
import { ResultBadge } from "../components/status";
import { useToast } from "../components/Toast";
import { STATUS_LABEL, cn, duration, isActive, plural, shortUrl, timeAgo } from "../lib/format";
import { Viewer, type ViewMode, type Zoom } from "../review/Viewer";
import { Sidebar, type SnapFilter } from "../review/Sidebar";
import { Details } from "../review/Details";

const MODES: { id: ViewMode; label: string; short: string; key: string; icon: typeof Columns2 }[] = [
  { id: "side", label: "Side by side", short: "Side", key: "1", icon: Columns2 },
  { id: "overlay", label: "Overlay", short: "Overlay", key: "2", icon: Layers },
  { id: "swipe", label: "Swipe", short: "Swipe", key: "3", icon: SplitSquareHorizontal },
  { id: "single", label: "Single", short: "Single", key: "4", icon: ImageIcon },
];

function defaultSnap(run: RunDetail): Snapshot | undefined {
  const g = run.groups[0];
  if (g) return run.snapshots.find((s) => s.id === g.snapshot_ids[0]);
  return run.snapshots.find((s) => s.status === "changed") ?? run.snapshots.find((s) => s.status === "failed") ?? run.snapshots[0];
}

export function BuildPage() {
  const { id = "" } = useParams();
  const { toast } = useToast();
  useNow(10000);
  const run = useResource(() => api.getRun(id), [id], { poll: (d) => !d || isActive(d.status), interval: 1000 });
  const r = run.data;

  useBreadcrumbs(
    [{ label: "Projects", to: "/projects" }, ...(r ? [{ label: r.project.name, to: `/projects/${r.project.id}` }, { label: `Build #${r.number}` }] : [])],
    [r?.project.name, r?.number],
  );

  const [snapId, setSnapId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [activeChangeId, setActiveChangeId] = useState<string | null>(null);
  const [hoverChangeId, setHoverChangeId] = useState<string | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [mode, setMode] = useState<ViewMode>("side");
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [showNoise, setShowNoise] = useState(false);
  const [showPixel, setShowPixel] = useState(false);
  const [filter, setFilter] = useState<SnapFilter>("changed");
  const [showDetails, setShowDetails] = useState(false);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // keep selection valid as the run streams in / updates
  useEffect(() => {
    if (!r) return;
    const cur = r.snapshots.find((s) => s.id === snapId);
    if (!cur) {
      const d = defaultSnap(r);
      if (d) {
        setSnapId(d.id);
        const c = d.changes.find((x) => x.group_id === r.groups[0]?.id) ?? d.changes[0];
        setGroupId(c?.group_id ?? null);
        setActiveChangeId(c?.id ?? null);
      }
    } else if (!groupId && cur.changes.length && r.groups.length) {
      setGroupId(cur.changes[0].group_id);
      setActiveChangeId(cur.changes[0].id);
    }
    if (r.result !== "running" && r.groups.length === 0 && filter === "changed" && !r.snapshots.some((s) => s.status === "changed" || s.status === "failed")) setFilter("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r]);

  const snap = r?.snapshots.find((s) => s.id === snapId) ?? null;
  const changeNumber = useMemo(() => new Map((snap?.changes ?? []).map((c, i) => [c.id, i + 1])), [snap]);

  const navList = useMemo(() => {
    if (!r) return [];
    if (r.is_baseline_build || r.result === "running") return r.snapshots;
    const reviewable = r.snapshots.filter((s) => s.status === "changed" || s.status === "failed");
    if (filter === "changed" && reviewable.length) return reviewable;
    return [...reviewable, ...r.snapshots.filter((s) => s.status !== "changed" && s.status !== "failed")];
  }, [r, filter]);

  const selectSnap = useCallback(
    (s: Snapshot, prefGroup?: string | null) => {
      setSnapId(s.id);
      const c = (prefGroup && s.changes.find((x) => x.group_id === prefGroup)) || s.changes[0];
      setGroupId(c?.group_id ?? prefGroup ?? null);
      setActiveChangeId(c?.id ?? null);
      setFocusToken((t) => (c ? t + 1 : 0));
    },
    [],
  );

  const selectGroup = useCallback(
    (g: Group) => {
      if (!r) return;
      const inGroup = r.snapshots.filter((s) => g.snapshot_ids.includes(s.id));
      // stay on current snapshot if it is part of the group, else jump to the group's first snapshot
      const target = inGroup.find((s) => s.id === snapId) ?? inGroup[0];
      if (target) selectSnap(target, g.id);
      setGroupId(g.id);
    },
    [r, snapId, selectSnap],
  );

  const pickChange = useCallback((c: Change) => {
    setActiveChangeId(c.id);
    setGroupId(c.group_id);
    setFocusToken((t) => t + 1);
  }, []);

  const applyResult = (d: RunDetail) => run.setData(d);

  const reviewGroup = async (g: Group, status: ReviewStatus, advance = false) => {
    setBusy(g.id);
    try {
      const d = await api.reviewGroup(g.id, status);
      applyResult(d);
      notifyProjectsChanged();
      if (advance) {
        const next = d.groups.find((x) => x.review === "pending" && x.id !== g.id);
        if (next) {
          const s = d.snapshots.find((x) => x.id === next.snapshot_ids[0]);
          if (s) selectSnap(s, next.id);
        }
      }
    } catch (e) {
      toast({ tone: "error", title: "Review failed", body: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const reviewAll = async (status: ReviewStatus) => {
    if (!r) return;
    setBusy("run");
    try {
      const d = await api.reviewRun(r.id, status);
      applyResult(d);
      notifyProjectsChanged();
      toast(status === "approved" ? { tone: "success", title: `Build #${d.number} approved` } : { tone: "reject", title: `Build #${d.number} rejected` });
    } catch (e) {
      toast({ tone: "error", title: "Review failed", body: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const reviewSnap = async (status: ReviewStatus) => {
    if (!snap) return;
    setBusy("snap");
    try {
      const d = await api.reviewSnapshot(snap.id, status);
      applyResult(d);
      notifyProjectsChanged();
    } catch (e) {
      toast({ tone: "error", title: "Review failed", body: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  // keyboard shortcuts
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (!r) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === "?") return setHelp((v) => !v);
    if (help && k === "Escape") return setHelp(false);
    if (k === "j" || k === "k") {
      if (!r.groups.length) return;
      const i = r.groups.findIndex((g) => g.id === groupId);
      const n = k === "j" ? (i + 1) % r.groups.length : (i - 1 + r.groups.length) % r.groups.length;
      selectGroup(r.groups[i < 0 ? 0 : n]);
      e.preventDefault();
    } else if (k === "ArrowRight" || k === "ArrowLeft" || k === "ArrowDown" || k === "ArrowUp") {
      if ((k === "ArrowDown" || k === "ArrowUp") && t?.closest("[data-scroll-keys]")) return;
      if (k === "ArrowDown" || k === "ArrowUp") return; // keep native scroll
      if (!navList.length) return;
      const i = navList.findIndex((s) => s.id === snapId);
      const n = k === "ArrowRight" ? Math.min(navList.length - 1, i + 1) : Math.max(0, i - 1);
      selectSnap(navList[n], groupId);
      e.preventDefault();
    } else if (k === "a" || k === "r") {
      const g = r.groups.find((x) => x.id === groupId);
      if (g && busy === null) void reviewGroup(g, k === "a" ? "approved" : "rejected", true);
    } else if (k >= "1" && k <= "4") {
      setMode(MODES[+k - 1].id);
    } else if (k === "n") setShowNoise((v) => !v);
    else if (k === "p") setShowPixel((v) => !v);
    else if (k === "z") setZoom((z) => (z === "fit" ? "actual" : "fit"));
    else if (k === "d") setShowDetails((v) => !v);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (run.error && !r)
    return (
      <div className="mx-auto max-w-3xl p-8">
        <ErrorBox message={run.error} onRetry={run.reload} />
      </div>
    );
  if (!r) return <BuildSkeleton />;

  const pending = r.groups.filter((g) => g.review === "pending").length;
  const running = r.result === "running";
  const prevLabel = "Baseline";
  const newLabel = `New · #${r.number}`;
  const canCompare = !!snap?.baseline_image_url;
  const shift = snap?.layout_shifts[0];
  const shiftCause = shift?.cause_change_id ? changeNumber.get(shift.cause_change_id) : undefined;
  const detailsOpen = showDetails && !!snap;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="build-page" data-result={r.result}>
      {/* header: title, status, one big summary, primary actions */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-b border-zinc-800 bg-zinc-900 px-4 py-3 sm:px-5">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="flex min-w-0 items-baseline gap-2 text-[13px] font-semibold text-zinc-50" data-testid="build-title">
              <span className="shrink-0 font-mono">Build #{r.number}</span>
              {r.label && <span className="max-w-[320px] truncate font-normal text-zinc-500">{r.label}</span>}
            </h1>
            <ResultBadge result={r.result} baseline={r.is_baseline_build} />
            <BuildInfo r={r} />
          </div>
          <div className="mt-1.5 flex min-h-8 items-center">
            {running ? (
              <div className="flex items-center gap-3" data-testid="build-progress" title={STATUS_LABEL[r.status]}>
                <span className="font-pixel text-[24px] font-semibold leading-none text-zinc-50">Capturing</span>
                <ProgressBar done={r.progress.done} total={r.progress.total} className="w-40" />
                <span className="font-mono text-[12px] text-sky-300">
                  {r.progress.done}/{r.progress.total}
                </span>
              </div>
            ) : r.status === "failed" ? (
              <span className="max-w-xl truncate font-mono text-[13px] text-red-300" title={r.error ?? undefined}>
                {r.error ?? "Build failed"}
              </span>
            ) : r.is_baseline_build ? (
              <span
                className="font-pixel inline-flex items-center gap-2 text-[24px] font-semibold leading-none text-zinc-50"
                data-testid="baseline-banner"
                title="The first build is accepted automatically. Future builds are compared with these screenshots."
              >
                <ShieldCheck className="size-5 text-sky-400" />
                {r.counts.snapshots} baselines saved
              </span>
            ) : (
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1" data-testid="summary-chips">
                <span className={cn("font-pixel text-[20px] font-semibold leading-none sm:text-[26px]", r.groups.length === 0 ? "text-emerald-400" : pending ? "text-zinc-50" : "text-zinc-400")}>
                  {r.groups.length === 0
                    ? "No changes"
                    : pending
                      ? `${pending} ${pending === 1 ? "change needs" : "changes need"} review`
                      : `${plural(r.groups.length, "change")} reviewed`}
                </span>
                {pending > 0 && pending < r.groups.length && <span className="font-mono text-[12px] text-zinc-500">of {r.groups.length}</span>}
                {r.counts.failed > 0 && <span className="font-mono text-[12px] text-red-300">{r.counts.failed} failed</span>}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <IconButton label="Keyboard shortcuts (?)" onClick={() => setHelp(true)} data-testid="shortcuts-button" className="size-9">
            <Keyboard className="size-4" />
          </IconButton>
          {!r.is_baseline_build && r.groups.length > 0 && (
            <>
              <Button variant="danger" className="h-10 px-4 text-[14px]" icon={<X className="size-4" />} disabled={!pending || busy !== null} onClick={() => reviewAll("rejected")} data-testid="reject-all">
                Reject
              </Button>
              <Button variant="success" className="h-10 px-5 text-[14px]" icon={<Check className="size-4" strokeWidth={3} />} disabled={!pending || busy !== null} loading={busy === "run"} onClick={() => reviewAll("approved")} data-testid="approve-all">
                Approve all
              </Button>
            </>
          )}
        </div>
      </div>

      {/* body */}
      <div
        className={cn(
          "grid min-h-0 flex-1 max-md:flex max-md:flex-col max-md:overflow-y-auto",
          detailsOpen ? "grid-cols-[280px_minmax(0,1fr)_280px] xl:grid-cols-[320px_minmax(0,1fr)_300px]" : "grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]",
        )}
      >
        <Sidebar
          run={r}
          selectedGroupId={groupId}
          selectedSnapId={snapId}
          filter={filter}
          onFilter={setFilter}
          onSelectGroup={selectGroup}
          onSelectSnap={(s) => selectSnap(s, groupId)}
          onReviewGroup={(g, s) => reviewGroup(g, s)}
          busyGroupId={busy}
        />

        <section className="app-grid flex min-h-0 min-w-0 flex-col max-md:min-h-[78vh] max-md:shrink-0">
          {/* viewer toolbar */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-1.5">
            <Segmented<ViewMode>
              value={canCompare ? mode : "single"}
              onChange={setMode}
              options={MODES.map((m) => ({
                id: m.id,
                testId: `mode-${m.id}`,
                title: `${m.label} (${m.key})`,
                disabled: !canCompare && m.id !== "single",
                label: (
                  <>
                    <m.icon className="size-3.5" />
                    <span className="hidden xl:inline">{m.short}</span>
                  </>
                ),
              }))}
            />
            {snap && canCompare && (
              <>
                <IconToggle
                  on={showNoise}
                  onChange={setShowNoise}
                  label={`Show ignored noise (N) · ${plural(snap.noise_rects.length, "region")}`}
                  tone="amber"
                  testId="toggle-noise"
                  icon={<EyeOff className="size-3.5" />}
                  count={snap.noise_rects.length}
                />
                <IconToggle
                  on={showPixel}
                  onChange={setShowPixel}
                  label={`Compare with a plain pixel diff (P) · ${plural(snap.pixel_diff.regions.length, "region")}`}
                  tone="red"
                  testId="toggle-pixel-diff"
                  icon={<ScanSearch className="size-3.5" />}
                />
              </>
            )}
            {showPixel && snap && canCompare && (
              <span className="rounded-[3px] border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-mono text-[11px] text-red-200" data-testid="pixel-diff-chip" title={`${snap.pixel_diff.pct}% of pixels differ`}>
                {snap.pixel_diff.regions.length} px regions → {snap.changes.length}
              </span>
            )}
            {shift && !showPixel && (
              <span
                className="inline-flex items-center gap-1 rounded-[3px] border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[11px] text-sky-200"
                data-testid="layout-shift-banner"
                title={`${plural(shift.elements, "element")} below y=${shift.from_y} moved ${Math.abs(shift.dy)}px ${shift.dy > 0 ? "down" : "up"} together. Counted as one layout shift, not reviewed separately.`}
              >
                <ArrowDownUp className="size-3" />
                {shift.elements} moved{shiftCause ? ` · from #${shiftCause}` : ""}
              </span>
            )}
            {snap && !canCompare && snap.status !== "failed" && (
              <span className="rounded-[3px] border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-200" data-testid="new-snapshot-chip" title="No baseline to compare with yet. This snapshot becomes the baseline.">
                New
              </span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <Segmented<Zoom>
                value={zoom}
                onChange={setZoom}
                size="sm"
                options={[
                  { id: "fit", label: <Maximize2 className="size-3" />, testId: "zoom-fit", title: "Fit width (Z)" },
                  { id: "actual", label: "1:1", testId: "zoom-actual", title: "Actual size (Z)" },
                ]}
              />
              <IconButton
                label={showDetails ? "Hide details (D)" : "Show details (D)"}
                onClick={() => setShowDetails((v) => !v)}
                data-testid="toggle-details"
                aria-pressed={showDetails}
                className={showDetails ? "bg-zinc-800 text-zinc-50" : ""}
              >
                <PanelRight className="size-4" />
              </IconButton>
            </div>
          </div>
          <div className="min-h-0 flex-1" data-testid="viewer">
            {snap ? (
              <Viewer
                key={snap.id + mode}
                snap={snap}
                mode={mode}
                zoom={zoom}
                showNoise={showNoise}
                showPixel={showPixel}
                activeChangeId={activeChangeId}
                hoverChangeId={hoverChangeId}
                focusToken={focusToken}
                changeNumber={changeNumber}
                onPickChange={pickChange}
                onHoverChange={setHoverChangeId}
                baselineLabel={prevLabel}
                newLabel={newLabel}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[13px] text-zinc-500">
                {running ? (
                  <div className="flex flex-col items-center gap-3">
                    <Skeleton className="h-64 w-48" />
                    Capturing…
                  </div>
                ) : (
                  "No snapshots"
                )}
              </div>
            )}
          </div>
        </section>

        {detailsOpen && snap && (
          <Details
            snap={snap}
            changeNumber={changeNumber}
            activeChangeId={activeChangeId}
            hoverChangeId={hoverChangeId}
            onPick={pickChange}
            onHover={setHoverChangeId}
            onReviewSnap={reviewSnap}
            busy={busy !== null}
          />
        )}
      </div>

      <ShortcutSheet open={help} onClose={() => setHelp(false)} />
    </div>
  );
}

function BuildInfo({ r }: { r: RunDetail }) {
  const c = r.counts;
  const row = "flex items-center justify-between gap-4 px-2 py-1.5 text-[12px]";
  return (
    <Popover
      align="left"
      width="w-64"
      testId="build-info"
      trigger={({ open, toggle }) => (
        <IconButton label="Build details" onClick={toggle} aria-expanded={open} className={cn("size-6", open && "bg-zinc-800 text-zinc-100")} data-testid="build-info-button">
          <Info className="size-3.5" />
        </IconButton>
      )}
    >
      {() => (
        <div className="divide-y divide-zinc-800/80">
          <a href={r.base_url} target="_blank" rel="noreferrer" className={cn(row, "font-mono text-zinc-300 hover:text-zinc-100")}>
            <span className="truncate">{shortUrl(r.base_url)}</span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
          <div className={row}>
            <span className="text-zinc-500">Started</span>
            <span className="text-zinc-300">{timeAgo(r.created_at)}</span>
          </div>
          {r.duration_ms != null && (
            <div className={row}>
              <span className="text-zinc-500">Duration</span>
              <span className="font-mono text-zinc-300">{duration(r.duration_ms)}</span>
            </div>
          )}
          <div className={row}>
            <span className="text-zinc-500">Snapshots</span>
            <span className="font-mono text-zinc-300">
              {c.snapshots}
              {c.unchanged ? <span className="text-zinc-500"> · {c.unchanged} same</span> : null}
            </span>
          </div>
          {!r.is_baseline_build && (
            <>
              <div className={row} data-testid="noise-chip">
                <span className="text-zinc-500">Noise ignored</span>
                <span className="font-mono text-amber-200">{c.noise_ignored}</span>
              </div>
              <div className={row} data-testid="pixel-compare-chip">
                <span className="text-zinc-500">Pixel diff would flag</span>
                <span className="font-mono text-red-300">{c.pixel_regions}</span>
              </div>
            </>
          )}
        </div>
      )}
    </Popover>
  );
}

function IconToggle({
  on,
  onChange,
  label,
  icon,
  count,
  testId,
  tone,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  icon: ReactNode;
  count?: number;
  testId?: string;
  tone: "amber" | "red";
}) {
  const onCls = tone === "red" ? "border-red-500/50 bg-red-500/15 text-red-200" : "border-amber-400/50 bg-amber-400/10 text-amber-200";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={() => onChange(!on)}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-[3px] border px-2 text-[11px] font-medium transition-colors",
        on ? onCls : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-200",
      )}
    >
      {icon}
      {count !== undefined && count > 0 && <span className="font-mono">{count}</span>}
    </button>
  );
}

function BuildSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-zinc-800 px-4 py-3">
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-5 w-[480px]" />
      </div>
      <div className="grid flex-1 grid-cols-[260px_1fr] xl:grid-cols-[288px_1fr]">
        <div className="space-y-2 border-r border-zinc-800 p-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
        <div className="grid grid-cols-2 gap-4 p-5">
          <Skeleton className="h-full" />
          <Skeleton className="h-full" />
        </div>
      </div>
    </div>
  );
}

const SHORTCUTS: [string[], string][] = [
  [["J"], "Next change group"],
  [["K"], "Previous change group"],
  [["→"], "Next snapshot"],
  [["←"], "Previous snapshot"],
  [["A"], "Approve current group"],
  [["R"], "Reject current group"],
  [["1"], "Side by side"],
  [["2"], "Overlay (onion skin)"],
  [["3"], "Swipe"],
  [["4"], "Single (new only)"],
  [["N"], "Toggle ignored noise"],
  [["P"], "Toggle plain pixel diff"],
  [["Z"], "Fit width / 100%"],
  [["D"], "Toggle details panel"],
  [["["], "Toggle app sidebar"],
  [["?"], "Show this sheet"],
];

function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts" width="max-w-md" testId="shortcut-sheet">
      <div className="grid grid-cols-1 gap-x-6 px-5 py-3 sm:grid-cols-2">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={label} className="flex items-center justify-between border-b border-zinc-800/70 py-2 text-[12.5px] text-zinc-300">
            {label}
            <span className="flex gap-1">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
      <div className="px-5 pb-4 pt-1 text-[11px] text-zinc-500">Tip: A approves and jumps to the next pending group.</div>
    </Dialog>
  );
}
