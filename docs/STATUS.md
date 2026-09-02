# Status

Last updated: 2026-09-02 (takeover audit; Slice 1 started)

This file is the single source of truth for where the project actually is.
Update it at the end of every slice — before committing.

## CURRENT (what actually exists and works)

- A working frontend mockup (`web/index.html`, published as a Claude
  Artifact) with:
  - The real, public roster of all 21 Council members — name, org, location
    — from neo.community/candidates.
  - The real headline stats: 2 of 21 voted on the most recent proposal
    (#7), 0 of 6 proposals have ever reached majority, 11 votes needed for
    quorum.
  - A fixed, disclosed scoring formula: 40% governance vote participation +
    30% node uptime + 30% discussion engagement.
  - Sortable columns, click-to-expand per-member metric breakdown, light/dark
    themes.
  - **All 21 members' per-metric numbers (votes, uptime, threads, total
    score) are synthetic placeholder data**, clearly labeled as such in the
    UI. No live data fetching exists yet.
- The local repository's original Slice 0 commit is `c5e8288`. The working
  branch is now `main`, connected to
  `https://github.com/fritzorama/quorum-watch` as `origin`.
- A dependency-free governance fetcher now reads the public neo.community
  governance API, validates proposal vote totals and organization mappings,
  and writes one atomic JSON snapshot.
- Fixture-based validation tests cover the successful path and fail-closed
  behavior.
- The frontend is not yet connected to the real snapshot. Its synthetic-data
  warnings remain accurate.
- The live vote history contains `Nash.io`, which is absent from the prototype
  roster, while the prototype includes members not present in those vote
  records. Council seats can change over time, so the roster must be reconciled
  by public key and effective date before historical participation is displayed.

## NEXT (the slice we are currently building)

**Slice 1 — Real governance vote data.** Generate and inspect the first real
snapshot, verify representative proposals against neo.community, then connect
only the frontend's governance-vote field to it. Keep uptime, discussion, and
the combined score visibly unavailable/synthetic until their own slices.

Before closing the slice:

- configure and seed `https://github.com/fritzorama/quorum-watch`
- run the fetcher and tests from a clean checkout
- make data freshness and per-proposal source links visible in the UI
- reconcile the prototype roster against current Council public keys and define
  how seat changes affect historical participation
- remove synthetic vote values without implying the other metrics are real

## LATER (recorded, not started)

- Node uptime metric (Neo RPC — clean API, lower risk, do this once vote
  data is trusted)
- Discussion engagement metric + the org→GitHub-handle mapping table
- Scheduled/automated refresh (GitHub Actions cron + static redeploy is still
  the leading option)
- Historical trend view (score over time, not just current snapshot)
- Per-proposal / per-thread citation links inside each expanded row, so a
  claim about a member is always one click from its source
- Mobile layout polish
- A short methodology page explaining exactly how each metric is computed
- The actual GrantShares application draft
- Handling contested/ambiguous cases (e.g. a council seat changes hands
  mid-period — how do we attribute historical votes?)
