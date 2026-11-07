import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, Columns2, ExternalLink, Image as ImageIcon, Keyboard, Layers, Maximize2, PanelRight, ScanLine, ShieldCheck, SplitSquareHorizontal, X } from "lucide-react";
import { api } from "../api/client";
import type { Change, Group, ReviewStatus, RunDetail, Snapshot } from "../api/types";
import { useResource, useNow } from "../hooks/useResource";
import { useBreadcrumbs } from "../components/Layout";
import { Button, Dialog, ErrorBox, IconButton, Kbd, ProgressBar, Segmented, Skeleton, Toggle } from "../components/ui";
import { ResultBadge } from "../components/status";
import { useToast } from "../components/Toast";
import { STATUS_LABEL, cn, duration, isActive, plural, shortUrl, timeAgo } from "../lib/format";
import { Viewer, type ViewMode, type Zoom } from "../review/Viewer";
import { Sidebar, pagesIn, type SnapFilter } from "../review/Sidebar";
import { Details } from "../review/Details";

const MODES: { id: ViewMode; label: string; key: string; icon: typeof Columns2 }[] = [
  { id: "side", label: "Side by side", key: "1", icon: Columns2 },
  { id: "overlay", label: "Overlay", key: "2", icon: Layers },
  { id: "swipe", label: "Swipe", key: "3", icon: SplitSquareHorizontal },
  { id: "single", label: "Single", key: "4", icon: ImageIcon },
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

  useBreadcrumbs(r ? [{ label: r.project.name, to: `/projects/${r.project.id}` }, { label: `Build #${r.number}` }] : [], [r?.project.name, r?.number]);

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
  const [showDetails, setShowDetails] = useState(() => window.innerWidth >= 1360);
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
  const groupMap = useMemo(() => new Map((r?.groups ?? []).map((g) => [g.id, g])), [r]);
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
      const n = g.snapshot_ids.length;
      toast(
        status === "approved"
          ? { tone: "success", title: `Approved: ${g.title}`, body: `${plural(n, "snapshot")} on ${plural(pagesIn(d, g), "page")}, accepted as the new baseline once all of a snapshot's changes are approved.` }
          : { tone: "reject", title: `Rejected: ${g.title}`, body: `Marked as a regression on ${plural(n, "snapshot")}. The baseline is unchanged.` },
      );
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
      const pending = r.groups.filter((g) => g.review === "pending").length;
      const d = await api.reviewRun(r.id, status);
      applyResult(d);
      toast(
        status === "approved"
          ? { tone: "success", title: `Approved build #${d.number}`, body: `${plural(pending, "group")} approved. Changed snapshots are the new baseline.` }
          : { tone: "reject", title: `Rejected build #${d.number}`, body: `${plural(pending, "group")} rejected. The baseline is unchanged.` },
      );
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
      toast({ tone: status === "approved" ? "success" : "reject", title: `${status === "approved" ? "Approved" : "Rejected"} ${snap.name} @ ${snap.viewport}px` });
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

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="build-page" data-result={r.result}>
      {/* top bar */}
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="flex items-baseline gap-2 text-[16px] font-semibold tracking-tight text-zinc-50" data-testid="build-title">
            <span>Build #{r.number}</span>
            {r.label && <span className="max-w-[360px] truncate text-[13px] font-normal text-zinc-400">{r.label}</span>}
          </h1>
          <ResultBadge result={r.result} baseline={r.is_baseline_build} />
          <a href={r.base_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[11.5px] text-zinc-500 hover:text-zinc-300">
            {shortUrl(r.base_url)}
            <ExternalLink className="size-3" />
          </a>
          <span className="text-[11.5px] text-zinc-600">
            {timeAgo(r.created_at)}
            {r.duration_ms != null && ` · ${duration(r.duration_ms)}`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" icon={<Keyboard className="size-3.5" />} onClick={() => setHelp(true)} data-testid="shortcuts-button">
              Shortcuts <Kbd>?</Kbd>
            </Button>
            {!r.is_baseline_build && r.groups.length > 0 && (
              <>
                <Button size="sm" variant="danger" icon={<X className="size-3.5" />} disabled={!pending || busy !== null} onClick={() => reviewAll("rejected")} data-testid="reject-all">
                  Reject
                </Button>
                <Button size="sm" variant="success" icon={<Check className="size-3.5" strokeWidth={3} />} disabled={!pending || busy !== null} loading={busy === "run"} onClick={() => reviewAll("approved")} data-testid="approve-all">
                  Approve all{pending ? ` (${pending})` : ""}
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="mt-2.5">
          {running ? (
            <div className="flex items-center gap-3" data-testid="build-progress">
              <span className="w-24 text-[12px] font-medium text-sky-300">{STATUS_LABEL[r.status]}…</span>
              <ProgressBar done={r.progress.done} total={r.progress.total} className="max-w-md" />
              <span className="font-mono text-[11.5px] text-zinc-400">
                {r.progress.done}/{r.progress.total} snapshots
              </span>
            </div>
          ) : r.status === "failed" ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 font-mono text-xs text-red-200">{r.error ?? "Build failed"}</div>
          ) : r.is_baseline_build ? (
            <div className="flex items-center gap-2 text-[12.5px] text-sky-200" data-testid="baseline-banner">
              <ShieldCheck className="size-4 text-sky-400" />
              <b className="font-semibold">Baseline build: auto-accepted.</b>
              <span className="text-zinc-400">These {r.counts.snapshots} screenshots are now the baseline that future builds are compared with.</span>
            </div>
          ) : (
            <SummaryChips r={r} />
          )}
        </div>
      </div>

      {/* body */}
      <div className={cn("grid min-h-0 flex-1", showDetails && snap ? "grid-cols-[300px_minmax(0,1fr)_300px]" : "grid-cols-[300px_minmax(0,1fr)]")}>
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

        <section className="flex min-h-0 min-w-0 flex-col bg-zinc-900/30">
          {/* viewer toolbar */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-950 px-3 py-2">
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
                    <span className="hidden min-[1700px]:inline">{m.label}</span>
                    <span className="min-[1700px]:hidden">{m.label === "Side by side" ? "Side" : m.label}</span>
                  </>
                ),
              }))}
            />
            {canCompare && (
              <>
                <div className="mx-1 h-5 w-px bg-zinc-800" />
                <Toggle on={showNoise} onChange={setShowNoise} label="Show ignored noise" kbd="N" tone="amber" testId="toggle-noise" />
                <Toggle on={showPixel} onChange={setShowPixel} label="Pixel diff" kbd="P" tone="red" testId="toggle-pixel-diff" />
              </>
            )}
            {showPixel && snap && canCompare && (
              <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 font-mono text-[11px] text-red-200" data-testid="pixel-diff-chip">
                Plain pixel diff: {snap.pixel_diff.regions.length} regions, {snap.pixel_diff.pct}% of pixels
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Segmented<Zoom>
                value={zoom}
                onChange={setZoom}
                options={[
                  { id: "fit", label: <><Maximize2 className="size-3" />Fit</>, testId: "zoom-fit", title: "Fit width (Z)" },
                  { id: "actual", label: <><ScanLine className="size-3" />100%</>, testId: "zoom-actual", title: "Actual size (Z)" },
                ]}
              />
              <IconButton
                label={showDetails ? "Hide details (D)" : "Show details (D)"}
                onClick={() => setShowDetails((v) => !v)}
                data-testid="toggle-details"
                className={showDetails ? "bg-zinc-800 text-zinc-100" : ""}
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
                    Capturing first snapshot…
                  </div>
                ) : (
                  "No snapshots in this build."
                )}
              </div>
            )}
          </div>
        </section>

        {showDetails && snap && (
          <Details
            snap={snap}
            groups={groupMap}
            changeNumber={changeNumber}
            activeChangeId={activeChangeId}
            hoverChangeId={hoverChangeId}
            onPick={pickChange}
            onHover={setHoverChangeId}
            onReviewSnap={reviewSnap}
            busy={busy !== null}
            showNoise={showNoise}
            onToggleNoise={() => setShowNoise((v) => !v)}
            showPixel={showPixel}
            onTogglePixel={() => setShowPixel((v) => !v)}
          />
        )}
      </div>

      <ShortcutSheet open={help} onClose={() => setHelp(false)} />
    </div>
  );
}

function SummaryChips({ r }: { r: RunDetail }) {
  const c = r.counts;
  const pending = r.groups.filter((g) => g.review === "pending").length;
  const chip = "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px]";
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="summary-chips">
      {c.groups > 0 ? (
        <span className={cn(chip, pending ? "border-amber-400/25 bg-amber-400/[0.07] text-amber-200" : "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200 [&_span]:text-emerald-200/60")}>
          <b className="font-semibold">{plural(c.groups, "change")}</b>
          <span className="text-amber-200/60">
            {pending ? `${pending} to review` : r.result === "approved" ? "all approved" : "reviewed"} · {plural(c.changes, "occurrence")} on {plural(c.changed, "snapshot")}
          </span>
        </span>
      ) : (
        <span className={cn(chip, "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200")}>No visual changes</span>
      )}
      <span className={cn(chip, "border-zinc-800 bg-zinc-900 text-zinc-400")}>
        <b className="font-semibold text-zinc-200">{c.unchanged}</b> unchanged
      </span>
      {c.failed > 0 && (
        <span className={cn(chip, "border-red-500/25 bg-red-500/[0.07] text-red-200")}>
          <b className="font-semibold">{c.failed}</b> failed
        </span>
      )}
      <span className={cn(chip, "border-zinc-800 bg-zinc-900 text-zinc-400")} data-testid="noise-chip">
        <b className="font-semibold text-zinc-200">{c.noise_ignored}</b> noise regions ignored
      </span>
      <span className={cn(chip, "border-zinc-800 bg-zinc-900 text-zinc-500")} data-testid="pixel-compare-chip">
        plain pixel diff would flag <b className="font-semibold text-red-300">{c.pixel_regions}</b>
      </span>
    </div>
  );
}

function BuildSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-zinc-800 px-4 py-3">
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-5 w-[480px]" />
      </div>
      <div className="grid flex-1 grid-cols-[300px_1fr]">
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
