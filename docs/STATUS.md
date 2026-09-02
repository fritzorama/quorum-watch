# Status

Last updated: 2026-09-02 (Slice 0 close-out)

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
- No fetch scripts, no scheduled job, no deployment pipeline, no GitHub
  remote for this repo yet.

## NEXT (the slice we are currently building)

**Slice 1 — Real governance vote data.** See `docs/SLICES.md` for the full
spec. Short version: replace the synthetic `vote` field only (not uptime,
not discussion) with real numbers scraped from neo.community, for all 21
members, verified by hand against what we can already see on the live site.

## LATER (recorded, not started)

- Node uptime metric (Neo RPC — clean API, lower risk, do this once vote
  data is trusted)
- Discussion engagement metric + the org→GitHub-handle mapping table
- Scheduled/automated refresh (likely GitHub Actions cron + static redeploy)
- Historical trend view (score over time, not just current snapshot)
- Per-proposal / per-thread citation links inside each expanded row, so a
  claim about a member is always one click from its source
- Mobile layout polish
- A short methodology page explaining exactly how each metric is computed
- The actual GrantShares application draft
- Handling contested/ambiguous cases (e.g. a council seat changes hands
  mid-period — how do we attribute historical votes?)
