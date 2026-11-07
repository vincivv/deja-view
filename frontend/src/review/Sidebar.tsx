import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, ChevronRight, X } from "lucide-react";
import type { Group, ReviewStatus, RunDetail, Snapshot } from "../api/types";
import { KindIcon, ReviewPill, snapshotDot } from "../components/status";
import { Kbd, Segmented, Skeleton } from "../components/ui";
import { cn, plural } from "../lib/format";

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

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-zinc-800 bg-zinc-950" data-testid="review-sidebar">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* groups */}
        {!run.is_baseline_build && (
          <section className="border-b border-zinc-800 p-3">
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Changes</h2>
              {run.groups.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-zinc-600">
                  <Kbd>J</Kbd>
                  <Kbd>K</Kbd>
                </span>
              )}
            </div>
            {running && run.groups.length === 0 && (
              <div className="space-y-2">
                <Skeleton className="h-[86px]" />
                <Skeleton className="h-[86px]" />
                <div className="px-1 text-[11px] text-zinc-500">Grouping changes once all snapshots are diffed…</div>
              </div>
            )}
            {!running && run.groups.length === 0 && (
              <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-3" data-testid="no-changes">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <div>
                  <div className="text-[13px] font-medium text-emerald-200">No visual changes</div>
                  <div className="text-[11px] text-zinc-500">{run.counts.noise_ignored} noise regions ignored</div>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              {run.groups.map((g, i) => (
                <GroupCard
                  key={g.id}
                  index={i}
                  g={g}
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
        <section className="p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Snapshots <span className="ml-1 font-mono text-zinc-600">{run.progress.total}</span>
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
            {!run.is_baseline_build && reviewable.length === 0 && !running && filter === "changed" && (
              <li className="px-2 py-2 text-xs text-zinc-500">Nothing to review.</li>
            )}
          </ul>
          {!run.is_baseline_build && !running && filter === "all" && others.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowUnchanged((v) => !v)}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
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
              <li className="px-2 text-[11px] text-sky-300/80">{pendingCount} still capturing…</li>
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}

function GroupCard({
  g,
  index,
  pages,
  selected,
  busy,
  onSelect,
  onReview,
}: {
  g: Group;
  index: number;
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
        "group/card relative cursor-pointer rounded-lg border p-2.5 transition-colors outline-none",
        selected ? "border-accent-500/60 bg-accent-500/[0.07]" : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900",
        g.review !== "pending" && !selected && "opacity-70",
      )}
    >
      <div className="flex items-start gap-2.5">
        <KindIcon kind={g.kind} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-zinc-600">G{index + 1}</span>
            <span className="truncate text-[13px] font-medium text-zinc-100">{g.title}</span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-zinc-400" title={g.detail}>
            {g.detail}
          </div>
          <div className="mt-1 truncate font-mono text-[10.5px] text-zinc-600">{g.selector}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 pl-[34px]">
        <span className="text-[11px] text-zinc-500" data-testid="group-scope">
          on <b className="font-semibold text-zinc-300">{plural(pages, "page")}</b>
          {g.snapshot_ids.length !== pages && <> · {plural(g.snapshot_ids.length, "snapshot")}</>}
        </span>
        {g.review !== "pending" && <ReviewPill review={g.review} />}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 pl-[34px]">
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onReview("rejected");
          }}
          data-testid="group-reject"
          title="Reject group (R)"
          className={cn(
            "inline-flex h-6 items-center justify-center gap-1 rounded-md border text-[11px] font-medium transition-colors disabled:opacity-50",
            g.review === "rejected" ? "border-red-500/50 bg-red-500/20 text-red-200" : "border-zinc-800 text-zinc-400 hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-200",
          )}
        >
          <X className="size-3" strokeWidth={2.5} />
          {g.review === "rejected" ? "Rejected" : "Reject"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onReview("approved");
          }}
          data-testid="group-approve"
          title="Approve group (A)"
          className={cn(
            "inline-flex h-6 items-center justify-center gap-1 rounded-md border text-[11px] font-medium transition-colors disabled:opacity-50",
            g.review === "approved"
              ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-200"
              : "border-zinc-800 text-zinc-300 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-200",
          )}
        >
          <Check className="size-3" strokeWidth={2.5} />
          {g.review === "approved" ? "Approved" : "Approve"}
        </button>
      </div>
    </div>
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
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors animate-fade-in",
          selected ? "bg-zinc-800/80 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
        )}
      >
        <span className={cn("size-2 shrink-0 rounded-full", snapshotDot(s.status, s.review), inGroup && !selected && "ring-2 ring-accent-500/40")} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium">{s.name}</span>
          <span className="block truncate font-mono text-[10.5px] text-zinc-600">{s.path}</span>
        </span>
        {s.changes.length > 0 && <span className="font-mono text-[10px] text-zinc-500">{s.changes.length}</span>}
        <span className="rounded border border-zinc-800 px-1 font-mono text-[10px] text-zinc-500">{s.viewport}</span>
      </button>
    </li>
  );
}
