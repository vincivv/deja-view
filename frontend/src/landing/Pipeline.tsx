import { useEffect, useState, type ReactNode } from "react";
import { Check, GitPullRequest, Globe, MessageSquareText, ScanEye, X } from "lucide-react";
import { Section, SectionHead, useInView, useReducedMotion } from "./kit";

/* PR → preview → capture → comment + check → approve flips the check. Steps light up one at a time,
   a pixel packet walks the track, and the final check flips from red to green. */

const STEPS: { icon: ReactNode; title: string; sub: string }[] = [
  { icon: <GitPullRequest className="size-4" />, title: "PR opened", sub: "#102 opened" },
  { icon: <Globe className="size-4" />, title: "Vercel preview", sub: "Preview deploy ready" },
  { icon: <ScanEye className="size-4" />, title: "Before / after", sub: "DOM + pixels, 2 viewports" },
  { icon: <MessageSquareText className="size-4" />, title: "Comment + check", sub: "Plain English + red check" },
  { icon: <Check className="size-4" />, title: "Approve or reject", sub: "Check flips live" },
];

function Art({ i, lit, approved }: { i: number; lit: boolean; approved: boolean }) {
  const on = lit ? "text-[var(--dv-ink)]" : "text-[var(--dv-dim)]";
  if (i === 0)
    return (
      <div className={`font-mono text-[10.5px] leading-[1.6] ${on}`}>
        <div><span className="text-[var(--dv-ok)]">+</span> className="bg-orange"</div>
        <div><span className="text-[var(--dv-hot-ink)]">-</span> className="bg-blue"</div>
        <div><span className="text-[var(--dv-ok)]">+</span> &lt;img invisible&gt;</div>
      </div>
    );
  if (i === 1)
    return (
      <div className={`w-full font-mono text-[10.5px] ${on}`}>
        <div className="flex items-center gap-1.5"><span className={`size-2 ${lit ? "bg-[var(--dv-ok)]" : "bg-[var(--dv-dim)]"}`} />Preview ready</div>
        <div className="mt-1.5 truncate text-[var(--dv-mute)]">pr-102.vercel.app</div>
      </div>
    );
  if (i === 2)
    return (
      <div className="flex gap-1.5">
        {["before", "after"].map((k, j) => (
          <div key={k} className={`relative h-12 w-12 border ${lit ? "border-[var(--dv-mute)]" : "border-[var(--dv-line)]"}`}>
            <div className={`absolute inset-x-1 top-1 h-1.5 ${lit ? "bg-[var(--dv-mute)]" : "bg-[var(--dv-line)]"}`} />
            <div className={`absolute bottom-1 left-1 h-2 w-6 ${j && lit ? "bg-[#f08c1a]" : lit ? "bg-[#4c6ef5]" : "bg-[var(--dv-line)]"}`} />
            <span className="dv-silk absolute -bottom-3.5 left-0 text-[7px] text-[var(--dv-dim)]">{k}</span>
          </div>
        ))}
      </div>
    );
  if (i === 3)
    return (
      <div className={`flex items-center gap-1.5 text-[11px] font-semibold ${lit ? "text-[var(--dv-hot-ink)]" : "text-[var(--dv-dim)]"}`}>
        <X className="size-3.5" strokeWidth={3} />3 changes need review
      </div>
    );
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold transition-colors duration-200 ${!lit ? "text-[var(--dv-dim)]" : approved ? "bg-[var(--dv-lime)] text-[#0b0b0a] ring-1 ring-[var(--dv-ink)]" : "text-[var(--dv-hot-ink)] ring-1 ring-[var(--dv-hot)]"}`}>
      {approved ? <Check className="size-3.5" strokeWidth={3} /> : <X className="size-3.5" strokeWidth={3} />}
      {approved ? "3 changes approved" : "Waiting for review"}
    </div>
  );
}

export function Pipeline() {
  const reduce = useReducedMotion();
  const [ref, seen] = useInView<HTMLDivElement>(0.3);
  const [step, setStep] = useState(reduce ? 5 : -1); // 0..4 lit steps, 5 = approved

  useEffect(() => {
    if (reduce) { setStep(5); return; }
    if (!seen) return;
    let k = -1;
    const t = setInterval(() => {
      k = k >= 7 ? -1 : k + 1; // hold on the approved state for a couple of beats
      setStep(Math.min(k, 5));
    }, 900);
    return () => clearInterval(t);
  }, [seen, reduce]);

  const approved = step >= 5;
  const pos = Math.max(0, Math.min(step, 4));

  return (
    <Section id="how">
      <SectionHead index="02" label="How it works"
        title={<>Every PR. <span className="text-[var(--dv-hot-ink)]">Zero clicks.</span></>}
        sub="Push → preview → review → green check." />

      <div ref={ref} className="relative">
        {/* track */}
        <div className="pointer-events-none absolute left-[10%] right-[10%] top-[27px] hidden h-[2px] md:block"
          style={{ backgroundImage: "linear-gradient(to right, var(--dv-line) 50%, transparent 50%)", backgroundSize: "8px 2px" }} />
        <div className="dv-packet pointer-events-none absolute top-[22px] hidden size-3 md:block"
          style={{ left: `calc(${10 + pos * 20}% - 6px)`, background: approved ? "var(--dv-ok)" : "var(--dv-hot)", opacity: step < 0 ? 0 : 1, boxShadow: `0 0 0 3px ${approved ? "rgba(198,244,50,.2)" : "rgba(255,90,31,.2)"}` }} />
        <div className="pointer-events-none absolute bottom-6 left-[27px] top-6 w-[2px] md:hidden"
          style={{ backgroundImage: "linear-gradient(to bottom, var(--dv-line) 50%, transparent 50%)", backgroundSize: "2px 8px" }} />

        <ol className="relative grid gap-4 md:grid-cols-5 md:gap-3">
          {STEPS.map((s, i) => {
            const lit = step >= i;
            return (
              <li key={s.title} className="flex gap-4 md:flex-col md:gap-0">
                <div className="flex justify-center md:mb-5">
                  <span className={`relative z-10 flex size-[56px] shrink-0 items-center justify-center border-2 transition-colors duration-200 ${lit ? (i === 4 && approved ? "border-[var(--dv-ink)] bg-[var(--dv-lime)] text-[#0b0b0a]" : "border-[var(--dv-ink)] bg-[var(--dv-ink)] text-[var(--dv-bg)]") : "border-[var(--dv-line)] bg-[var(--dv-bg)] text-[var(--dv-dim)]"}`}>
                    {s.icon}
                    <span className="dv-silk absolute -right-[2px] -top-[2px] bg-[var(--dv-bg)] px-[3px] text-[8px] text-[var(--dv-mute)] ring-1 ring-[var(--dv-line)]">{i + 1}</span>
                  </span>
                </div>
                <div className={`dv-card flex-1 p-4 transition-[border-color] duration-200 ${lit ? "!border-[var(--dv-ink)]" : ""}`}>
                  <div className={`text-[17px] font-semibold ${lit ? "text-[var(--dv-ink)]" : "text-[var(--dv-mute)]"}`}>{s.title}</div>
                  <p className="mt-1 text-[13.5px] leading-snug text-[var(--dv-mute)]">{s.sub}</p>
                  <div className="mt-3 flex h-[64px] items-center border-t border-dashed border-[var(--dv-line)] pt-3">
                    <Art i={i} lit={lit} approved={approved} />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Section>
  );
}
