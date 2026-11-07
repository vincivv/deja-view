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
