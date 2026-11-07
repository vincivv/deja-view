import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { AlertTriangle, ArrowDownUp, ImageOff, Info, Loader2, MoveHorizontal, ScanSearch } from "lucide-react";
import type { Change, Rect, Snapshot } from "../api/types";
import { cn, plural } from "../lib/format";

export type ViewMode = "side" | "overlay" | "swipe" | "single";
export type Zoom = "fit" | "actual";

export interface ViewerProps {
  snap: Snapshot;
  mode: ViewMode;
  zoom: Zoom;
  showNoise: boolean;
  showPixel: boolean;
  activeChangeId: string | null;
  hoverChangeId: string | null;
  focusToken: number;
  changeNumber: Map<string, number>;
  onPickChange: (c: Change) => void;
  onHoverChange: (id: string | null) => void;
  baselineLabel: string;
  newLabel: string;
}

function useWidth(ref: RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

const PAD = 20;
const PAD_TOP = 40;

export function Viewer(props: ViewerProps) {
  const { snap, mode, zoom, showPixel } = props;
  const hasBase = !!snap.baseline_image_url;
  const effectiveMode: ViewMode = hasBase ? mode : "single";

  const shift = snap.layout_shifts[0];
  const banners: ReactNode[] = [];
  if (snap.status === "failed") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-xl rounded-xl border border-red-500/30 bg-red-500/5 p-5" data-testid="snapshot-error">
          <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-red-200">
            <AlertTriangle className="size-4" />
            Snapshot failed
          </div>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-red-200/80">{snap.error ?? "Unknown error"}</pre>
        </div>
      </div>
    );
  }
  if (!hasBase) {
    banners.push(
      <Banner key="new" tone="sky" icon={<Info className="size-3.5" />}>
        {snap.status === "new" ? "New snapshot: no baseline to compare with. It's accepted as the baseline." : "No baseline image available."}
      </Banner>,
    );
  }
  if (showPixel && hasBase) {
    banners.push(
      <Banner key="px" tone="red" icon={<ScanSearch className="size-3.5" />} testId="pixel-diff-banner">
        This is what a plain pixel diff flags: <b>{plural(snap.pixel_diff.regions.length, "region")}</b>. Sightline reduced it to{" "}
        <b>{plural(snap.changes.length, "real change")}</b>.
      </Banner>,
    );
  }
  if (shift && !showPixel) {
    const cause = shift.cause_change_id ? props.changeNumber.get(shift.cause_change_id) : undefined;
    banners.push(
      <Banner key="shift" tone="zinc" icon={<ArrowDownUp className="size-3.5" />} testId="layout-shift-banner">
        Content below y={shift.from_y} moved {shift.dy > 0 ? "down" : "up"} {Math.abs(shift.dy)}px{shift.dx ? ` and ${shift.dx > 0 ? "right" : "left"} ${Math.abs(shift.dx)}px` : ""}. That's{" "}
        {plural(shift.elements, "element")} moving together, counted as one layout shift and not reviewed separately
        {cause ? (
          <>
            {" "}
            · caused by change <span className="rounded bg-accent-500/20 px-1 font-mono text-accent-200">#{cause}</span>
          </>
        ) : null}
      </Banner>,
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {banners.length > 0 && <div className="space-y-1.5 border-b border-zinc-800 px-3 py-2">{banners}</div>}
      <div className="min-h-0 flex-1">
        {effectiveMode === "side" ? (
          <SideBySide {...props} />
        ) : (
          <SinglePane {...props} mode={effectiveMode} zoom={zoom} />
        )}
      </div>
    </div>
  );
}

function Banner({ tone, icon, children, testId }: { tone: "zinc" | "red" | "sky"; icon: ReactNode; children: ReactNode; testId?: string }) {
  const cls =
    tone === "red"
      ? "border-red-500/25 bg-red-500/[0.07] text-red-200"
      : tone === "sky"
        ? "border-sky-500/25 bg-sky-500/[0.07] text-sky-200"
        : "border-zinc-700/70 bg-zinc-800/40 text-zinc-300";
  return (
    <div data-testid={testId} className={cn("flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs leading-relaxed", cls)}>
      <span className="mt-0.5 shrink-0 opacity-80">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

// ---------- panes ----------

function scrollToRect(el: HTMLElement | null, r: Rect | null, scale: number) {
  if (!el || !r) return;
  const [x1, y1, x2, y2] = r;
  const top = y1 * scale + PAD_TOP - el.clientHeight / 3 + ((y2 - y1) * scale) / 6;
  const left = ((x1 + x2) / 2) * scale + PAD - el.clientWidth / 2;
  el.scrollTo({ top: Math.max(0, top), left: Math.max(0, left), behavior: "smooth" });
}

function useScale(paneRef: RefObject<HTMLDivElement | null>, imgW: number, zoom: Zoom) {
  const w = useWidth(paneRef);
  if (zoom === "actual") return 1;
  if (!w) return 0;
  return Math.min(1, (w - PAD * 2) / imgW);
}

function SideBySide(p: ViewerProps) {
  const { snap } = p;
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const scale = useScale(rightRef, snap.width, p.zoom);
  const syncing = useRef<HTMLElement | null>(null);

  const sync = useCallback((from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to) return;
    if (syncing.current && syncing.current !== from) return;
    syncing.current = from;
    to.scrollTop = from.scrollTop;
    to.scrollLeft = from.scrollLeft;
    requestAnimationFrame(() => {
      syncing.current = null;
    });
  }, []);

  useFocus(p, scale, rightRef);

  return (
    <div className="grid h-full min-h-0 grid-cols-2 divide-x divide-zinc-800">
      <PaneFrame label={p.baselineLabel} tone="base">
        <div ref={leftRef} className="checker h-full overflow-auto" onScroll={() => sync(leftRef.current, rightRef.current)} data-testid="pane-baseline">
          {scale > 0 && (
            <Stage w={snap.baseline_width ?? snap.width} h={snap.baseline_height ?? snap.height} scale={scale}>
              <Img src={snap.baseline_image_url!} alt="Baseline" />
              <Overlays {...p} scale={scale} space="base" />
            </Stage>
          )}
        </div>
      </PaneFrame>
      <PaneFrame label={p.newLabel} tone="new">
        <div ref={rightRef} className="checker h-full overflow-auto" onScroll={() => sync(rightRef.current, leftRef.current)} data-testid="pane-new">
          {scale > 0 && (
            <Stage w={snap.width} h={snap.height} scale={scale}>
              <Img src={snap.image_url} alt="New" />
              <Overlays {...p} scale={scale} space="new" />
            </Stage>
          )}
        </div>
      </PaneFrame>
    </div>
  );
}

function PaneFrame({ label, tone, children }: { label: string; tone: "base" | "new"; children: ReactNode }) {
  return (
    <div className="relative min-h-0">
      <div
        className={cn(
          "pointer-events-none absolute left-3 top-2 z-20 rounded-md border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider backdrop-blur",
          tone === "base" ? "border-zinc-700 bg-zinc-900/85 text-zinc-400" : "border-accent-500/40 bg-zinc-900/85 text-accent-300",
        )}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function useFocus(p: ViewerProps, scale: number, ref: RefObject<HTMLDivElement | null>) {
  const { focusToken, activeChangeId, snap } = p;
  // reset scroll when switching snapshot (unless a focus request follows)
  const lastSnap = useRef(snap.id);
  useEffect(() => {
    if (!scale) return;
    const c = snap.changes.find((x) => x.id === activeChangeId);
    if (c && focusToken > 0) scrollToRect(ref.current, c.bbox ?? c.base_bbox, scale);
    else if (lastSnap.current !== snap.id) ref.current?.scrollTo({ top: 0, left: 0 });
    lastSnap.current = snap.id;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusToken, snap.id, scale > 0]);
}

function SinglePane(p: ViewerProps & { mode: ViewMode }) {
  const { snap, mode } = p;
  const ref = useRef<HTMLDivElement>(null);
  const scale = useScale(ref, snap.width, p.zoom);
  const [opacity, setOpacity] = useState(0.5);
  const [swipe, setSwipe] = useState(50);
  const [scrollLeft, setScrollLeft] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null) as RefObject<HTMLDivElement>;
  useFocus(p, scale, ref);

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const move = (ev: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      setSwipe(Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100)));
    };
    move(e.nativeEvent);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", () => window.removeEventListener("pointermove", move), { once: true });
  };

  const h = Math.max(snap.height, mode === "single" ? 0 : (snap.baseline_height ?? 0));
  const label = mode === "overlay" ? "Overlay" : mode === "swipe" ? null : p.newLabel;

  return (
    <div className="relative h-full min-h-0">
      {label && (
        <div className="pointer-events-none absolute left-3 top-2 z-20 rounded-md border border-accent-500/40 bg-zinc-900/85 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-accent-300 backdrop-blur">
          {label}
        </div>
      )}
      {mode === "overlay" && (
        <div className="absolute right-4 top-2 z-30 flex items-center gap-2.5 rounded-lg border border-zinc-700 bg-zinc-900/90 px-3 py-1.5 text-[11px] text-zinc-400 shadow-lg backdrop-blur" data-testid="overlay-opacity">
          <span>Baseline</span>
          <input type="range" min={0} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(+e.target.value / 100)} className="slider w-32" aria-label="New image opacity" />
          <span className="text-accent-300">New</span>
          <span className="w-8 text-right font-mono text-zinc-300">{Math.round(opacity * 100)}%</span>
        </div>
      )}
      {mode === "swipe" && (
        <>
          <div className="pointer-events-none absolute left-3 top-2 z-20 rounded-md border border-zinc-700 bg-zinc-900/85 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400 backdrop-blur">
            ← {p.baselineLabel}
          </div>
          <div className="pointer-events-none absolute right-4 top-2 z-20 rounded-md border border-accent-500/40 bg-zinc-900/85 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-accent-300 backdrop-blur">
            {p.newLabel} →
          </div>
        </>
      )}
      {mode === "swipe" && scale > 0 && (
        <button
          type="button"
          aria-label="Drag to compare"
          data-testid="swipe-handle"
          onPointerDown={startDrag}
          className="absolute top-1/2 z-30 flex size-9 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-accent-400 bg-zinc-950 text-accent-300 shadow-xl"
          style={{ left: PAD + (swipe / 100) * snap.width * scale - scrollLeft }}
        >
          <MoveHorizontal className="size-4" />
        </button>
      )}
      <div ref={ref} className="checker h-full overflow-auto" data-testid="pane-single" onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}>
        {scale > 0 && (
          <Stage w={snap.width} h={h} scale={scale} stageRef={stageRef}>
            {mode === "single" && (
              <>
                <Img src={snap.image_url} alt="New" />
                <Overlays {...p} scale={scale} space="new" />
              </>
            )}
            {mode === "overlay" && (
              <>
                <Img src={snap.baseline_image_url!} alt="Baseline" />
                <div className="absolute inset-0" style={{ opacity }}>
                  <Img src={snap.image_url} alt="New" />
                </div>
                <Overlays {...p} scale={scale} space="new" />
              </>
            )}
            {mode === "swipe" && (
              <>
                <Img src={snap.baseline_image_url!} alt="Baseline" />
                <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${swipe}%)` }}>
                  <div className="absolute inset-0 bg-white" style={{ height: snap.height * scale }} />
                  <Img src={snap.image_url} alt="New" />
                </div>
                <Overlays {...p} scale={scale} space="new" />
                <div className="absolute inset-y-0 z-20 w-3 -translate-x-1/2 cursor-ew-resize" style={{ left: `${swipe}%` }} onPointerDown={startDrag}>
                  <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-accent-400 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" />
                </div>
              </>
            )}
          </Stage>
        )}
      </div>
    </div>
  );
}

function Stage({ w, h, scale, children, stageRef }: { w: number; h: number; scale: number; children: ReactNode; stageRef?: RefObject<HTMLDivElement> }) {
  return (
    <div style={{ padding: PAD, paddingTop: PAD_TOP, width: w * scale + PAD * 2 }}>
      <div ref={stageRef} className="relative bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_30px_rgba(0,0,0,0.5)]" style={{ width: w * scale, height: h * scale }}>
        {children}
      </div>
    </div>
  );
}

function Img({ src, alt }: { src: string; alt: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  useEffect(() => setState("loading"), [src]);
  return (
    <>
      <img
        src={src}
        alt={alt}
        draggable={false}
        decoding="async"
        onLoad={() => setState("ok")}
        onError={() => setState("error")}
        className="absolute left-0 top-0 block h-auto w-full select-none"
      />
      {state === "loading" && (
        <div className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-zinc-900/80 p-2">
          <Loader2 className="size-4 animate-spin text-zinc-400" />
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-x-0 top-24 flex flex-col items-center gap-2 text-xs text-zinc-500">
          <ImageOff className="size-5" />
          Image failed to load
        </div>
      )}
    </>
  );
}

// ---------- overlays ----------

function box(r: Rect, scale: number) {
  const [x1, y1, x2, y2] = r;
  return { left: x1 * scale, top: y1 * scale, width: Math.max(2, (x2 - x1) * scale), height: Math.max(2, (y2 - y1) * scale) };
}

function Overlays(p: ViewerProps & { scale: number; space: "new" | "base" }) {
  const { snap, scale, space, showNoise, showPixel, activeChangeId, hoverChangeId } = p;
  const focusId = hoverChangeId ?? activeChangeId;
  const shift = snap.layout_shifts[0];

  return (
    <div className="pointer-events-none absolute inset-0">
      {/* pixel diff (naive) */}
      {showPixel && space === "new" && (
        <>
          {snap.pixel_diff.overlay_url && <img src={snap.pixel_diff.overlay_url} alt="" className="absolute left-0 top-0 w-full opacity-70" />}
          {snap.pixel_diff.regions.map((r, i) => (
            <div key={i} data-testid="pixel-region" className="absolute border border-red-500 bg-red-500/10" style={box(r, scale)} />
          ))}
        </>
      )}

      {/* noise */}
      {showNoise && !showPixel && space === "new" &&
        snap.noise_rects.map((r, i) => (
          <div key={i} data-testid="noise-rect" className="hatch absolute rounded-[2px] border-[1.5px] border-amber-400" style={box(r, scale)} title="Ignored: rendering noise / dynamic content" />
        ))}

      {/* layout shift guide */}
      {shift && !showPixel && (
        <div
          className="absolute inset-x-0 border-t border-dashed border-sky-400/70"
          style={{ top: (space === "base" ? shift.from_y : shift.from_y + shift.dy) * scale }}
        >
          <span className="absolute right-1 -top-4 rounded bg-sky-500/90 px-1 font-mono text-[9.5px] font-semibold text-white">
            {space === "base" ? `y=${shift.from_y}` : `${shift.dy > 0 ? "↓" : "↑"} ${Math.abs(shift.dy)}px`}
          </span>
        </div>
      )}

      {/* semantic changes */}
      {!showPixel &&
        snap.changes.map((c) => {
          let r = space === "new" ? c.bbox : c.base_bbox;
          let ghost = false;
          if (!r && space === "new" && c.base_bbox) {
            // removed element: show where it used to be
            r = c.base_bbox;
            ghost = true;
          }
          if (!r) return null;
          const n = p.changeNumber.get(c.id) ?? 0;
          const on = focusId === c.id;
          const dim = focusId !== null && !on;
          const removed = c.kind === "removed" || ghost;
          return (
            <div
              key={c.id}
              data-testid="change-box"
              data-change-id={c.id}
              className={cn(
                "pointer-events-auto absolute cursor-pointer rounded-[3px] transition-[opacity,box-shadow] duration-150",
                removed ? "border-2 border-dashed border-red-400" : "border-2 border-accent-400",
                on && (removed ? "bg-red-500/10 shadow-[0_0_0_4px_rgba(248,113,113,0.25)]" : "bg-accent-500/10 shadow-[0_0_0_4px_rgba(139,92,246,0.3)]"),
                dim && "opacity-40",
              )}
              style={{ ...box(r, scale), margin: -3, padding: 3, boxSizing: "content-box" }}
              onClick={() => p.onPickChange(c)}
              onMouseEnter={() => p.onHoverChange(c.id)}
              onMouseLeave={() => p.onHoverChange(null)}
              title={`${c.title}: ${c.detail}`}
            >
              <span
                className={cn(
                  "absolute -left-[2px] -top-[19px] flex h-4 min-w-4 items-center justify-center rounded-[3px] px-1 font-mono text-[10px] font-bold text-white",
                  removed ? "bg-red-500" : "bg-accent-500",
                )}
              >
                {n}
                {ghost && space === "new" && <span className="ml-1 font-sans font-semibold">gone</span>}
              </span>
            </div>
          );
        })}
    </div>
  );
}
