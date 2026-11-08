import { Check, CircleX, GitPullRequest } from "lucide-react";
import { Section, SectionHead, Ticker, useInView } from "./kit";
import { LogoRow } from "./Logos";

/* Benchmark numbers (docs/CONTEXT.md) as dithered bars and pixel grids, plus the real-store proof. */

function Bar({ label, value, max, tone, run, decimals = 1 }: { label: string; value: number; max: number; tone: "hot" | "lime"; run: boolean; decimals?: number }) {
  const color = tone === "hot" ? "var(--dv-hot)" : "var(--dv-ink)";
  return (
    <div className="grid grid-cols-[96px_1fr] items-center gap-3">
      <div className="text-right text-[14px] font-medium text-[var(--dv-ink)]">{label}</div>
      <div className="flex items-center gap-2">
        <div className="h-5 border transition-[width] duration-[1100ms]" style={{ width: run ? `${Math.max(3, (value / max) * 82)}%` : "0%", borderColor: color, transitionTimingFunction: "steps(12)" }}>
          <div className="dv-checker h-full w-full" style={{ color }} />
        </div>
        <span className="dv-num text-[22px]" style={{ color }}><Ticker to={value} decimals={decimals} run={run} /></span>
      </div>
    </div>
  );
}

function Tile({ k, title, note, children }: { k: string; title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col bg-[var(--dv-bg)] p-6">
      <div className="dv-silk text-[10px] text-[var(--dv-hot-ink)]">{k}</div>
      <div className="mt-2 text-[20px] font-semibold text-[var(--dv-ink)]">{title}</div>
      <div className="mt-6 flex-1">{children}</div>
      <p className="dv-silk mt-6 text-[10px] text-[var(--dv-mute)]">{note}</p>
    </div>
  );
}

export function Numbers() {
  const [ref, seen] = useInView<HTMLDivElement>(0.25);
  const found = Math.round(0.87 * 115);
  return (
    <Section id="numbers">
      <SectionHead index="05" label="Measured"
        title={<><span className="dv-num">115</span> planted bugs. <span className="dv-num">15</span> live sites.</>}
        sub="Stripe, GitHub, Airbnb, BBC, Wikipedia and 10 more." />
      <LogoRow className="-mt-4" />
      <p className="mb-10 mt-3 text-[11.5px] text-[var(--dv-mute)]">Public pages only. Not affiliated with or endorsed by these companies.</p>

      <div ref={ref} className="grid gap-px border border-[var(--dv-line)] bg-[var(--dv-line)] md:grid-cols-2">
        <Tile k="A" title="Items to review" note="average per page with one planted bug">
          <div className="space-y-3">
            <Bar label="Pixel diff" value={43.6} max={43.6} tone="hot" run={seen} />
            <Bar label="Deja View" value={8.0} max={43.6} tone="lime" run={seen} />
          </div>
        </Tile>

        <Tile k="B" title="Bugs found at the right spot" note="1 square = 1 planted bug">
          <div className="flex items-start gap-5">
            <div className="dv-num text-[72px] leading-none text-[var(--dv-ink)]"><Ticker to={87} run={seen} />%</div>
            <div className="grid flex-1 grid-cols-[repeat(23,minmax(0,1fr))] gap-[2px]" aria-hidden>
              {Array.from({ length: 115 }, (_, i) => (
                <span key={i} className="aspect-square transition-colors duration-150"
                  style={{ background: seen && i < found ? "var(--dv-ink)" : "var(--dv-line)", transitionDelay: `${i * 6}ms` }} />
              ))}
            </div>
          </div>
        </Tile>

        <Tile k="C" title="False alarms" note="regions flagged on pages that did not change">
          <div className="space-y-3">
            <Bar label="Pixel diff" value={5.7} max={5.7} tone="hot" run={seen} />
            <Bar label="Deja View" value={1.7} max={5.7} tone="lime" run={seen} />
          </div>
        </Tile>

        <Tile k="D" title="Wren on the final build" note="both core workflows, final build">
          <div className="space-y-2">
            {["A demo build catches the planted regressions", "Approving a build makes it the new baseline"].map((t) => (
              <div key={t} className="flex items-center gap-3 border border-[var(--dv-line)] bg-[var(--dv-panel)] px-3 py-2.5">
                <span className="dv-silk bg-[var(--dv-lime)] px-1.5 py-0.5 text-[10px] text-[#0b0b0a] ring-1 ring-[var(--dv-ink)]">Pass</span>
                <span className="text-[14px] text-[var(--dv-ink)]">{t}</span>
              </div>
            ))}
            <div className="dv-num pt-2 text-right text-[40px] text-[var(--dv-ink)]">2/2</div>
          </div>
        </Tile>
      </div>
    </Section>
  );
}

export function Proof() {
  return (
    <Section id="proof">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <SectionHead index="06" label="Real-world proof"
          title={<>Running on a real store.</>}
          sub="GEARGO auto-parts store. 2 planted bugs caught, plus 1 real bug nobody planted." />

        <div className="dv-card">
          <div className="flex items-center gap-2.5 border-b border-[var(--dv-line)] bg-[var(--dv-bg2)] px-4 py-3">
            <GitPullRequest className="size-4 text-[var(--dv-ok)]" />
            <span className="min-w-0 truncate text-[14px] font-semibold text-[var(--dv-ink)]">Tidy up product and cart buttons</span>
            <span className="ml-auto font-mono text-[12px] text-[var(--dv-mute)]">#102</span>
          </div>
          <ul>
            {[
              { tag: "planted", what: "Add to cart button turned orange", where: "Product page" },
              { tag: "planted", what: "Product photo hidden", where: "Product page" },
              { tag: "not planted", what: "Cart could not load: \"Failed to fetch\"", where: "Cart page, preview only" },
            ].map((f) => (
              <li key={f.what} className="flex items-center gap-3 border-b border-[var(--dv-line)] px-4 py-3.5 last:border-0">
                <Check className="size-4 shrink-0 text-[var(--dv-ok)]" strokeWidth={3} />
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-medium text-[var(--dv-ink)]">{f.what}</div>
                  <div className="text-[13px] text-[var(--dv-mute)]">{f.where}</div>
                </div>
                <span className={`dv-silk shrink-0 px-1.5 py-0.5 text-[9px] ${f.tag === "planted" ? "border border-[var(--dv-line)] text-[var(--dv-mute)]" : "bg-[var(--dv-hot)] text-white"}`}>{f.tag}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--dv-line)] bg-[var(--dv-bg2)] px-4 py-3 text-[12.5px] text-[var(--dv-mute)]">
            <CircleX className="size-4 text-[var(--dv-hot-ink)]" />
            <span>Check stayed red until reviewed</span>
            <span className="ml-auto font-mono text-[11.5px]">5 pages × 2 viewports · ~75 s</span>
          </div>
        </div>
      </div>
    </Section>
  );
}
