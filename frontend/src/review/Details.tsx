import { ArrowRight, Check, X } from "lucide-react";
import type { Change, ReviewStatus, Snapshot } from "../api/types";
import { IconButton } from "../components/ui";
import { cn, isColor } from "../lib/format";

/** On-demand panel (D): the raw before/after values and selector for each change on this snapshot. */
export function Details({
  snap,
  changeNumber,
  activeChangeId,
  hoverChangeId,
  onPick,
  onHover,
  onReviewSnap,
  busy,
}: {
  snap: Snapshot;
  changeNumber: Map<string, number>;
  activeChangeId: string | null;
  hoverChangeId: string | null;
  onPick: (c: Change) => void;
  onHover: (id: string | null) => void;
  onReviewSnap: (s: ReviewStatus) => void;
  busy: boolean;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-zinc-800 bg-zinc-950" data-testid="details-panel">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-zinc-100">{snap.name}</div>
          <div className="truncate font-mono text-[10.5px] text-zinc-500">
            {snap.path} · {snap.viewport}px
          </div>
        </div>
        {snap.status === "changed" && (
          <div className="flex gap-0.5">
            <IconButton
              label="Reject snapshot"
              onClick={() => onReviewSnap("rejected")}
              disabled={busy}
              data-testid="snapshot-reject"
              className={cn("border border-zinc-800 hover:text-red-200", snap.review === "rejected" && "border-red-500/50 bg-red-500/20 text-red-200")}
            >
              <X className="size-3.5" />
            </IconButton>
            <IconButton
              label="Approve snapshot"
              onClick={() => onReviewSnap("approved")}
              disabled={busy}
              data-testid="snapshot-approve"
              className={cn("border border-zinc-800 hover:text-emerald-200", snap.review === "approved" && "border-emerald-500/50 bg-emerald-500/20 text-emerald-200")}
            >
              <Check className="size-3.5" />
            </IconButton>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {snap.changes.length === 0 && <div className="px-2 py-3 text-xs text-zinc-500">{snap.status === "failed" ? "Capture failed" : "No changes"}</div>}
        <ul className="space-y-1">
          {snap.changes.map((c) => {
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
                    on ? "border-accent-500/50 bg-accent-500/[0.07]" : hover ? "border-zinc-700 bg-zinc-900" : "border-zinc-800/70 bg-zinc-900/30",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("flex h-4 min-w-4 items-center justify-center rounded-[3px] px-1 font-mono text-[10px] font-bold text-white", c.kind === "removed" ? "bg-red-500" : "bg-accent-500")}>
                      {changeNumber.get(c.id)}
                    </span>
                    <span className="truncate text-[12.5px] font-medium text-zinc-100">{c.title}</span>
                  </div>
                  {c.before || c.after ? <BeforeAfter c={c} /> : <div className="mt-1.5 text-[11.5px] text-zinc-400">{c.detail}</div>}
                  <div className="mt-2 truncate font-mono text-[10.5px] text-zinc-500" title={c.selector}>
                    {c.selector}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

function BeforeAfter({ c }: { c: Change }) {
  if (isColor(c.before) || isColor(c.after)) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
        <Swatch v={c.before} />
        <ArrowRight className="size-3 text-zinc-600" />
        <Swatch v={c.after} />
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-1 text-[11px] leading-snug">
      {c.before && <div className="break-words rounded bg-red-500/[0.08] px-1.5 py-1 text-red-200/80 line-through decoration-red-400/40">{c.before}</div>}
      {c.after ? <div className="break-words rounded bg-emerald-500/[0.08] px-1.5 py-1 text-emerald-200/90">{c.after}</div> : <div className="rounded bg-zinc-800/60 px-1.5 py-1 italic text-zinc-500">removed</div>}
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
