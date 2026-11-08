import { useEffect, useMemo, useState } from "react";
import { Frame, Section, SectionHead, Ticker, useInView, useReducedMotion } from "./kit";

/* A mock product page (the "new build") shown twice: once under a plain pixel diff (80 red regions),
   once under Deja View, where the same 80 regions collapse into the 3 changes that actually happened. */

type Rect = [number, number, number, number]; // x0, y0, x1, y1 in % of the stage
const TARGETS: { r: Rect; label: string; pos: "inside" | "above-right" | "below-right" }[] = [
  { r: [5, 14, 45, 66], label: "Product photo missing", pos: "inside" },
  { r: [51, 48, 79, 56], label: "Add to cart button turned orange", pos: "above-right" },
  { r: [51, 59, 73, 65.5], label: "Cart button moved 36px", pos: "below-right" },
];

function makeBoxes(n: number) {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: { r: Rect; t: number }[] = [];
  for (let i = 0; i < n; i++) {
    // a third of the regions pile up around the real changes, the rest is shift and live-content noise
    let cx: number, cy: number;
    if (i % 3 === 0) {
      const t = TARGETS[i % 2 ? 1 : (i / 3) % 3 | 0].r;
      cx = t[0] + rnd() * (t[2] - t[0]);
      cy = t[1] + rnd() * (t[3] - t[1]);
    } else {
      cx = 3 + rnd() * 94;
      cy = 2 + rnd() * 94;
    }
    const w = 2 + rnd() * 9, h = 1.5 + rnd() * 6;
    const r: Rect = [Math.max(0.5, cx - w / 2), Math.max(0.5, cy - h / 2), Math.min(99.5, cx + w / 2), Math.min(99.5, cy + h / 2)];
    let best = 0, bd = Infinity;
    TARGETS.forEach((T, k) => {
      const d = Math.hypot((T.r[0] + T.r[2]) / 2 - cx, ((T.r[1] + T.r[3]) / 2 - cy) * 0.8);
      if (d < bd) { bd = d; best = k; }
    });
    out.push({ r, t: best });
  }
  return out;
}

const pct = (r: Rect) => ({ left: `${r[0]}%`, top: `${r[1]}%`, width: `${r[2] - r[0]}%`, height: `${r[3] - r[1]}%` });

/** The mock store page. Purely decorative blocks. */
function MockStore({ ghost = false }: { ghost?: boolean }) {
  const blk = "absolute bg-[#d9d4c8]";
  return (
    <div className="absolute inset-0 bg-[#fdfcf9]">
      {/* nav */}
      <div className="absolute inset-x-0 top-0 h-[9%] border-b border-[#e3dfd5] bg-[#f6f4ee]" />
      <div className={blk} style={pct([4, 3, 15, 6])} />
      {[40, 48, 56, 64].map((x) => <div key={x} className="absolute bg-[#cfc9bc]" style={pct([x, 4, x + 6, 5.4])} />)}
      <div className="absolute border border-[#bdb7aa]" style={pct([79, 2.6, 93, 6.6])}>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[7px] text-[#6f6b62] sm:text-[9px]">17h 03m</span>
      </div>
      {/* photo slot, now empty */}
      <div className="absolute border border-dashed border-[#a8a296] bg-[#f3f0e8]" style={pct([5, 14, 45, 66])}>
        <div className="dv-dots-sparse absolute inset-0 text-[#cfc9bc]" />
      </div>
      {/* text */}
      <div className="absolute bg-[#2a2926]" style={pct([51, 15, 92, 19.5])} />
      <div className="absolute bg-[#8c887e]" style={pct([51, 22, 80, 25])} />
      <div className="absolute bg-[#cfc9bc]" style={pct([51, 28, 66, 30.5])} />
      <div className="absolute bg-[#0d0d0c]" style={pct([51, 35, 66, 42])} />
      {/* add to cart, now orange */}
      <div className="absolute flex items-center justify-center bg-[#f08c1a]" style={pct([51, 48, 79, 56])}>
        <span className="text-[7px] font-semibold text-white sm:text-[10px]">Add to cart</span>
      </div>
      {/* view cart, moved right; ghost shows where it used to be */}
      {ghost && <div className="absolute border border-dotted border-[#8c887e]" style={pct([51, 59, 68.5, 65.5])} />}
      <div className="absolute flex items-center justify-center border border-[#2a2926]" style={pct([55.5, 59, 73, 65.5])}>
        <span className="text-[7px] text-[#2a2926] sm:text-[10px]">View cart</span>
      </div>
      {/* related products */}
      {[5, 28, 51, 74].map((x, i) => (
        <div key={x} className="absolute bg-[#f3f0e8]" style={pct([x, 73, x + 21, 95])}>
          <div className="absolute inset-x-[8%] top-[10%] h-[48%] bg-[#e3dfd5]" />
          <div className="absolute inset-x-[8%] top-[66%] h-[9%] bg-[#bdb7aa]" />
          <div className="absolute left-[8%] top-[80%] h-[9%] bg-[#8c887e]" style={{ width: `${30 + i * 9}%` }} />
        </div>
      ))}
    </div>
  );
}

type Phase = "noisy" | "collapse" | "clean";

export function Problem() {
  const reduce = useReducedMotion();
  const [ref, seen] = useInView<HTMLDivElement>(0.35);
  const boxes = useMemo(() => makeBoxes(80), []);
  const [phase, setPhase] = useState<Phase>("noisy");
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (reduce) { setPhase("clean"); return; }
    if (!seen) return;
    setPhase("noisy");
    const a = setTimeout(() => setPhase("collapse"), 1500);
    const b = setTimeout(() => setPhase("clean"), 2600);
    const c = setTimeout(() => setCycle((n) => n + 1), 8200);
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c); };
  }, [seen, reduce, cycle]);

  const collapsed = phase !== "noisy";

  return (
    <Section id="problem">
      <SectionHead index="01" label="The problem"
        title={<>Pixel diff: <span className="text-[var(--dv-hot-ink)]"><span className="dv-num">80</span> boxes.</span><br />Deja View: <span className="dv-num">3</span> answers.</>}
        sub="Same pull request. Same page." />

      <div ref={ref} className="grid gap-5 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex items-end justify-between">
            <div className="dv-silk text-[13px] text-[var(--dv-hot-ink)]">Plain pixel diff</div>
            <div className="text-right">
              <div className="dv-num text-[44px] leading-none text-[var(--dv-hot-ink)]">80</div>
              <div className="dv-silk text-[10px] text-[var(--dv-mute)]">regions to check</div>
            </div>
          </div>
          <Frame title="product page · build #2 vs baseline">
            <div className="relative w-full" style={{ aspectRatio: "16 / 11" }} aria-label="Mock product page covered in 80 red pixel-diff regions" role="img">
              <MockStore />
              {boxes.map((b, i) => <div key={i} className="dv-box" style={pct(b.r)} />)}
            </div>
          </Frame>
        </div>

        <div>
          <div className="mb-3 flex items-end justify-between">
            <div className="dv-silk text-[13px] text-[var(--dv-ink)]">Deja View</div>
            <div className="text-right">
              <div className="dv-num text-[44px] leading-none text-[var(--dv-ink)]">
                {phase === "noisy" ? 80 : phase === "collapse" ? <Ticker key={cycle} from={80} to={3} run ms={900} steps={10} /> : 3}
              </div>
              <div className="dv-silk text-[10px] text-[var(--dv-mute)]">changes, named</div>
            </div>
          </div>
          <Frame title="deja view · same build">
            <div className="relative w-full" style={{ aspectRatio: "16 / 11" }} role="img"
              aria-label="The same page with three labelled changes: product photo missing, add to cart button turned orange, cart button moved 36px">
              <MockStore ghost />
              {boxes.map((b, i) => (
                <div key={i} className="dv-box"
                  style={{
                    ...pct(collapsed ? TARGETS[b.t].r : b.r),
                    opacity: phase === "clean" ? 0 : 1,
                    transitionDuration: phase === "noisy" ? "0ms" : phase === "collapse" ? "760ms" : "240ms",
                    transitionDelay: phase === "collapse" ? `${(i % 12) * 22}ms` : "0ms",
                  }} />
              ))}
              {TARGETS.map((t, k) => (
                <div key={k} className="dv-callout" style={{ ...pct(t.r), opacity: phase === "clean" ? 1 : 0 }}>
                  <span className={`absolute flex items-center gap-1.5 whitespace-nowrap bg-[var(--dv-lime)] py-[3px] pl-[3px] pr-2 text-[10px] font-semibold leading-none text-[#0b0b0a] ring-1 ring-[#0d0d0c] sm:text-[12.5px]
                    ${t.pos === "inside" ? "left-1.5 top-1.5" : t.pos === "above-right" ? "bottom-full right-[-2px] mb-1" : "right-[-2px] top-full mt-1"}`}>
                    <span className="dv-silk bg-[#0b0b0a] px-1 py-[2px] text-[8px] text-[#c6f432] sm:text-[9px]">0{k + 1}</span>
                    {t.label}
                  </span>
                </div>
              ))}
            </div>
          </Frame>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        {["Reads the DOM, not just pixels", "Ignores clocks, counters, carousels", "One shift = one change"].map((t, i) => (
          <span key={t} className="flex items-center gap-2 border-2 border-[var(--dv-ink)] bg-[var(--dv-panel)] px-3 py-2 text-[15px] font-semibold">
            <span className="dv-silk text-[11px] text-[var(--dv-hot-ink)]">0{i + 1}</span>{t}
          </span>
        ))}
      </div>
    </Section>
  );
}
