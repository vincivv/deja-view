import type { ChangeKind, RunResult, RunStatus } from "../api/types";

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function duration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export function plural(n: number, one: string, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}

export function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export const RESULT_LABEL: Record<RunResult, string> = {
  passed: "Passed",
  changes: "Needs review",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
  running: "Running",
};

export const STATUS_LABEL: Record<RunStatus, string> = {
  queued: "Queued",
  capturing: "Capturing",
  diffing: "Diffing",
  done: "Done",
  failed: "Failed",
};

export const KIND_LABEL: Record<ChangeKind, string> = {
  style: "Style",
  text: "Text",
  image: "Image",
  added: "Added",
  removed: "Removed",
  moved: "Moved",
  resized: "Resized",
  visual: "Visual",
};

export function isActive(status: RunStatus) {
  return status === "queued" || status === "capturing" || status === "diffing";
}

export function isColor(v: string | null): boolean {
  if (!v) return false;
  return /^#([0-9a-f]{3,8})$/i.test(v.trim()) || /^(rgb|hsl)a?\(/i.test(v.trim());
}

export function cn(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}
