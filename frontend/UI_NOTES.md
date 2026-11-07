# UI notes: how the mature tools present review

- **Build list:** every tool leads with a list of numbered builds (#123), branch/label, a colored status badge and counts ("4 changes"). Status is the first thing you scan, so badges stay small, colored and consistent.
- **Status vocabulary:** Pending/needs review (amber), Passed/Approved (green), Rejected/Failed (red), In progress (blue). Chromatic sends a "UI Review" check to the PR, and "Accepted" is shown separately from "Passed".
- **Review layout:** a list of snapshots on the left (Argos and Percy), the diff canvas in the centre, and approve/reject at the top right (Percy's new dashboard). The canvas gets most of the screen.
- **Grouping:** Argos shows "N similar" rows that expand. Applitools "groups steps by similar differences" so that accepting the group accepts every step in it. This is the closest thing to Sightline's groups, so put groups first.
- **Root cause:** Applitools RCA compares the DOM and tells you *why* a pixel area changed. Sightline makes this the main idea: every change is a labelled DOM change, not a pink blob.
- **Diff modes:** split (side by side), single (baseline/changes), overlay (red changed pixels with adjustable opacity), and highlight/flash regions. Chromatic adds "strobe", which flips the two images back and forth. Zoom and pan stay synced across both panes.
- **Fit vs. 100%:** Argos uses Space to toggle "fit to screen". Fit-width is the sensible default for tall full-page screenshots.
- **Keyboard first:** Argos uses ↑/↓ for snapshots, J/K for changes, S/D/H for modes, Y/N for accept/reject and `?` for a shortcut sheet. Percy uses arrow keys, D for diff and A for approve. Sightline uses J/K for groups, ←/→ for snapshots, A/R for approve/reject, 1–4 for modes and `?`.
- **Approve granularity:** Percy approves whole snapshots, and approving everything approves the build automatically. Argos counts the latest verdict from each reviewer, and one rejection blocks the build. Sightline does group-level review plus "Approve all".
- **Unchanged collapsed:** unchanged snapshots are folded away behind a count, so reviewers only see what matters.
- **Trust signals:** tools flag flaky or unstable areas ("I: ignore flaky change" in Argos, and Chromatic's flagged unstable tests). Sightline goes further with a "show ignored noise" overlay.
- **Discussions/comments** are attached to a change (Chromatic, Argos). These are out of scope for the hackathon.
- **Cleaner than them:** one accent color, dense mono metadata, no marketing chrome, and change cards that read like a commit log ("`.cta` color #333 → #e00000 · 3 pages").

## v2 redesign (less reading, more seeing)

Sources: Argos docs (review changes), Percy/BrowserStack "new dashboard" docs, Chromatic UI Review docs, Lost Pixel site (product is being sunset, little public UI detail).

- **Persistent left rail, collapsible.** Percy's new dashboard moved navigation into an always-on left rail with a project switcher, so you change projects without going back to a list. Sightline: collapsible sidebar (`[`), project list with status dots, icon-only rail when collapsed.
- **Fold tool bars into one place, open on demand.** Percy merged its top bar, snapshot-tools row and bottom bar into one panel whose tools open over the canvas; filters became two icons instead of an always-open panel. Sightline: build stats live in an (i) popover, details panel is hidden until `D`.
- **The diff canvas is the hero.** Every tool gives the comparison most of the screen; approve/reject sit top right (Percy) or in one review control with a progress chip like "2 / 3 reviewed" (Argos). Sightline: one summary ("3 changes · 2 left"), Approve all / Reject, nothing else in the header.
- **Collapse duplicates into one row with a count.** Argos shows identical diffs once with "N similar"; accepting the row accepts all. Sightline: one row per group with a `×8` badge; scope ("4 pages · 8 snapshots") is a tooltip, not a sentence.
- **Show the value, not a description of it.** Rows carry a swatch pair or the quoted text instead of title + detail + selector. The selector and raw before/after are details-on-demand.
- **Row actions appear on hover/selection** as icon buttons; state is a tint plus a check/cross icon instead of a badge and two labelled buttons.
- **Thumbnails over text.** Project cards show the latest baseline screenshot; snapshot rows show a tiny thumbnail with a status dot.
- **Keyboard first, help behind `?`.** Argos/Percy keep a full shortcut sheet but do not print key hints everywhere; Sightline removed inline `J`/`K`/`N`/`P` hints and kept them in the sheet and tooltips.
