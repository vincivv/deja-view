import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useStartDemo } from "../components/Layout";
import "../landing/landing.css";
import { DitherField } from "../landing/DitherField";
import { PixelMark } from "../landing/kit";
import { Problem } from "../landing/Problem";
import { Pipeline } from "../landing/Pipeline";
import { PrComment } from "../landing/PrComment";
import { Wren } from "../landing/Wren";
import { Numbers, Proof } from "../landing/Numbers";
import { BenchmarkLogos } from "../landing/Logos";

/* Deja View landing page. Dark, dithered, pixel-type. One call to action: "Open dashboard" → /projects
   (which sends signed-out visitors to the login page, where the guest demo lives). */

export const REPO_URL = "https://github.com/vincivv/sightline";

export function LandingPage() {
  const { start, busy } = useStartDemo();
  useEffect(() => {
    const prev = document.title;
    document.title = "Deja View · visual review that tells you what changed";
    return () => { document.title = prev; };
  }, []);

  return (
    <div className="dv dv-grid h-full overflow-y-auto overflow-x-hidden" style={{ backgroundAttachment: "local" }}>
      <div className="dv-grain" aria-hidden />

      <header className="sticky top-0 z-50 border-b-2 border-[var(--dv-ink)] bg-[var(--dv-bg)]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-8">
          <a href="#top" className="flex items-center gap-2.5">
            <PixelMark className="size-6" />
            <span className="dv-pixel text-[19px] font-semibold">Deja View</span>
          </a>
          <nav className="ml-auto hidden items-center gap-7 text-[14px] font-medium text-[var(--dv-mute)] md:flex">
            <a href="#problem" className="hover:text-[var(--dv-ink)]">Problem</a>
            <a href="#how" className="hover:text-[var(--dv-ink)]">How it works</a>
            <a href="#wren" className="hover:text-[var(--dv-ink)]">Wren</a>
            <a href="#numbers" className="hover:text-[var(--dv-ink)]">Results</a>
          </nav>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="dv-silk ml-auto text-[12px] text-[var(--dv-ink)] underline decoration-dotted underline-offset-4 md:ml-0">GitHub</a>
        </div>
      </header>

      <section id="top" className="relative overflow-hidden">
        <DitherField className="absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute inset-0 bg-[rgba(243,240,232,0.78)] md:bg-[linear-gradient(90deg,rgba(243,240,232,0.97)_0%,rgba(243,240,232,0.85)_40%,rgba(243,240,232,0)_72%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[var(--dv-bg)]" />
        <div className="relative mx-auto flex min-h-[calc(100svh-56px)] max-w-6xl flex-col justify-center px-4 py-20 sm:px-8">
          <div className="dv-silk mb-7 inline-flex w-fit items-center gap-2 border-2 border-[var(--dv-ink)] bg-[var(--dv-panel)] px-2.5 py-1.5 text-[11px] text-[var(--dv-ink)]">
            <span className="dv-blink size-2 bg-[var(--dv-hot)]" />Replaces Percy · Chromatic · Applitools
          </div>
          <h1 className="dv-pixel text-[92px] font-bold leading-[0.88] tracking-[-0.02em] sm:text-[120px] lg:text-[148px]">
            Deja<br />View<span className="text-[var(--dv-hot-ink)]">.</span>
          </h1>
          <p className="mt-8 max-w-[36rem] text-[20px] font-medium leading-snug text-[var(--dv-ink)] sm:text-[26px]">
            Visual review that tells you <span className="bg-[var(--dv-lime)] px-1">what changed</span>, in plain English, on every pull request.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-4">
            <Link to="/projects" className="dv-cta" data-testid="open-dashboard">
              Open dashboard <ArrowRight className="dv-arrow size-[18px]" strokeWidth={2.5} />
            </Link>
            <button type="button" onClick={start} disabled={busy} data-testid="try-demo"
              className="text-[15px] font-medium text-[var(--dv-ink)] underline decoration-dotted underline-offset-4 disabled:opacity-60">
              {busy ? "Starting…" : "Try the demo"}
            </button>
          </div>
          <dl className="mt-16 grid max-w-2xl grid-cols-3 gap-[2px] border-2 border-[var(--dv-ink)] bg-[var(--dv-ink)]">
            {[
              ["43.6 → 8.0", "items to review"],
              ["87%", "bugs found"],
              ["3 of 6", "Wren tests needed"],
            ].map(([v, l]) => (
              <div key={l} className="bg-[var(--dv-panel)] px-3 py-3 sm:px-4">
                <dt className="dv-num text-[18px] text-[var(--dv-ink)] sm:text-[26px]">{v}</dt>
                <dd className="mt-1 text-[12px] leading-snug text-[var(--dv-mute)] sm:text-[13px]">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <BenchmarkLogos />

      <Problem />
      <Pipeline />
      <PrComment />
      <Wren />
      <Numbers />
      <Proof />

      <footer className="border-t-2 border-[var(--dv-ink)] bg-[var(--dv-bg)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-8 text-[12.5px] text-[var(--dv-mute)] sm:px-8">
          <span className="flex items-center gap-2"><PixelMark className="size-4" /><span className="dv-pixel text-[14px] text-[var(--dv-ink)]">Deja View</span></span>
          <span>Built at Ship Happens (Seldon), Nov 7 2026</span>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="ml-auto underline decoration-dotted underline-offset-4 hover:text-[var(--dv-ink)]">github.com/vincivv/sightline</a>
        </div>
      </footer>
    </div>
  );
}
