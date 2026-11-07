import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, Brain, Camera, Check, GitCompare, Layers, Minus, ShieldCheck, Sparkles, Tags, X } from "lucide-react";
import { useStartDemo } from "../components/Layout";
import data from "./landingData.json";

/* Sightline landing / demo-day page. A separate, light, presentation-first design (the app itself is dark).
   Every screenshot and box below is real output from a Sightline build of the demo shop (v1 → v2). */

type R = number[];
type Snap = (typeof data.snaps)["home"];
const S = data.snaps as unknown as Record<"home" | "product" | "cart-mobile", Snap>;
const IMG = (n: string) => `/landing/${n}.webp`;

// chart palette (validated: lightness, chroma, CVD separation, contrast on white)
const PIXEL = "#eb6834";
const OURS = "#7c3aed";

// ---------------------------------------------------------------- image primitives
type Box = { r: R; tone: "change" | "noise" | "removed" | "shift"; label?: ReactNode; labelPos?: "top" | "bottom" | "inside"; align?: "left" | "right" };

/** Shows the `crop` rect of an image (natural size w×h) at full container width, with boxes in image coordinates. */
function Shot({ src, w, h, crop, boxes = [], className = "", rounded = true }: { src: string; w: number; h: number; crop?: R; boxes?: Box[]; className?: string; rounded?: boolean }) {
  const [x0, y0, x1, y1] = crop ?? [0, 0, w, h];
  const cw = x1 - x0, ch = y1 - y0;
  return (
    <div className={`relative w-full overflow-hidden bg-white ${rounded ? "rounded-xl" : ""} ${className}`} style={{ aspectRatio: `${cw} / ${ch}` }}>
      <img src={src} alt="" draggable={false} className="absolute max-w-none select-none"
        style={{ width: `${(w / cw) * 100}%`, left: `${(-x0 / cw) * 100}%`, top: `${(-y0 / ch) * 100}%` }} />
      {boxes.map((b, i) => <BoxEl key={i} b={b} x0={x0} y0={y0} cw={cw} ch={ch} />)}
    </div>
  );
}

function BoxEl({ b, x0, y0, cw, ch }: { b: Box; x0: number; y0: number; cw: number; ch: number }) {
  const [a, c, d, e] = b.r;
  const style: CSSProperties = { left: `${((a - x0) / cw) * 100}%`, top: `${((c - y0) / ch) * 100}%`, width: `${((d - a) / cw) * 100}%`, height: `${((e - c) / ch) * 100}%` };
  const tone = {
    change: "border-[2.5px] border-violet-600 bg-violet-500/10 shadow-[0_0_0_4px_rgba(124,58,237,0.15)]",
    removed: "border-[2.5px] border-dashed border-violet-600 bg-violet-500/5",
    noise: "lp-hatch border-2 border-amber-400",
    shift: "border-2 border-sky-500 bg-sky-400/10",
  }[b.tone];
  const pos = b.labelPos ?? "top";
  return (
    <div className={`absolute rounded-[3px] ${tone}`} style={style}>
      {b.label && (
        <span className={`absolute ${b.align === "right" ? "right-[-2px]" : "left-[-2px]"} z-10 whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold leading-none text-white shadow-lg sm:text-[12px] ${b.tone === "noise" ? "bg-amber-500" : b.tone === "shift" ? "bg-sky-600" : "bg-violet-600"} ${pos === "top" ? "bottom-full mb-1.5" : pos === "bottom" ? "top-full mt-1.5" : "left-2 top-2"}`}>
          {b.label}
        </span>
      )}
    </div>
  );
}

function Browser({ children, url = "acme.shop", className = "" }: { children: ReactNode; url?: string; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_60px_-20px_rgba(24,24,27,0.25)] ${className}`}>
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" /><span className="size-2.5 rounded-full bg-[#febc2e]" /><span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 truncate rounded-md bg-white px-2 py-0.5 font-mono text-[11px] text-zinc-500 ring-1 ring-zinc-200">{url}</span>
      </div>
      {children}
    </div>
  );
}

function useInView<T extends Element>(threshold = 0.35) {
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

function CountUp({ to, decimals = 0, run, ms = 1100 }: { to: number; decimals?: number; run: boolean; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, run, ms]);
  return <>{v.toFixed(decimals)}</>;
}

// ---------------------------------------------------------------- hero: pixel diff vs Sightline on the real build
const home = S.home;
const HERO_CROP = [0, 0, 1280, 820];
const heroBoxes: Box[] = [
  { r: home.changes[1].bbox as R, tone: "change", label: "Banner added", labelPos: "bottom" },
  { r: home.changes[0].bbox as R, tone: "change", label: "Button background #4c6ef5 → #d9480f" },
  ...home.noise.filter((n) => n[1] < 820).map((n) => ({ r: n, tone: "noise" as const })),
];

function HeroCompare() {
  const [mode, setMode] = useState<"pixel" | "ours">("pixel");
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setMode((m) => (m === "pixel" ? "ours" : "pixel")), 3200);
    return () => clearInterval(t);
  }, [auto]);
  const pick = (m: "pixel" | "ours") => { setAuto(false); setMode(m); };
  const pixel = mode === "pixel";
  return (
    <div className="relative">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="inline-flex rounded-full bg-zinc-100 p-1 ring-1 ring-zinc-200" role="tablist">
          {(["pixel", "ours"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => pick(m)} data-testid={`hero-mode-${m}`}
              className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${mode === m ? (m === "pixel" ? "bg-[#eb6834] text-white shadow" : "bg-violet-600 text-white shadow") : "text-zinc-500 hover:text-zinc-800"}`}>
              {m === "pixel" ? "Plain pixel diff" : "Sightline"}
            </button>
          ))}
        </div>
        <div className="text-right">
          <div className={`text-3xl font-bold tabular-nums tracking-tight transition-colors sm:text-4xl ${pixel ? "text-[#c2410c]" : "text-violet-700"}`}>
            {pixel ? data.counts.pixel_regions : data.counts.groups}
          </div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{pixel ? "red regions to check" : "named changes to review"}</div>
        </div>
      </div>
      <Browser url="acme.shop · build #2 vs baseline">
        <div className="relative">
          <div className={`transition-opacity duration-500 ${pixel ? "opacity-100" : "opacity-0"}`}>
            <Shot src={IMG("home-pixel")} w={home.w} h={home.h} crop={HERO_CROP} rounded={false} />
          </div>
          <div className={`absolute inset-0 transition-opacity duration-500 ${pixel ? "opacity-0" : "opacity-100"}`}>
            <Shot src={IMG("home-new")} w={home.w} h={home.h} crop={HERO_CROP} boxes={heroBoxes} rounded={false} />
          </div>
        </div>
      </Browser>
      <p className="mt-3 text-center text-[13px] text-zinc-500">
        {pixel ? "Same build. A banner pushed the page down 46px, so every pixel below it counts as changed." : "35 elements moved together: one layout shift, explained by the banner. Clock, counters and quotes are learned as noise (amber)."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- sections
function Section({ id, eyebrow, title, sub, children, className = "" }: { id?: string; eyebrow: string; title: ReactNode; sub?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24 ${className}`}>
      <div className="mx-auto mb-12 max-w-3xl text-center">
        <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.18em] text-violet-600">{eyebrow}</div>
        <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-[44px] sm:leading-[1.1]">{title}</h2>
        {sub && <p className="mt-4 text-[17px] leading-relaxed text-zinc-600">{sub}</p>}
      </div>
      {children}
    </section>
  );
}

function Problem() {
  const items = [
    { k: "1 banner", t: "turns the whole page red", d: "Everything below it moves, so every pixel below it \"changed\"." },
    { k: "Live content", t: "fails every build", d: "Clocks, counters, carousels, ads and A/B slots differ on every load." },
    { k: "81 regions", t: "for 5 real bugs", d: "So teams stop reading the diff and approve it. Bugs ship anyway." },
    { k: "$149–399", t: "a month for this", d: "Chromatic's paid plans, listed price. Percy's AI review is paid-only." },
  ];
  return (
    <Section id="problem" eyebrow="The problem" title={<>Pixel diffs flag <span className="text-[#c2410c]">everything</span> that moves</>}
      sub="Percy, Chromatic and Applitools screenshot your site on every build and compare it with the approved version. Comparing pixels is the weak part.">
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="relative">
          <Browser url="pixel diff · home page">
            <Shot src={IMG("home-pixel")} w={home.w} h={home.h} crop={[0, 0, 1280, 1000]} rounded={false} />
          </Browser>
          <div className="absolute -right-3 -top-4 rotate-3 rounded-xl bg-[#eb6834] px-4 py-2 text-white shadow-xl">
            <div className="text-2xl font-bold leading-none">{home.pixel_regions.length}</div>
            <div className="text-[11px] font-semibold uppercase tracking-wide">red regions, 1 page</div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((it) => (
            <div key={it.k} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="text-2xl font-bold tracking-tight text-zinc-900">{it.k}</div>
              <div className="text-[15px] font-semibold text-[#c2410c]">{it.t}</div>
              <p className="mt-2 text-[14px] leading-relaxed text-zinc-600">{it.d}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function StepCard({ n, icon, title, children, art }: { n: number; icon: ReactNode; title: string; children: ReactNode; art: ReactNode }) {
  return (
    <div className="relative flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex h-28 items-center justify-center rounded-xl bg-zinc-50 ring-1 ring-zinc-100">{art}</div>
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-violet-600 text-[13px] font-bold text-white">{n}</span>
        <span className="text-violet-600">{icon}</span>
        <h3 className="text-[16px] font-bold text-zinc-900">{title}</h3>
      </div>
      <p className="mt-2 text-[14px] leading-relaxed text-zinc-600">{children}</p>
    </div>
  );
}

function HowItWorks() {
  return (
    <Section id="how" eyebrow="How it works" title="It reads the page, not just the pixels"
      sub="Every page load produces a screenshot and a snapshot of every visible element. Sightline compares elements, then uses pixels only to confirm.">
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StepCard n={1} icon={<Camera className="size-4" />} title="Capture" art={
          <div className="flex items-center gap-3">
            <div className="h-20 w-16 rounded-md border border-zinc-300 bg-white p-1.5"><div className="h-2 rounded bg-violet-300" /><div className="mt-1.5 h-6 rounded bg-zinc-200" /><div className="mt-1.5 h-1.5 w-8 rounded bg-zinc-300" /><div className="mt-1 h-1.5 w-10 rounded bg-zinc-300" /></div>
            <div className="space-y-1 font-mono text-[9px] leading-none text-zinc-500"><div>&lt;header&gt;</div><div className="pl-2">&lt;a.btn&gt;</div><div className="pl-2">&lt;img&gt;</div><div>&lt;footer&gt;</div></div>
          </div>}>
          Real Chromium, animations frozen, fonts and lazy images loaded. A full-page screenshot plus every element's position, text and style.
        </StepCard>
        <StepCard n={2} icon={<Brain className="size-4" />} title="Learn noise" art={
          <div className="flex flex-col items-center gap-1.5 font-mono text-[11px]">
            {["13:29:34", "13:29:36", "13:29:39"].map((t, i) => (
              <div key={t} className="flex items-center gap-2"><span className="text-zinc-400">load {i + 1}</span><span className="lp-hatch rounded border border-amber-400 px-1.5 text-amber-800">{t}</span></div>
            ))}
          </div>}>
          Each page loads 2–3 times. Anything that differs between loads (clocks, counters, ads, carousels) is learned as noise. No ignore boxes to draw.
        </StepCard>
        <StepCard n={3} icon={<GitCompare className="size-4" />} title="Match" art={
          <svg viewBox="0 0 160 90" className="h-24 w-40" aria-hidden>
            {[18, 45, 72].map((y, i) => (
              <g key={y}>
                <rect x="6" y={y - 8} width="44" height="16" rx="4" fill="#ede9fe" stroke="#a78bfa" />
                <rect x="110" y={(i === 1 ? 72 : i === 2 ? 45 : 18) - 8} width="44" height="16" rx="4" fill="#ede9fe" stroke="#a78bfa" />
                <path d={`M50 ${y} C 80 ${y}, 80 ${i === 1 ? 72 : i === 2 ? 45 : 18}, 110 ${i === 1 ? 72 : i === 2 ? 45 : 18}`} fill="none" stroke="#7c3aed" strokeWidth="1.5" />
              </g>
            ))}
          </svg>}>
          Elements from the baseline and the new build are paired by structure and content, even when classes are renamed or content reorders.
        </StepCard>
        <StepCard n={4} icon={<Tags className="size-4" />} title="Classify" art={
          <div className="flex max-w-[150px] flex-wrap justify-center gap-1">
            {["text", "style", "image", "moved", "added", "removed", "resized"].map((k) => (
              <span key={k} className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">{k}</span>
            ))}
          </div>}>
          Each pair is checked for what changed and named in plain words: "Button background #4c6ef5 → #d9480f". A move caused by something upstream counts once.
        </StepCard>
        <StepCard n={5} icon={<Layers className="size-4" />} title="Group" art={
          <div className="relative h-16 w-24">
            {[0, 1, 2, 3].map((i) => <div key={i} className="absolute h-12 w-16 rounded-md border border-zinc-300 bg-white shadow-sm" style={{ left: i * 8, top: i * 4 }} />)}
            <span className="absolute -right-2 -top-1 rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-bold text-white">×8</span>
          </div>}>
          The same change on 4 pages × 2 screen sizes becomes one item to review. Approve it, and those snapshots become the new baseline.
        </StepCard>
      </div>
    </Section>
  );
}

function Feature({ title, kicker, children, visual, flip }: { title: string; kicker: string; children: ReactNode; visual: ReactNode; flip?: boolean }) {
  return (
    <div className={`grid items-center gap-8 py-12 lg:gap-12 ${flip ? "lg:grid-cols-[1fr_1.5fr] lg:[&>*:first-child]:order-2" : "lg:grid-cols-[1.5fr_1fr]"}`}>
      <div>{visual}</div>
      <div>
        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.16em] text-violet-600">{kicker}</div>
        <h3 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">{title}</h3>
        <div className="mt-4 space-y-3 text-[16px] leading-relaxed text-zinc-600">{children}</div>
      </div>
    </div>
  );
}

function Pair({ before, after, labels = ["Baseline · v1", "New build · v2"] }: { before: ReactNode; after: ReactNode; labels?: [string, string] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[before, after].map((v, i) => (
        <div key={i}>
          <div className={`mb-1.5 text-[11px] font-bold uppercase tracking-wider ${i ? "text-violet-600" : "text-zinc-500"}`}>{labels[i]}</div>
          <div className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm">{v}</div>
        </div>
      ))}
    </div>
  );
}

function Features() {
  const product = S.product, cart = S["cart-mobile"];
  const imgMissing = product.changes.find((c) => c.kind === "removed")!.base_bbox as R;
  const moved = cart.changes.find((c) => c.kind === "moved")!;
  const shift = home.shifts[0];
  return (
    <Section id="features" eyebrow="What you get" title="Real changes, named and grouped"
      sub="These are actual results from the demo shop, v1 against v2, with five planted bugs and live noise on every page.">
      <Feature kicker="Layout shifts" title="One banner is one change, not 35"
        visual={<Pair
          before={<Shot src={IMG("home-base")} w={home.bw} h={home.bh} crop={[0, 0, 1280, 640]} rounded={false} boxes={[{ r: [104, 459, 269, 503], tone: "shift" }]} />}
          after={<Shot src={IMG("home-new")} w={home.w} h={home.h} crop={[0, 0, 1280, 640]} rounded={false} boxes={[{ r: home.changes[1].bbox as R, tone: "change", label: "Banner added", labelPos: "bottom" }, { r: home.changes[0].bbox as R, tone: "shift", label: `↓ ${shift.dy}px`, labelPos: "bottom" }]} />}
        />}>
        <p>A promo banner pushed the page down {shift.dy}px. A pixel diff marks all {shift.elements} elements below it as changed.</p>
        <p>Sightline sees that they all moved by the same amount, and that the banner explains it. You review <b className="text-zinc-900">1 change</b>, with a note: "{shift.elements} elements shifted, caused by Banner added".</p>
      </Feature>
      <Feature flip kicker="Missing content" title="A missing product photo, caught and named"
        visual={<Pair
          before={<Shot src={IMG("product-base")} w={product.bw} h={product.bh} crop={[60, 70, 1240, 700]} rounded={false} boxes={[{ r: imgMissing, tone: "removed", label: "Product photo", labelPos: "inside" }]} />}
          after={<Shot src={IMG("product-new")} w={product.w} h={product.h} crop={[60, 70, 1240, 700]} rounded={false} boxes={[{ r: imgMissing, tone: "removed", label: "Image missing", labelPos: "inside" }]} />}
        />}>
        <p>A broken asset path made the product photo vanish, and the page got shorter. A pixel diff reports a blob of changed pixels and everything below it.</p>
        <p>Sightline reports <b className="text-zinc-900">"Image missing"</b> at the exact spot, and explains the content that moved up as a consequence.</p>
      </Feature>
      <Feature kicker="Bugs nobody planted" title="It found a real mobile bug we didn't plant"
        visual={<div className="mx-auto grid max-w-md grid-cols-2 gap-3">
          {(["base", "new"] as const).map((k) => (
            <div key={k}>
              <div className={`mb-1.5 text-[11px] font-bold uppercase tracking-wider ${k === "new" ? "text-violet-600" : "text-zinc-500"}`}>{k === "base" ? "Baseline · 390px" : "New build · 390px"}</div>
              <div className="overflow-hidden rounded-[22px] border-4 border-zinc-900 bg-zinc-900 shadow-lg">
                <Shot src={IMG(`cart-mobile-${k}`)} w={k === "base" ? cart.bw : cart.w} h={k === "base" ? cart.bh : cart.h} crop={[0, 0, k === "base" ? cart.bw : cart.w, 620]} rounded={false}
                  boxes={k === "new" ? [{ r: moved.bbox as R, tone: "change", label: "Moved 36px →", align: "right" }, { r: [500, 0, 517, 620], tone: "change" }] : [{ r: moved.base_bbox as R, tone: "shift" }]} />
              </div>
            </div>
          ))}
        </div>}>
        <p>We nudged the checkout button 36px right as a planted bug. On a phone, that pushed it past the edge of the screen.</p>
        <p>Sightline flagged both: <b className="text-zinc-900">"Button moved 36px right"</b> and <b className="text-zinc-900">"Page width changed 506px → 517px, content overflows"</b>. The second one we didn't plant.</p>
      </Feature>
      <Feature flip kicker="Noise learning" title="Clocks, counters and carousels are ignored automatically"
        visual={<Browser url="what Sightline ignored on this page">
          <Shot src={IMG("home-new")} w={home.w} h={home.h} crop={[0, 46, 1280, 1460]} rounded={false}
            boxes={home.noise.map((n, i): Box => ({ r: n, tone: "noise", ...([
              { label: "Rotating quote", labelPos: "top" }, {}, { label: "Random counter", labelPos: "bottom" },
              {}, { label: "Live clock + avatar", labelPos: "bottom", align: "right" },
            ] as Partial<Box>[])[i] }))} />
        </Browser>}>
        <p>Every page loads more than once. Whatever differs between loads (the clock, "37 people viewing", the rotating testimonial, a random avatar color) is marked as noise and skipped.</p>
        <p>Rebuilding the demo against itself: plain pixel diff finds <b className="text-zinc-900">24 regions</b>. Sightline finds <b className="text-zinc-900">0</b>. Same for theverge.com: 13 vs 0.</p>
      </Feature>
    </Section>
  );
}

// ---------------------------------------------------------------- charts (validated palette, hover tooltips, direct labels)
function HBar({ label, value, max, color, fmt, note }: { label: string; value: number; max: number; color: string; fmt: (v: number) => string; note: string }) {
  const [hover, setHover] = useState(false);
  return (
    <div className="relative grid grid-cols-[110px_1fr] items-center gap-3 py-1.5" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="truncate text-right text-[13px] text-zinc-600">{label}</div>
      <div className="relative flex h-6 items-center">
        <div className="h-[22px] rounded-r-[4px] transition-[width] duration-700" style={{ width: `${Math.max(1.5, (value / max) * 100)}%`, background: color, opacity: hover ? 1 : 0.92 }} />
        <span className="ml-2 text-[13px] font-semibold tabular-nums text-zinc-900">{fmt(value)}</span>
        {hover && (
          <div className="absolute bottom-full left-0 z-20 mb-1 whitespace-nowrap rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[12px] text-white shadow-lg">
            <b>{label}: {fmt(value)}</b> · {note}
          </div>
        )}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-4 text-[13px] text-zinc-600">
      <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: PIXEL }} />Plain pixel diff</span>
      <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: OURS }} />Sightline</span>
    </div>
  );
}

const BY_TYPE: [string, number, number][] = [
  ["Banner", 100, 14], ["Font size", 100, 12], ["Text color", 93, 14], ["Text change", 93, 14], ["Hidden image", 90, 10],
  ["Removed", 86, 14], ["Moved", 83, 12], ["Background", 77, 13], ["Spacing", 58, 12],
];

function Results() {
  const [ref, seen] = useInView<HTMLDivElement>();
  const v = (x: number) => (seen ? x : 0);
  return (
    <Section id="results" eyebrow="Measured" title="Tested on 15 live websites"
      sub="We planted 115 bugs, 9 kinds, into real sites (Stripe, Vercel, Linear, GitHub, MDN, BBC, The Verge, Airbnb, Shopify, Figma, Tailwind, python.org, HN, Wikipedia, Python docs) and checked whether each tool pointed at the right spot.">
      <div ref={ref} className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { n: 87, s: "%", l: "of planted bugs found at the right spot", d: 0 },
          { n: 82, s: "%", l: "less to review than a pixel diff", d: 0 },
          { n: 79, s: "%", l: "of unchanged pages perfectly clean (pixel diff: 64%)", d: 0 },
          { n: 4.6, s: "s", l: "to check 8 screenshots of the demo", d: 1 },
        ].map((k) => (
          <div key={k.l} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-4xl font-bold tracking-tight text-violet-700 sm:text-5xl"><CountUp to={k.n} decimals={k.d} run={seen} />{k.s}</div>
            <div className="mt-2 text-[14px] leading-snug text-zinc-600">{k.l}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-1 text-[16px] font-bold text-zinc-900">Things to review per page</div>
          <div className="mb-4 text-[13px] text-zinc-500">Average items a person has to look at. Fewer is better.</div>
          <Legend />
          <div className="mt-4 text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Page with one planted bug · 115 cases</div>
          <HBar label="Pixel diff" value={v(43.6)} max={45} color={PIXEL} fmt={(x) => x.toFixed(1)} note="40.1 of them aren't the bug" />
          <HBar label="Sightline" value={v(8.0)} max={45} color={OURS} fmt={(x) => x.toFixed(1)} note="the bug plus related changes" />
          <div className="mt-4 text-[12px] font-semibold uppercase tracking-wider text-zinc-500">Page with no change · 14 controls</div>
          <HBar label="Pixel diff" value={v(5.7)} max={45} color={PIXEL} fmt={(x) => x.toFixed(1)} note="all false alarms" />
          <HBar label="Sightline" value={v(1.7)} max={45} color={OURS} fmt={(x) => x.toFixed(1)} note="all false alarms" />
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-1 text-[16px] font-bold text-zinc-900">Bugs found, by kind</div>
          <div className="mb-4 text-[13px] text-zinc-500">Share of planted bugs Sightline reported at the right spot.</div>
          {BY_TYPE.map(([l, p, n]) => <HBar key={l} label={l} value={v(p)} max={100} color={OURS} fmt={(x) => `${Math.round(x)}%`} note={`${n} cases`} />)}
          <p className="mt-3 text-[12px] text-zinc-500">Spacing is the weak spot: a pushed-down section is sometimes explained away as a layout shift.</p>
        </div>
      </div>
    </Section>
  );
}

type Cell = { v: "yes" | "no" | "part"; t: string };
const ROWS: [string, Cell, Cell, Cell][] = [
  ["What you review", { v: "yes", t: "Named changes: \"Button background #4c6ef5 → #d9480f\"" }, { v: "part", t: "Highlighted pixel diff; AI review agent on paid plans" }, { v: "no", t: "Highlighted pixel diff" }],
  ["A banner pushes the page down", { v: "yes", t: "1 change + a layout-shift note" }, { v: "no", t: "Everything below it flagged" }, { v: "no", t: "Everything below it flagged" }],
  ["Clocks, counters, carousels", { v: "yes", t: "Learned automatically from repeated loads" }, { v: "part", t: "Hide with CSS; AI review agent on paid plans" }, { v: "part", t: "Mark elements to ignore" }],
  ["Browsers", { v: "part", t: "Chromium today" }, { v: "yes", t: "Chrome, Firefox, Safari, Edge" }, { v: "yes", t: "Chrome, Firefox, Safari, Edge" }],
  ["Pull-request checks", { v: "part", t: "In progress" }, { v: "yes", t: "Yes" }, { v: "yes", t: "Yes" }],
  ["Price", { v: "yes", t: "Free, self-hosted" }, { v: "part", t: "Free tier, then paid plans" }, { v: "part", t: "Free 5k snapshots, then ~$149–399/mo" }],
];

function Mark({ v }: { v: Cell["v"] }) {
  if (v === "yes") return <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white"><Check className="size-3" strokeWidth={3} /></span>;
  if (v === "no") return <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-500"><X className="size-3" strokeWidth={3} /></span>;
  return <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><Minus className="size-3" strokeWidth={3} /></span>;
}

function Compare() {
  return (
    <Section id="compare" eyebrow="Versus the subscriptions" title="What changes if you switch"
      sub="An honest comparison. We beat the pixel-diff approach these tools are built on; they still win on browsers and integrations.">
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-[14px]">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-[13px]">
              <th className="px-5 py-3 font-semibold text-zinc-500" />
              <th className="px-5 py-3 font-bold text-violet-700">Sightline</th>
              <th className="px-5 py-3 font-semibold text-zinc-700">Percy</th>
              <th className="px-5 py-3 font-semibold text-zinc-700">Chromatic</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([label, ...cells]) => (
              <tr key={label} className="border-b border-zinc-100 last:border-0">
                <td className="px-5 py-3.5 font-semibold text-zinc-900">{label}</td>
                {cells.map((c, i) => (
                  <td key={i} className={`px-5 py-3.5 ${i === 0 ? "bg-violet-50/60" : ""}`}>
                    <div className="flex items-start gap-2"><Mark v={c.v} /><span className="text-zinc-700">{c.t}</span></div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-center text-[12px] text-zinc-500">Prices are list prices from public pricing pages and may vary by plan.</p>
    </Section>
  );
}

function Verified() {
  return (
    <section className="mx-auto max-w-6xl px-5 sm:px-8">
      <div className="grid items-center gap-6 rounded-3xl bg-zinc-900 p-8 text-white sm:p-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1 text-[12px] font-bold uppercase tracking-wider text-emerald-300"><ShieldCheck className="size-4" />Verified by Seldon</div>
          <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">An AI QA agent tested both core workflows, on the final build.</h3>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">Seldon's agent drove a real browser through Sightline, judged each workflow against a plain-English goal, and passed both. Twice.</p>
        </div>
        <div className="space-y-3">
          {["A demo build catches the planted regressions", "Approving a build makes it the new baseline"].map((t) => (
            <div key={t} className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
              <span className="rounded-md bg-emerald-400 px-2 py-0.5 text-[11px] font-bold text-emerald-950">PASS</span>
              <span className="text-[14px] text-zinc-200">{t}</span>
            </div>
          ))}
          <div className="text-right text-[13px] font-semibold text-zinc-400">2 / 2 passed · 100%</div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- page
export function LandingPage() {
  const { start, busy } = useStartDemo();
  useEffect(() => {
    document.title = "Sightline · visual testing that tells you what changed";
    return () => { document.title = "Sightline"; };
  }, []);
  const demoBtn = (big = false, testid = "try-demo") => (
    <button onClick={start} disabled={busy} data-testid={testid}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-violet-600 font-semibold text-white shadow-[0_8px_24px_-6px_rgba(124,58,237,0.6)] transition hover:bg-violet-700 disabled:opacity-60 ${big ? "h-12 px-7 text-[16px]" : "h-9 px-4 text-[14px]"}`}>
      <Sparkles className={big ? "size-4" : "size-3.5"} />{busy ? "Starting…" : "Try the demo"}
    </button>
  );
  return (
    <div className="lp h-full overflow-y-auto bg-[#fbfaf8] text-zinc-900" style={{ colorScheme: "light" }}>
      <header className="sticky top-0 z-50 border-b border-zinc-200/70 bg-[#fbfaf8]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5 sm:px-8">
          <a href="#top" className="flex items-center gap-2 text-[16px] font-bold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-lg bg-violet-600 text-white"><svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg></span>
            Sightline
          </a>
          <nav className="hidden items-center gap-5 text-[14px] text-zinc-600 md:flex">
            <a href="#problem" className="hover:text-zinc-900">Problem</a>
            <a href="#how" className="hover:text-zinc-900">How it works</a>
            <a href="#results" className="hover:text-zinc-900">Results</a>
            <a href="#compare" className="hover:text-zinc-900">vs Percy</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/projects" className="hidden h-9 items-center rounded-full px-4 text-[14px] font-semibold text-zinc-700 hover:bg-zinc-100 sm:inline-flex" data-testid="open-app">Open app</Link>
            {demoBtn(false, "try-demo-nav")}
          </div>
        </div>
      </header>

      <section id="top" className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 -top-40 h-[520px] bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.18),transparent_65%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-14 sm:px-8 lg:grid-cols-[1fr_1.15fr] lg:pt-20">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1 text-[12px] font-semibold text-violet-700">
              Replaces Percy · Chromatic · Applitools
            </div>
            <h1 className="text-[42px] font-bold leading-[1.04] tracking-tight text-zinc-900 sm:text-[60px]">
              Visual testing that tells you <span className="text-violet-600">what changed</span>, not which pixels.
            </h1>
            <p className="mt-5 max-w-xl text-[18px] leading-relaxed text-zinc-600">
              Sightline screenshots every page on every build and compares the page elements, not just the pixels. You get "Button background changed" instead of a page full of red.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {demoBtn(true)}
              <a href="#problem" className="inline-flex h-12 items-center gap-2 rounded-full px-5 text-[15px] font-semibold text-zinc-700 hover:bg-zinc-100">See how <ArrowDown className="size-4" /></a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-zinc-500">
              <span><b className="text-zinc-900">87%</b> of planted bugs found</span>
              <span><b className="text-zinc-900">82%</b> less to review</span>
              <span><b className="text-zinc-900">$0</b>, self-hosted</span>
            </div>
          </div>
          <HeroCompare />
        </div>
      </section>

      <div className="border-y border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-5 py-5 text-[13px] font-semibold text-zinc-400 sm:px-8">
          <span className="text-zinc-500">Tested on</span>
          {["Stripe", "Vercel", "Linear", "GitHub", "Airbnb", "Shopify", "Figma", "BBC", "The Verge", "Wikipedia"].map((s) => <span key={s}>{s}</span>)}
        </div>
      </div>

      <Problem />
      <div className="bg-white"><HowItWorks /></div>
      <Features />
      <div className="bg-white"><Results /></div>
      <Compare />
      <Verified />

      <section className="mx-auto max-w-6xl px-5 py-24 text-center sm:px-8">
        <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">Stop paying to approve red pixels.</h2>
        <p className="mx-auto mt-4 max-w-xl text-[17px] text-zinc-600">Open the demo shop, run a build with five planted bugs, and review what Sightline found. It takes about ten seconds.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {demoBtn(true, "try-demo-footer")}
          <Link to="/projects" className="inline-flex h-12 items-center gap-2 rounded-full border border-zinc-300 bg-white px-6 text-[15px] font-semibold text-zinc-800 hover:bg-zinc-50">Open the app <ArrowRight className="size-4" /></Link>
        </div>
      </section>

      <footer className="border-t border-zinc-200 py-8 text-center text-[13px] text-zinc-500">
        Built in a day at Ship Happens, a Seldon hackathon · FastAPI, Playwright, NumPy, React
      </footer>
    </div>
  );
}
