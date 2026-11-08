import { useEffect, useState } from "react";
import { Section, SectionHead, useInView, useReducedMotion } from "./kit";

/* Change-aware Wren routing: changed pages light up, then only the cases that visit them stay on. */

const PAGES = ["/en", "/en/shop", "/en/categories/brakes", "/en/products/…", "/en/cart"];
const CHANGED = new Set(["/en/products/…", "/en/cart"]);
const CASES: { id: string; pages: string[] }[] = [
  { id: "home-page", pages: ["/en"] },
  { id: "shop-filters", pages: ["/en/shop"] },
  { id: "category-brakes", pages: ["/en/categories/brakes"] },
  { id: "product-details", pages: ["/en/products/…"] },
  { id: "add-to-cart", pages: ["/en/products/…", "/en/cart"] },
  { id: "cart-page", pages: ["/en/cart"] },
];
const PRICE = 3;
const SKIP_ORDER = CASES.map((c, i) => (c.pages.some((p) => CHANGED.has(p)) ? -1 : i)).filter((i) => i >= 0);

export function Wren() {
  const reduce = useReducedMotion();
  const [ref, seen] = useInView<HTMLDivElement>(0.35);
  // 0: nothing; 1: pages lit; 2..4: skipped cards one by one
  const [phase, setPhase] = useState(reduce ? 2 + SKIP_ORDER.length : 0);

  useEffect(() => {
    if (reduce) { setPhase(2 + SKIP_ORDER.length); return; }
    if (!seen) return;
    let k = 0;
    const t = setInterval(() => {
      k = k >= 9 ? 0 : k + 1;
      setPhase(Math.min(k, 1 + SKIP_ORDER.length));
    }, 700);
    return () => clearInterval(t);
  }, [seen, reduce]);

  const skipped = new Set(SKIP_ORDER.slice(0, Math.max(0, phase - 1)));
  const cost = (CASES.length - skipped.size) * PRICE;

  return (
    <Section id="wren">
      <SectionHead index="04" label="Built for Wren"
        title={<>Wren tells you if it broke.</>}
        sub={<><b className="text-[var(--dv-ink)]">Deja View tells you what changed</b>, and which Wren tests to run.</>} />

      <div ref={ref} className="grid gap-5 lg:grid-cols-[1fr_2fr_auto] lg:items-stretch">
        <div className="dv-card p-5">
          <div className="dv-silk mb-4 text-[10px] text-[var(--dv-mute)]">Pages on PR #102</div>
          <ul className="space-y-2 font-mono text-[12px]">
            {PAGES.map((p) => {
              const on = phase >= 1 && CHANGED.has(p);
              return (
                <li key={p} className={`flex items-center justify-between gap-2 border px-2.5 py-2 transition-colors duration-200 ${on ? "border-[var(--dv-hot)] bg-[var(--dv-hot)]/10 text-[var(--dv-ink)]" : "border-[var(--dv-line)] text-[var(--dv-dim)]"}`}>
                  <span className="truncate">{p}</span>
                  <span className={`dv-silk text-[8px] ${on ? "text-[var(--dv-hot-ink)]" : "text-[var(--dv-dim)]"}`}>{on ? "changed" : "same"}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CASES.map((c, i) => {
            const run = phase >= 1 && !skipped.has(i) && c.pages.some((p) => CHANGED.has(p));
            const skip = skipped.has(i);
            return (
              <div key={c.id} className={`relative flex flex-col justify-between border p-4 transition-[background-color,border-color,color,opacity] duration-200 ${run ? "border-[var(--dv-ink)] bg-[var(--dv-lime)] text-[#0b0b0a]" : skip ? "border-[var(--dv-line)] text-[var(--dv-dim)] opacity-60" : "border-[var(--dv-line)] bg-[var(--dv-panel)] text-[var(--dv-ink)]"}`}>
                <div className="flex items-center justify-between">
                  <span className="dv-silk text-[9px]">Case {i + 1}</span>
                  <span className={`dv-silk px-1 text-[9px] ${run ? "bg-[#0b0b0a] text-[#c6f432]" : skip ? "" : "text-[var(--dv-mute)]"}`}>{run ? "run" : skip ? "skip" : "queued"}</span>
                </div>
                <div className={`mt-6 font-mono text-[13px] font-medium ${skip ? "line-through decoration-1" : ""}`}>{c.id}</div>
                <div className={`mt-1 truncate font-mono text-[10.5px] ${run ? "text-[#0b0b0a]/70" : "text-[var(--dv-dim)]"}`}>{c.pages.join(" · ")}</div>
              </div>
            );
          })}
        </div>

        <div className="dv-card flex flex-col justify-between p-5 lg:w-[200px]">
          <div className="dv-silk text-[10px] text-[var(--dv-mute)]">Wren cost for this PR</div>
          <div className="my-6">
            <div className="dv-num text-[80px] leading-none text-[var(--dv-ink)]">${cost}</div>
            <div className="mt-2 text-[13px] text-[var(--dv-mute)]">
              {skipped.size ? <><s className="text-[var(--dv-dim)]">$18</s> · {CASES.length - skipped.size} of {CASES.length} tests</> : <>{CASES.length} of {CASES.length} tests</>}
            </div>
          </div>
          <div className="flex gap-[3px]" aria-hidden>
            {CASES.map((_, i) => <span key={i} className={`h-3 flex-1 transition-colors duration-200 ${skipped.has(i) ? "bg-[var(--dv-line)]" : "bg-[var(--dv-lime)]"}`} />)}
          </div>
          <div className="mt-2 text-[11px] text-[var(--dv-dim)]">${PRICE} per Wren run</div>
        </div>
      </div>
    </Section>
  );
}
