import type { ReactNode } from "react";
import { Check, CircleX, Clock3, ImageOff, MoveHorizontal, Palette } from "lucide-react";
import { PixelMark, Section, SectionHead } from "./kit";

/* A faithful mock of the sticky PR comment the GitHub Action posts (ci/github-action/comment.py),
   restyled to the page. Numbered pins explain each part. */

function Pin({ n }: { n: number }) {
  return <span className="dv-silk inline-flex size-[18px] shrink-0 items-center justify-center bg-[var(--dv-hot)] text-[9px] text-white">{n}</span>;
}

const ROWS: { icon: ReactNode; what: ReactNode; sel: string; where: string }[] = [
  { icon: <Palette className="size-3.5" />, what: <><b>Button background changed</b>: <code>blue → orange</code></>, sel: "main > button.add-to-cart", where: "Product · 1280px + 390px" },
  { icon: <ImageOff className="size-3.5" />, what: <><b>Image missing</b>: product photo</>, sel: "main > div.gallery > img", where: "Product · 1280px + 390px" },
  { icon: <MoveHorizontal className="size-3.5" />, what: <><b>Button moved 36px right</b></>, sel: "main > a.view-cart", where: "Cart · 1280px" },
];

const NOTES: [string, string][] = [
  ["Plain-English changes", "one row per real change"],
  ["Page + viewport", "where to look"],
  ["Noise ignored", "46 regions skipped"],
  ["Wren tests to run", "3 of 6, $9 not $18"],
];

export function PrComment() {
  return (
    <Section id="comment">
      <SectionHead index="03" label="On the pull request"
        title={<>The review lands on the PR.</>}
        sub="One comment. Updated on every push." />

      <div className="grid gap-10 lg:grid-cols-[1.45fr_1fr] lg:items-start">
        <div className="flex min-w-0 gap-3">
          <div className="hidden size-10 shrink-0 items-center justify-center border border-[var(--dv-line)] bg-[var(--dv-panel)] sm:flex"><PixelMark className="size-6" /></div>
          <div className="min-w-0 flex-1">
            <div className="dv-card overflow-hidden">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--dv-line)] bg-[var(--dv-bg2)] px-4 py-2.5 text-[13px]">
                <b className="text-[var(--dv-ink)]">deja-view</b>
                <span className="border border-[var(--dv-line)] px-1.5 text-[10px] leading-[16px] text-[var(--dv-mute)]">bot</span>
                <span className="text-[var(--dv-mute)]">commented on PR #102</span>
              </div>
              <div className="space-y-4 px-4 py-5 text-[14px] leading-relaxed text-[var(--dv-ink)] sm:pl-12 sm:pr-6">
                <h3 className="flex items-center gap-2 text-[17px] font-semibold">
                  <CircleX className="size-[18px] shrink-0 text-[var(--dv-hot-ink)]" />Deja View: 3 visual changes need review
                </h3>
                <div className="text-[12.5px] text-[var(--dv-mute)]">Build #2 · 10 snapshots</div>

                <div className="relative">
                  <span className="absolute -left-8 top-2 hidden sm:block"><Pin n={1} /></span>
                  <div className="overflow-x-auto border border-[var(--dv-line)]">
                    <table className="w-full min-w-[520px] text-left text-[12.5px]">
                      <thead>
                        <tr className="border-b border-[var(--dv-line)] bg-[var(--dv-bg2)] text-[var(--dv-mute)]">
                          <th className="w-8 px-3 py-2" /><th className="px-3 py-2 font-semibold">Change</th>
                          <th className="px-3 py-2 font-semibold"><span className="inline-flex items-center gap-1.5">Where <span className="sm:hidden"><Pin n={2} /></span></span></th>
                          <th className="px-3 py-2 font-semibold">Review</th>
                        </tr>
                      </thead>
                      <tbody className="[&_code]:bg-[var(--dv-bg2)] [&_code]:px-1 [&_code]:font-mono [&_code]:text-[11.5px]">
                        {ROWS.map((r, i) => (
                          <tr key={i} className="border-b border-[var(--dv-line)] align-top last:border-0">
                            <td className="px-3 py-2.5 text-[var(--dv-mute)]">{r.icon}</td>
                            <td className="px-3 py-2.5">{r.what}<div className="mt-0.5 font-mono text-[10.5px] text-[var(--dv-dim)]">{r.sel}</div></td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-[var(--dv-mute)]">{r.where}</td>
                            <td className="whitespace-nowrap px-3 py-2.5"><span className="inline-flex items-center gap-1 text-[var(--dv-mute)]"><Clock3 className="size-3.5" />pending</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <span className="absolute -right-2 -top-2 hidden sm:block"><Pin n={2} /></span>
                </div>

                <div className="relative text-[12px] text-[var(--dv-mute)]">
                  <span className="absolute -left-8 top-0 hidden sm:block"><Pin n={3} /></span>
                  46 dynamic regions ignored (clocks, counters, rotating content); a plain pixel diff would have flagged 57 regions.
                </div>

                <div className="text-[13px]"><span className="font-semibold text-[var(--dv-ink)] underline decoration-dotted underline-offset-4">Review in Deja View →</span> Approving or rejecting there updates this check.</div>

                <div className="relative border-t border-dashed border-[var(--dv-line)] pt-4">
                  <span className="absolute -left-8 top-4 hidden sm:block"><Pin n={4} /></span>
                  <div className="text-[14px] font-semibold">Wren: run 3 of 6 tests</div>
                  <div className="mt-1 text-[12.5px] text-[var(--dv-mute)]">Only these flows go through a page that changed:</div>
                  <div className="mt-2 grid gap-1 font-mono text-[11.5px]">
                    {[["product-details", "Product page changed"], ["add-to-cart", "Product page changed"], ["cart-page", "Cart page changed"]].map(([id, why]) => (
                      <div key={id} className="flex flex-wrap justify-between gap-x-4 border border-[var(--dv-line)] bg-[var(--dv-bg2)] px-2.5 py-1.5">
                        <span className="text-[var(--dv-ink)]">{id}</span><span className="text-[var(--dv-mute)]">{why}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-[12.5px] text-[var(--dv-mute)]">About <b className="text-[var(--dv-ink)]">$9</b> of Wren runs instead of $18 for the full suite ($3 per run).</div>
                </div>
              </div>
            </div>

            {/* merge box */}
            <div className="dv-card mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-[13px]">
              <CircleX className="size-4 text-[var(--dv-hot-ink)]" />
              <b className="text-[var(--dv-ink)]">Deja View</b>
              <span className="min-w-0 flex-1 truncate text-[var(--dv-mute)]">3 visual changes need review in Deja View</span>
              <span className="text-[12px] text-[var(--dv-ok)]">Details</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 pl-4 text-[12px] text-[var(--dv-dim)]">
              <Check className="size-3.5 text-[var(--dv-ok)]" />After approval: "3 visual changes approved in Deja View"
            </div>
          </div>
        </div>

        <ol className="grid gap-px border border-[var(--dv-line)] bg-[var(--dv-line)]">
          {NOTES.map(([h, d], i) => (
            <li key={h} className="flex gap-3 bg-[var(--dv-bg)] p-5">
              <Pin n={i + 1} />
              <div>
                <div className="text-[18px] font-semibold text-[var(--dv-ink)]">{h}</div>
                <div className="mt-0.5 font-mono text-[13px] text-[var(--dv-mute)]">{d}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
