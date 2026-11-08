import { useEffect, useRef, useState, type ReactNode } from "react";

export function useReducedMotion() {
  const [r, setR] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}

/** True once the element has scrolled into view (stays true). */
export function useInView<T extends Element>(threshold = 0.3) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen] as const;
}

/** Counts from `from` to `to` in visible pixel-ish steps once `run` turns true. */
export function Ticker({ from = 0, to, decimals = 0, run, ms = 1200, steps = 24 }: { from?: number; to: number; decimals?: number; run: boolean; ms?: number; steps?: number }) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(from);
  useEffect(() => {
    if (!run) return;
    if (reduce) { setV(to); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const stepped = Math.floor(k * steps) / steps;
      setV(from + (to - from) * (1 - Math.pow(1 - stepped, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, run, ms, steps, reduce]);
  return <>{v.toFixed(decimals)}</>;
}

/** 8x8 pixel eye mark, drawn with rects so it stays crisp at any size. */
const EYE = [
  "..XXXX..",
  ".X....X.",
  "X..XX..X",
  "X.XXXX.X",
  "X.XXXX.X",
  "X..XX..X",
  ".X....X.",
  "..XXXX..",
];
export function PixelMark({ className = "size-6", color = "var(--dv-hot)" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 8 8" className={className} shapeRendering="crispEdges" aria-hidden>
      {EYE.flatMap((row, y) => [...row].map((c, x) => (c === "X" ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={color} /> : null)))}
    </svg>
  );
}

export function SectionHead({ index, label, title, sub, align = "left" }: { index: string; label: string; title: ReactNode; sub?: ReactNode; align?: "left" | "center" }) {
  return (
    <div className={`mb-12 max-w-4xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      <div className={`dv-silk mb-4 flex items-center gap-3 text-[12px] text-[var(--dv-hot-ink)] ${align === "center" ? "justify-center" : ""}`}>
        <span>{index}</span>
        <span className="h-px w-8 bg-[var(--dv-hot)]" />
        <span className="text-[var(--dv-mute)]">{label}</span>
      </div>
      <h2 className="dv-pixel text-[38px] font-semibold leading-[1.02] text-[var(--dv-ink)] sm:text-[60px]">{title}</h2>
      {sub && <p className="mt-5 text-[18px] leading-relaxed text-[var(--dv-mute)] sm:text-[21px]">{sub}</p>}
    </div>
  );
}

export function Section({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`relative border-t-2 border-[var(--dv-ink)] ${className}`}>
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-8 sm:py-36">{children}</div>
    </section>
  );
}

/** Small window chrome in the page's style (square, pixel dots). */
export function Frame({ title, right, children, className = "" }: { title: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`dv-card overflow-hidden ${className}`}>
      <div className="flex h-9 items-center gap-2 border-b border-[var(--dv-line)] bg-[var(--dv-bg2)] px-3">
        <span className="size-2 bg-[var(--dv-dim)]" /><span className="size-2 bg-[var(--dv-dim)]" /><span className="size-2 bg-[var(--dv-dim)]" />
        <span className="ml-2 truncate font-mono text-[11px] text-[var(--dv-mute)]">{title}</span>
        {right && <span className="ml-auto shrink-0">{right}</span>}
      </div>
      {children}
    </div>
  );
}
