import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, CheckCircle2, ChevronRight, X } from "lucide-react";
import type { Change, Group, ReviewStatus, RunDetail, Snapshot } from "../api/types";
import { KindIcon, snapshotDot } from "../components/status";
import { Segmented, Skeleton } from "../components/ui";
import { cn, isColor, plural } from "../lib/format";

export type SnapFilter = "changed" | "all";

export function pagesIn(run: RunDetail, g: Group) {
  const paths = new Set(run.snapshots.filter((s) => g.snapshot_ids.includes(s.id)).map((s) => s.path));
  return paths.size;
}

export function Sidebar({
  run,
  selectedGroupId,
  selectedSnapId,
  filter,
  onFilter,
  onSelectGroup,
  onSelectSnap,
  onReviewGroup,
  busyGroupId,
}: {
  run: RunDetail;
  selectedGroupId: string | null;
  selectedSnapId: string | null;
  filter: SnapFilter;
  onFilter: (f: SnapFilter) => void;
  onSelectGroup: (g: Group) => void;
  onSelectSnap: (s: Snapshot) => void;
  onReviewGroup: (g: Group, status: ReviewStatus) => void;
  busyGroupId: string | null;
}) {
  const running = run.result === "running";
  const pendingCount = run.progress.total - run.snapshots.length;
  const reviewable = run.snapshots.filter((s) => s.status === "changed" || s.status === "failed");
  const others = run.snapshots.filter((s) => s.status !== "changed" && s.status !== "failed");
  const [showUnchanged, setShowUnchanged] = useState(false);
  const selectedGroup = run.groups.find((g) => g.id === selectedGroupId);
  const sample = useMemo(() => {
    const m = new Map<string, Change>();
    for (const s of run.snapshots) for (const c of s.changes) if (!m.has(c.group_id)) m.set(c.group_id, c);
    return m;
  }, [run.snapshots]);

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-zinc-800 bg-zinc-900 max-md:h-auto max-md:max-h-[46vh] max-md:shrink-0 max-md:border-b max-md:border-r-0" data-testid="review-sidebar">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* change groups */}
        {!run.is_baseline_build && (
          <section className="border-b border-zinc-800 p-2.5">
            <h2 className="app-eyebrow flex items-center gap-1.5 px-2 pb-2 pt-1.5">
              Changes
              {run.groups.length > 0 && <span className="font-mono text-zinc-600">{run.groups.length}</span>}
            </h2>
            {running && run.groups.length === 0 && (
              <div className="space-y-1.5">
                <Skeleton className="h-11" />
                <Skeleton className="h-11" />
              </div>
            )}
            {!running && run.groups.length === 0 && (
              <div className="flex items-center gap-2 rounded-[3px] px-2 py-2 text-[13px] text-emerald-200" data-testid="no-changes">
                <CheckCircle2 className="size-4 text-emerald-400" />
                No visual changes
              </div>
            )}
            <div className="space-y-1">
              {run.groups.map((g) => (
                <GroupRow
                  key={g.id}
                  g={g}
                  sample={sample.get(g.id)}
                  pages={pagesIn(run, g)}
                  selected={g.id === selectedGroupId}
                  busy={busyGroupId === g.id}
                  onSelect={() => onSelectGroup(g)}
                  onReview={(s) => onReviewGroup(g, s)}
                />
              ))}
            </div>
          </section>
        )}

        {/* snapshots */}
        <section className="p-2.5">
          <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
            <h2 className="app-eyebrow flex items-center gap-1.5">
              Snapshots <span className="font-mono text-zinc-600">{run.progress.total}</span>
            </h2>
            {!run.is_baseline_build && !running && (
              <Segmented<SnapFilter>
                size="sm"
                value={filter}
                onChange={onFilter}
                options={[
                  { id: "changed", label: `Changed ${reviewable.length}`, testId: "filter-changed" },
                  { id: "all", label: "All", testId: "filter-all" },
                ]}
              />
            )}
          </div>
          <ul className="space-y-px" data-testid="snapshot-list">
            {(run.is_baseline_build || running ? run.snapshots : reviewable).map((s) => (
              <SnapRow key={s.id} s={s} selected={s.id === selectedSnapId} inGroup={!!selectedGroup?.snapshot_ids.includes(s.id)} onClick={() => onSelectSnap(s)} />
            ))}
          </ul>
          {!run.is_baseline_build && !running && filter === "all" && others.length > 0 && (
            <div className="mt-1">
              <button
                onClick={() => setShowUnchanged((v) => !v)}
                className="flex w-full items-center gap-1.5 rounded-[3px] px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-950 hover:text-zinc-300"
                data-testid="toggle-unchanged"
              >
                <ChevronRight className={cn("size-3.5 transition-transform", showUnchanged && "rotate-90")} />
                {others.length} unchanged
              </button>
              {showUnchanged && (
                <ul className="space-y-px">
                  {others.map((s) => (
                    <SnapRow key={s.id} s={s} selected={s.id === selectedSnapId} inGroup={false} onClick={() => onSelectSnap(s)} />
                  ))}
                </ul>
              )}
            </div>
          )}
          {running && pendingCount > 0 && (
            <ul className="mt-1 space-y-1">
              {Array.from({ length: Math.min(pendingCount, 6) }, (_, i) => (
                <li key={i} className="flex items-center gap-2.5 px-2 py-1.5">
                  <span className="size-2 rounded-full bg-sky-500/40 animate-pulse" />
                  <Skeleton className="h-3 flex-1" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}

/** One-line visual preview of what changed: color swatches, or quoted text. */
export function ValuePreview({ c, fallback }: { c?: Change; fallback: string }) {
  if (c && (isColor(c.before) || isColor(c.after))) {
    return (
      <span className="flex min-w-0 items-center gap-1 font-mono text-[10.5px] text-zinc-400">
        <Swatch v={c.before} />
        <ArrowRight className="size-2.5 shrink-0 text-zinc-600" />
        <Swatch v={c.after} />
      </span>
    );
  }
  const short = (v: string) => (v.length > 28 ? `${v.slice(0, 27)}…` : v);
  const isPath = (v: string | null) => !!v && /^(\/|https?:)/.test(v);
  if (c && c.kind === "text" && c.before && c.after) {
    return (
      <span className="block truncate text-[11px] text-zinc-400">
        <span className="text-zinc-500 line-through decoration-zinc-600">“{short(c.before)}”</span> → <span className="text-zinc-300">“{short(c.after)}”</span>
      </span>
    );
  }
  const single = c?.after ?? c?.before ?? null;
  if (c && single && single.startsWith("svg:")) {
    return <span className="block truncate text-[11px] text-zinc-500">inline SVG</span>;
  }
  if (c && single && !isPath(single) && (c.kind === "added" || c.kind === "removed" || c.kind === "text")) {
    return <span className={cn("block truncate text-[11px]", c.kind === "removed" ? "text-zinc-500 line-through decoration-zinc-600" : "text-zinc-400")}>“{short(single)}”</span>;
  }
  return <span className="block truncate font-mono text-[10.5px] text-zinc-500">{fallback}</span>;
}

function Swatch({ v }: { v: string | null }) {
  if (!v) return <span className="text-zinc-600">none</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="size-3 shrink-0 rounded-[3px] border border-zinc-700" style={{ background: v }} />
      <span className="truncate">{v}</span>
    </span>
  );
}

function GroupRow({
  g,
  sample,
  pages,
  selected,
  busy,
  onSelect,
  onReview,
}: {
  g: Group;
  sample?: Change;
  pages: number;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onReview: (s: ReviewStatus) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const approved = g.review === "approved";
  const rejected = g.review === "rejected";
  const scope = `${plural(pages, "page")} · ${plural(g.snapshot_ids.length, "snapshot")}`;
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      data-testid="group-card"
      data-group-id={g.id}
      data-review={g.review}
      className={cn(
        "group/card relative flex cursor-pointer items-center gap-3 rounded-[3px] border px-2.5 py-2 outline-none transition-colors focus-visible:border-accent-500",
        selected ? "border-zinc-50 bg-zinc-950 shadow-[2px_2px_0_0_var(--color-zinc-50)]" : "border-transparent hover:border-zinc-800 hover:bg-zinc-950",
        approved && !selected && "bg-emerald-500/[0.04]",
        rejected && !selected && "bg-red-500/[0.05]",
      )}
    >
      {approved ? (
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-[3px] border border-emerald-500/30 bg-emerald-500/15 text-emerald-300" title="Approved">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : rejected ? (
        <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-[3px] border border-red-500/30 bg-red-500/15 text-red-300" title="Rejected">
          <X className="size-3.5" strokeWidth={3} />
        </span>
      ) : (
        <KindIcon kind={g.kind} />
      )}
      <div className="min-w-0 flex-1">
        <div className={cn("line-clamp-2 text-[13.5px] font-semibold leading-snug", approved || rejected ? "text-zinc-500" : "text-zinc-50")}>{g.title}</div>
        <ValuePreview c={sample} fallback={g.detail} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span
          className={cn("rounded-[2px] border border-zinc-800 bg-zinc-950 px-1.5 py-px font-mono text-[10.5px] text-zinc-500", selected ? "hidden" : "group-hover/card:hidden group-focus-visible/card:hidden")}
          title={scope}
          data-testid="group-count"
        >
          ×{g.count}
        </span>
        <div className={cn("items-center gap-1", selected ? "flex" : "hidden group-hover/card:flex group-focus-visible/card:flex")}>
          <ReviewIconButton kind="rejected" active={rejected} disabled={busy} onClick={() => onReview("rejected")} />
          <ReviewIconButton kind="approved" active={approved} disabled={busy} onClick={() => onReview("approved")} />
        </div>
      </div>
    </div>
  );
}

function ReviewIconButton({ kind, active, disabled, onClick }: { kind: ReviewStatus; active: boolean; disabled: boolean; onClick: () => void }) {
  const approve = kind === "approved";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      data-testid={approve ? "group-approve" : "group-reject"}
      aria-label={approve ? "Approve (A)" : "Reject (R)"}
      aria-pressed={active}
      title={approve ? "Approve (A)" : "Reject (R)"}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-[3px] border transition-colors disabled:opacity-50",
        approve
          ? active
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-emerald-500 hover:bg-emerald-500 hover:text-white"
          : active
            ? "border-red-500 bg-red-500 text-white"
            : "border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-red-500 hover:bg-red-500/10 hover:text-red-300",
      )}
    >
      {approve ? <Check className="size-3.5" strokeWidth={2.5} /> : <X className="size-3.5" strokeWidth={2.5} />}
    </button>
  );
}

function SnapRow({ s, selected, inGroup, onClick }: { s: Snapshot; selected: boolean; inGroup: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <li>
      <button
        ref={ref}
        onClick={onClick}
        data-testid="snapshot-row"
        data-snapshot-id={s.id}
        data-status={s.status}
        title={s.path}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-[3px] px-2 py-1.5 text-left transition-colors animate-fade-in",
          selected ? "bg-zinc-950 text-zinc-50 shadow-[inset_2px_0_0_var(--color-accent-500)]" : "text-zinc-400 hover:bg-zinc-950 hover:text-zinc-100",
        )}
      >
        <span className={cn("relative h-7 w-9 shrink-0 overflow-hidden rounded border", s.status === "failed" ? "bg-red-500/10" : "bg-white", selected ? "border-zinc-500" : "border-zinc-800", inGroup && !selected && "ring-2 ring-accent-500/40")}>
          {s.status !== "failed" && <img src={s.image_url} alt="" loading="lazy" className="w-full object-cover object-top" />}
          <span className={cn("absolute bottom-0.5 right-0.5 size-1.5 rounded-full ring-1 ring-black/40", snapshotDot(s.status, s.review))} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{s.name}</span>
        {s.changes.length > 0 && <span className="font-mono text-[10px] text-zinc-500">{s.changes.length}</span>}
        <span className="font-mono text-[10px] text-zinc-600">{s.viewport}</span>
      </button>
    </li>
  );
}
