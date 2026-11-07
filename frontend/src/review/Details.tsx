import { ArrowDownUp, ArrowRight, Check, EyeOff, ScanSearch, X } from "lucide-react";
import type { Change, Group, ReviewStatus, Snapshot } from "../api/types";
import { KindIcon, ReviewPill } from "../components/status";
import { Button } from "../components/ui";
import { cn, duration, isColor, plural } from "../lib/format";

export function Details({
  snap,
  groups,
  changeNumber,
  activeChangeId,
  hoverChangeId,
  onPick,
  onHover,
  onReviewSnap,
  busy,
  showNoise,
  onToggleNoise,
  showPixel,
  onTogglePixel,
}: {
  snap: Snapshot;
  groups: Map<string, Group>;
  changeNumber: Map<string, number>;
  activeChangeId: string | null;
  hoverChangeId: string | null;
  onPick: (c: Change) => void;
  onHover: (id: string | null) => void;
  onReviewSnap: (s: ReviewStatus) => void;
  busy: boolean;
  showNoise: boolean;
  onToggleNoise: () => void;
  showPixel: boolean;
  onTogglePixel: () => void;
}) {
  const shift = snap.layout_shifts[0];
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-zinc-800 bg-zinc-950" data-testid="details-panel">
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-[13px] font-semibold text-zinc-100">{snap.name}</h2>
          {snap.review && <ReviewPill review={snap.review} />}
        </div>
        <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-zinc-500">
          <span className="truncate">{snap.path}</span>
          <span className="text-zinc-700">·</span>
          <span>{snap.viewport}px</span>
          <span className="text-zinc-700">·</span>
          <span>
            {snap.width}×{snap.height}
          </span>
        </div>
        {snap.status === "changed" && (
          <div className="mt-3 flex gap-1.5">
            <Button size="sm" variant="danger" className="flex-1" icon={<X className="size-3" />} onClick={() => onReviewSnap("rejected")} disabled={busy} data-testid="snapshot-reject">
              Reject snapshot
            </Button>
            <Button size="sm" variant="secondary" className="flex-1 hover:border-emerald-500/40 hover:text-emerald-200" icon={<Check className="size-3" />} onClick={() => onReviewSnap("approved")} disabled={busy} data-testid="snapshot-approve">
              Approve snapshot
            </Button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <section>
          <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            {snap.changes.length ? `${plural(snap.changes.length, "change")} on this snapshot` : "Changes"}
          </h3>
          {snap.changes.length === 0 && (
            <div className="rounded-lg border border-zinc-800 px-3 py-3 text-xs text-zinc-500">
              {snap.status === "new" ? "New snapshot, so there is nothing to compare yet." : snap.status === "failed" ? "Capture failed." : "No visual changes on this snapshot."}
            </div>
          )}
          <ul className="space-y-1.5">
            {snap.changes.map((c) => {
              const g = groups.get(c.group_id);
              const on = c.id === activeChangeId;
              const hover = c.id === hoverChangeId;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onPick(c)}
                    onMouseEnter={() => onHover(c.id)}
                    onMouseLeave={() => onHover(null)}
                    data-testid="change-card"
                    data-change-id={c.id}
                    className={cn(
                      "w-full rounded-lg border p-2.5 text-left transition-colors",
                      on ? "border-accent-500/60 bg-accent-500/[0.07]" : hover ? "border-zinc-700 bg-zinc-900" : "border-zinc-800 bg-zinc-900/40",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className={cn("mt-0.5 flex h-4 min-w-4 items-center justify-center rounded-[3px] px-1 font-mono text-[10px] font-bold text-white", c.kind === "removed" ? "bg-red-500" : "bg-accent-500")}>
                        {changeNumber.get(c.id)}
                      </span>
                      <KindIcon kind={c.kind} className="size-5 [&_svg]:size-3" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-medium text-zinc-100">{c.title}</div>
                        <div className="mt-0.5 text-[11.5px] leading-snug text-zinc-400">{c.detail}</div>
                      </div>
                    </div>
                    <div className="mt-2 truncate rounded bg-zinc-950 px-1.5 py-1 font-mono text-[10.5px] text-zinc-400" title={c.selector}>
                      {c.selector}
                    </div>
                    {(c.before || c.after) && <BeforeAfter c={c} />}
                    {g && (
                      <div className="mt-2 flex items-center justify-between text-[10.5px] text-zinc-500">
                        <span>
                          Group: {g.count > 1 ? `same change on ${plural(g.snapshot_ids.length, "snapshot")}` : "this snapshot only"}
                        </span>
                        <ReviewPill review={g.review} />
                      </div>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {shift && (
          <section>
            <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Layout shift</h3>
            <div className="flex gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5 text-[11.5px] leading-snug text-zinc-400">
              <ArrowDownUp className="mt-0.5 size-3.5 shrink-0 text-sky-400" />
              <span>
                {plural(shift.elements, "element")} below y={shift.from_y} moved {Math.abs(shift.dy)}px {shift.dy > 0 ? "down" : "up"} together. Sightline counts this as one shift, not {shift.elements} changes
                {shift.cause_change_id && changeNumber.get(shift.cause_change_id) ? `, and change #${changeNumber.get(shift.cause_change_id)} caused it` : ""}.
              </span>
            </div>
          </section>
        )}

        {snap.baseline_image_url && snap.status !== "failed" && (
          <section>
            <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Suppressed</h3>
            <div className="divide-y divide-zinc-800 rounded-lg border border-zinc-800 bg-zinc-900/40 text-[11.5px]">
              <button onClick={onToggleNoise} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-zinc-400 hover:text-zinc-200" data-testid="details-noise">
                <EyeOff className="size-3.5 text-amber-300" />
                <span className="flex-1">{plural(snap.noise_rects.length, "noise region")} ignored</span>
                <span className="text-[10.5px] text-zinc-600">{showNoise ? "hide" : "show"}</span>
              </button>
              <button onClick={onTogglePixel} className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-zinc-400 hover:text-zinc-200" data-testid="details-pixel">
                <ScanSearch className="size-3.5 text-red-400" />
                <span className="flex-1">
                  Pixel diff would flag <b className="text-red-300">{snap.pixel_diff.regions.length}</b> ({snap.pixel_diff.pct}%)
                </span>
                <span className="text-[10.5px] text-zinc-600">{showPixel ? "hide" : "show"}</span>
              </button>
            </div>
          </section>
        )}
        {snap.duration_ms != null && <div className="px-1 text-[10.5px] text-zinc-600">Captured in {duration(snap.duration_ms)}</div>}
      </div>
    </aside>
  );
}

function BeforeAfter({ c }: { c: Change }) {
  const colors = isColor(c.before) || isColor(c.after);
  if (colors) {
    return (
      <div className="mt-2 flex items-center gap-2 font-mono text-[11px]">
        <Swatch v={c.before} />
        <ArrowRight className="size-3 text-zinc-600" />
        <Swatch v={c.after} />
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-1 text-[11px] leading-snug">
      {c.before && <div className="rounded bg-red-500/[0.08] px-1.5 py-1 text-red-200/80 line-through decoration-red-400/40">{c.before}</div>}
      {c.after && <div className="rounded bg-emerald-500/[0.08] px-1.5 py-1 text-emerald-200/90">{c.after}</div>}
      {!c.after && <div className="rounded bg-zinc-800/60 px-1.5 py-1 italic text-zinc-500">(missing)</div>}
    </div>
  );
}

function Swatch({ v }: { v: string | null }) {
  if (!v) return <span className="text-zinc-600">none</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-950 py-0.5 pl-0.5 pr-1.5 text-zinc-300">
      <span className="size-3.5 rounded-sm border border-white/10" style={{ background: v }} />
      {v}
    </span>
  );
}
