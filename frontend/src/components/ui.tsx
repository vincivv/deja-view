import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "../lib/format";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent-500 text-white hover:bg-accent-400 border-accent-400/40 shadow-[0_0_0_1px_rgba(139,92,246,0.3),0_1px_8px_-2px_rgba(139,92,246,0.6)]",
  secondary: "bg-zinc-900 text-zinc-100 hover:bg-zinc-800 border-zinc-700/80",
  ghost: "bg-transparent text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 border-transparent",
  danger: "bg-zinc-900 text-red-300 hover:bg-red-500/15 hover:text-red-200 border-red-500/30",
  success: "bg-emerald-500 text-zinc-950 hover:bg-emerald-400 border-emerald-300/40 font-semibold",
};
const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5 rounded-md",
  md: "h-8 px-3 text-[13px] gap-2 rounded-md",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center border font-medium whitespace-nowrap transition-colors select-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:opacity-50 disabled:pointer-events-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ className, label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...rest}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors disabled:opacity-40",
        className,
      )}
    />
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-zinc-700 bg-zinc-800/80 px-1 font-mono text-[10px] font-medium text-zinc-400",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin text-zinc-400", className)} />;
}

export function ProgressBar({ done, total, className }: { done: number; total: number; className?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-zinc-800", className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-sky-400 transition-[width] duration-500 ease-out" style={{ width: `${Math.max(pct, total ? 3 : 0)}%` }} />
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cn(
        "h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 text-[13px] text-zinc-100 placeholder:text-zinc-600",
        "focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25",
        className,
      )}
    />
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={cn(
        "w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-zinc-100 placeholder:text-zinc-600",
        "focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25",
        className,
      )}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between text-xs font-medium text-zinc-300">
        {label}
        {hint && <span className="font-normal text-zinc-500">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export const VIEWPORT_PRESETS = [1440, 1280, 1024, 768, 390];

export function ViewportChips({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {VIEWPORT_PRESETS.map((w) => {
        const on = value.includes(w);
        return (
          <button
            key={w}
            type="button"
            data-testid={`viewport-chip-${w}`}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== w) : [...value, w].sort((a, b) => b - a))}
            className={cn(
              "h-7 rounded-md border px-2.5 font-mono text-xs transition-colors",
              on ? "border-accent-500/60 bg-accent-500/15 text-accent-300" : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300",
            )}
          >
            {w}
            <span className="ml-1 text-[10px] opacity-60">{w >= 1024 ? "desktop" : w >= 600 ? "tablet" : "mobile"}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  width = "max-w-lg",
  testId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  width?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>("input,textarea,button[data-autofocus]")?.focus(), 30);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[12vh] backdrop-blur-[2px] animate-fade-in" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        className={cn("w-full rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/60 animate-pop", width)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-zinc-100">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-zinc-500">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 px-6 py-16 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400">{icon}</div>
      <h3 className="text-[15px] font-semibold text-zinc-100">{title}</h3>
      {children && <div className="mt-1.5 max-w-md text-[13px] text-zinc-500">{children}</div>}
      {action && <div className="mt-5 flex gap-2">{action}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-200">
      <span>{message}</span>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 border-b border-zinc-800" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          data-testid={`tab-${t.id}`}
          onClick={() => onChange(t.id)}
          className={cn(
            "relative -mb-px flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-[13px] font-medium transition-colors",
            value === t.id ? "border-accent-500 text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded bg-zinc-800 px-1.5 py-px font-mono text-[10px] text-zinc-400">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { id: T; label: ReactNode; title?: string; testId?: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          title={o.title}
          data-testid={o.testId}
          disabled={o.disabled}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-35 disabled:pointer-events-none",
            size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs",
            value === o.id ? "bg-zinc-800 text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-300",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, label, kbd, testId, tone = "accent" }: { on: boolean; onChange: (v: boolean) => void; label: string; kbd?: string; testId?: string; tone?: "accent" | "red" | "amber" }) {
  const toneOn = tone === "red" ? "border-red-500/50 bg-red-500/15 text-red-200" : tone === "amber" ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-accent-500/50 bg-accent-500/15 text-accent-300";
  const dot = tone === "red" ? "bg-red-400" : tone === "amber" ? "bg-amber-300" : "bg-accent-400";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      data-testid={testId}
      onClick={() => onChange(!on)}
      className={cn(
        "inline-flex h-7 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition-colors",
        on ? toneOn : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200",
      )}
    >
      <span className={cn("relative inline-block h-3 w-5 rounded-full transition-colors", on ? "bg-white/20" : "bg-zinc-700")}>
        <span className={cn("absolute top-0.5 size-2 rounded-full transition-all", on ? `left-2.5 ${dot}` : "left-0.5 bg-zinc-400")} />
      </span>
      {label}
      {kbd && <Kbd className="ml-0.5 max-[1599px]:hidden">{kbd}</Kbd>}
    </button>
  );
}

/** Click-to-open floating panel (menus, info popovers). Closes on outside click and Escape. */
export function Popover({
  trigger,
  children,
  align = "right",
  width = "w-56",
  testId,
}: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          data-testid={testId}
          className={cn(
            "absolute top-full z-50 mt-1.5 rounded-lg border border-zinc-800 bg-zinc-900 p-1 shadow-2xl shadow-black/60 animate-pop",
            align === "right" ? "right-0" : "left-0",
            width,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, children, danger, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      {...rest}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
        danger ? "text-red-300 hover:bg-red-500/10" : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
