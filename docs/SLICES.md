# Slices

One entry per vertical slice. Written when the slice closes, not before —
this is a log, not a plan (that's `docs/STATUS.md`'s NEXT/LATER sections).

---

## Slice 0 — UI prototype (retroactive entry)

**Problem it solved:** We had a scoring concept (three metrics, weighted)
but no shared, concrete artifact to react to. Hard to critique an idea in
the abstract.

**What was implemented:** A single-file HTML/CSS/JS mockup: sortable
21-member table, click-to-expand per-member metric breakdown, formula
disclosed on-page, light/dark themes. Real roster and real headline stats
(2/21 voted on Prop #7, 0/6 proposals ever passed). All 21 members' actual
metric numbers are synthetic, clearly labeled.

**Deliberately not included:** Any real data fetching. Any backend. Any
persistence.

**How we knew it worked:** Rendered and screenshotted in both themes;
verified the click-to-expand interaction actually toggles; caught and fixed
a text-wrapping bug in the expanded metric row before publishing.

**Learnings:**
- neo.community has no public API — confirmed by inspecting network
  requests while loading a proposal page. Data is server-rendered
  (Nuxt), not served via a separate JSON endpoint. This became the basis
  for the Slice 1 spec and a standing entry in `docs/DECISIONS.md`.
- Synthetic data attached to real, named organizations needs very visible
  labeling — a single disclaimer line isn't enough on its own; we used a
  persistent banner plus a repeated note in every expanded row.

**Result:** Published as a Claude Artifact. Not yet in version control —
this repo (and Slice 0's retroactive documentation) was created after the
fact, once we adopted a disciplined workflow.

---

## Slice 1 — Real governance vote data (in progress)

See `docs/STATUS.md` → NEXT for current spec. Filled in here once closed.
