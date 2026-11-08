import {
  Ban,
  Check,
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleDot,
  Image as ImageIcon,
  ImageOff,
  Loader2,
  Move,
  Palette,
  Plus,
  Scaling,
  ScanEye,
  Type,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ChangeKind, Review, RunResult, SnapshotStatus } from "../api/types";
import { RESULT_LABEL, cn } from "../lib/format";

const RESULT_STYLE: Record<RunResult, { cls: string; icon: LucideIcon }> = {
  passed: { cls: "text-emerald-300 bg-emerald-500/10 border-emerald-500/40", icon: CheckCircle2 },
  approved: { cls: "text-emerald-300 bg-emerald-500/10 border-emerald-500/40", icon: Check },
  changes: { cls: "text-amber-300 bg-amber-400/10 border-amber-400/40", icon: CircleDot },
  rejected: { cls: "text-red-300 bg-red-500/10 border-red-500/40", icon: XCircle },
  failed: { cls: "text-red-300 bg-red-500/10 border-red-500/40", icon: CircleAlert },
  running: { cls: "text-sky-300 bg-sky-500/10 border-sky-500/40", icon: Loader2 },
};

export function ResultBadge({ result, baseline, className }: { result: RunResult; baseline?: boolean; className?: string }) {
  const s = RESULT_STYLE[result];
  const Icon = s.icon;
  const label = baseline && result === "passed" ? "Baseline" : RESULT_LABEL[result];
  return (
    <span data-testid="result-badge" data-result={result} className={cn("inline-flex h-[22px] items-center gap-1.5 rounded-[3px] border px-2 text-[11.5px] font-semibold whitespace-nowrap", s.cls, className)}>
      <Icon className={cn("size-3", result === "running" && "animate-spin")} strokeWidth={2.5} />
      {label}
    </span>
  );
}

export function ReviewPill({ review }: { review: Review }) {
  const cls =
    review === "approved"
      ? "text-emerald-300 bg-emerald-500/10"
      : review === "rejected"
        ? "text-red-300 bg-red-500/10"
        : "text-amber-300 bg-amber-400/10";
  const Icon = review === "approved" ? Check : review === "rejected" ? Ban : Circle;
  return (
    <span data-testid="review-pill" data-review={review} className={cn("inline-flex items-center gap-1 rounded-[2px] px-1.5 py-px font-mono text-[10px] font-semibold uppercase tracking-wider", cls)}>
      <Icon className="size-2.5" strokeWidth={3} />
      {review}
    </span>
  );
}

export function snapshotDot(status: SnapshotStatus, review: Review | null): string {
  if (status === "failed") return "bg-red-500";
  if (status === "new") return "bg-sky-400";
  if (status === "unchanged") return "bg-zinc-700";
  if (review === "approved") return "bg-emerald-400";
  if (review === "rejected") return "bg-red-400";
  return "bg-amber-400";
}

export const KIND_ICON: Record<ChangeKind, LucideIcon> = {
  style: Palette,
  text: Type,
  image: ImageIcon,
  added: Plus,
  removed: ImageOff,
  moved: Move,
  resized: Scaling,
  visual: ScanEye,
};

export function KindIcon({ kind, className }: { kind: ChangeKind; className?: string }) {
  const Icon = KIND_ICON[kind];
  const tone =
    kind === "style"
      ? "text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/20"
      : kind === "text"
        ? "text-sky-300 bg-sky-500/10 border-sky-500/20"
        : kind === "removed"
          ? "text-red-300 bg-red-500/10 border-red-500/20"
          : kind === "added"
            ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
            : "text-amber-300 bg-amber-500/10 border-amber-500/20";
  return (
    <span className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-[3px] border", tone, className)}>
      <Icon className="size-3.5" />
    </span>
  );
}
