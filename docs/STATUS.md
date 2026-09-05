# Status

Last updated: 2026-09-05 (Slice 2 observation started)

This file is the single source of truth for where the project actually is.
Update it at the end of every slice — before committing.

## CURRENT (what actually exists and works)

- A working frontend (`web/index.html`) with:
  - The real, public roster of all 21 Council members — name, org, location
    — from neo.community/candidates.
  - Verified headline stats from the snapshot: 2 of 21 recorded voters on
    Proposal #7, 0 of 7 proposal records reaching the 11-seat majority.
  - Compact sortable roll-call rows, expandable metric details, a nested
    disclosure of each member's linked proposal evidence, data freshness,
    light/dark themes, and a checked mobile layout. Vote bars compare recorded
    counts; they are not participation percentages.
  - Uptime and discussion are clearly `not tracked`; the combined score is
    `unavailable`. No synthetic member-level values remain.
- The local repository's original Slice 0 commit is `c5e8288`. Slice 1 is on
  `slice-1-governance-data`, connected to
  `https://github.com/fritzorama/quorum-watch` as `origin`.
- A dependency-free governance fetcher now reads the public neo.community
  governance API, validates proposal vote totals and organization mappings,
  and writes one atomic JSON snapshot.
- Fixture-based validation tests cover the successful path and fail-closed
  behavior.
- `data/council-roster.json` records the 21 current seats observed on
  2026-09-03, keyed by the candidate public keys shown on neo.community.
- The governance snapshot is schema v2. It maps organization vote records to
  current seats by public key, preserves source URLs and freshness, and keeps
  four Nash.io vote records in `excludedVotes` because Nash is currently rank
  22 rather than silently attributing them to a current seat.
- Positive vote records are displayed, but historical non-votes and
  participation rates are not inferred. The current roster observation does
  not prove who held every seat at each older proposal date.
- Cloudflare Pages now hosts the approved `main` branch at
  `https://neoquorumwatch.com` (provider fallback:
  `https://quorum-watch.pages.dev`). Slice 2 development is isolated on
  `slice-2-node-uptime` and published at `https://dev.neoquorumwatch.com`
  through its stable Cloudflare branch alias.
- Slice 2 has a dependency-free Neo RPC collector and a checked-in observation
  beginning at block 12,980,715 on 2026-09-05 19:52:55 UTC. It measures
  scheduled primary-duty completion for the seven consensus nodes only. Three
  independent RPC sources corroborate the validator order and boundary block;
  stale or divergent sources, validator changes, consensus-contract changes,
  gaps, and invalid totals fail closed.
- The development UI identifies the seven observable consensus nodes as
  `Collecting` and the other fourteen seats as `Not observable`. No uptime
  percentage is exposed until the prospective seven-day window is complete.
- Cloudflare's build now publishes every checked-in JSON snapshot under
  `/data/`, so the development page can load the uptime observation without
  changing how the approved production branch is selected.

## NEXT (the slice we are currently building)

**Slice 2 — Node uptime.** Continue the prospective observation through at
least 2026-09-12 19:52:55 UTC, then refresh the snapshot, inspect all missed-duty
evidence, and publish percentages only if the full window validates. Until
then, keep the UI in its explicit collecting/not-observable state and refine
the methodology copy in the branch preview.

## LATER (recorded, not started)

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
