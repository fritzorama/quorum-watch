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

## Slice 1 — Real governance vote data (implemented; awaiting user preview)

**Problem:** The prototype attaches synthetic activity figures to real named
organizations, so it cannot yet support its central claim.

**What was implemented:**

1. Fetch proposal summaries, proposal details, and the organization directory
   from the public neo.community governance API.
2. Validate that aggregate Council counts match individual voter records and
   every voter maps to a known organization; fail without replacing the last
   snapshot if any invariant breaks.
3. Save a deterministic JSON snapshot with proposal source links and per-org
   participation counts.
4. Reconcile the current 21-seat roster by candidate public key and retain the
   roster observation time.
5. Connect only recorded governance votes to the frontend, with snapshot
   freshness, comparative count bars, dropdown details, and per-proposal source
   links. Uptime and discussion remain `not tracked`; combined score remains
   `unavailable`.

**Takeover finding:** The original scraping assumption was stale. The current
site exposes a public API, which is both less fragile and more complete than
parsing HTML. See `docs/DECISIONS.md`.

**Integrity result:** The API contains four Nash.io vote records, but Nash.io is
currently rank 22. Those records are preserved in `excludedVotes`, not assigned
to a current member. The UI reports positive recorded votes only; it does not
infer historical misses or rates from an undated seat history.

**How we knew it worked:** Five fixture tests cover valid output, mismatched
totals, unknown voter organizations, former-seat exclusion, and invalid roster
size. A fresh snapshot validated all seven proposals. Proposal #7 shows two
voters; no proposal reaches the 11-seat majority. The rendered page was checked
in desktop and mobile layouts, row expansion exposed the expected proposal
links, and mobile horizontal overflow was fixed.

**Release state:** Implementation is ready on `slice-1-governance-data`. It is
not merged; branch preview and user approval are the remaining release gates.
