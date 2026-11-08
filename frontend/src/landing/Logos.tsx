// Monochrome brand marks from Simple Icons (CC0), shown only to say which public sites the benchmark ran on.
import stripe from "./logos/stripe.svg?raw";
import vercel from "./logos/vercel.svg?raw";
import linear from "./logos/linear.svg?raw";
import github from "./logos/github.svg?raw";
import airbnb from "./logos/airbnb.svg?raw";
import shopify from "./logos/shopify.svg?raw";
import figma from "./logos/figma.svg?raw";
import wikipedia from "./logos/wikipedia.svg?raw";
import mdn from "./logos/mdnwebdocs.svg?raw";
import tailwind from "./logos/tailwindcss.svg?raw";
import python from "./logos/python.svg?raw";
import yc from "./logos/ycombinator.svg?raw";

const LOGOS: [string, string][] = [
  ["Stripe", stripe], ["Vercel", vercel], ["Linear", linear], ["GitHub", github], ["Airbnb", airbnb],
  ["Shopify", shopify], ["Figma", figma], ["Wikipedia", wikipedia], ["MDN", mdn], ["Tailwind", tailwind],
  ["python.org", python], ["Hacker News", yc],
];
const TEXT_ONLY = ["BBC", "The Verge"];

/** Compact row of the marks only (used under the "Measured" heading). */
export function LogoRow({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap items-center gap-x-6 gap-y-3 ${className}`} aria-label="Benchmarked on these public sites">
      {LOGOS.map(([name, svg]) => (
        <li key={name} title={name} className="text-[var(--dv-ink)] opacity-60 transition-opacity hover:opacity-100">
          <span className="block size-7 [&_svg]:size-full [&_svg]:fill-current" role="img" aria-label={name} dangerouslySetInnerHTML={{ __html: svg }} />
        </li>
      ))}
      {TEXT_ONLY.map((name) => (
        <li key={name} className="text-[15px] font-bold tracking-tight text-[var(--dv-ink)] opacity-60">{name}</li>
      ))}
    </ul>
  );
}

export function BenchmarkLogos() {
  return (
    <section aria-label="Benchmark sites" className="relative border-y-2 border-[var(--dv-ink)] bg-[var(--dv-panel)]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
        <p className="dv-silk mb-4 text-[11px] text-[var(--dv-mute)]">We benchmarked on these companies' public pages · 115 planted bugs</p>
        <ul className="flex flex-wrap items-center gap-x-7 gap-y-4">
          {LOGOS.map(([name, svg]) => (
            <li key={name} className="flex items-center gap-2 text-[var(--dv-ink)] opacity-70 transition-opacity hover:opacity-100" title={name}>
              <span className="block size-6 [&_svg]:size-full [&_svg]:fill-current" aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
              <span className="text-[15px] font-semibold tracking-tight">{name}</span>
            </li>
          ))}
          {TEXT_ONLY.map((name) => (
            <li key={name} className="text-[15px] font-semibold tracking-tight text-[var(--dv-ink)] opacity-70">{name}</li>
          ))}
        </ul>
        <p className="mt-4 text-[11.5px] text-[var(--dv-mute)]">Not affiliated with or endorsed by these companies. Logos are trademarks of their owners.</p>
      </div>
    </section>
  );
}
