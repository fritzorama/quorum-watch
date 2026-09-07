# Status

Last updated: 2026-09-07 (historical Council eligibility reconstructed)

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
    light/dark themes, and a checked mobile layout. The vote-participation bar
    now shows a verified eligible-proposal percentage (`{recorded}/{eligible}
    eligible proposals · {percent}%`), colored green/yellow/red/empty by the
    documented thresholds — see the historical-eligibility bullet below.
  - Uptime and discussion are clearly `not tracked`; the combined score is
    `unavailable`. No synthetic member-level values remain.
- A dependency-free historical Council collector
  (`scripts/fetch-council-history.mjs`) reconstructs, for each of the seven
  checked-in governance proposals, the Council committee (top 21) in effect at
  the last block at or before the proposal's UTC creation time — read from the
  NeoToken native contract's cached committee storage (key `0x0E`) at that
  historical state root via StateService `getstateroot`/`getstate`, required to
  agree byte-for-byte across two independent full-state archival nodes
  (`mainnet2.neo.coz.io`, `n3seed1.ngd.network`). A member is eligible for a
  proposal only if their public key held a seat at that moment; a recorded vote
  from an ineligible key fails the run closed instead of being silently
  miscounted. `data/council-history.json` is schema v1 and carries block
  height, timestamp, state root, and both source URLs per proposal for
  auditing. Running against live chain state on 2026-09-07 found zero
  eligibility conflicts across all seven proposals; one current member (R3E)
  is not yet eligible for any of them, and two (NeoSPCC, Red4Sec) have fewer
  than seven eligible proposals because their seats began after the earliest
  ones. See `docs/COUNCIL-HISTORY-RECONSTRUCTION.md` for the underlying
  investigation and `docs/DECISIONS.md` (2026-09-07) for the durable rule.
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
- Recorded votes and eligible-proposal participation percentages are now shown
  for all 21 current members. A non-vote is still never inferred as "missed"
  outside a proposal the historical Council collector has verified the member
  was eligible for; the current roster observation alone still does not prove
  who held every seat at each older proposal date — the collector above proves
  it per proposal, on-chain.
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
- The development UI derives the seven current Consensus members from the RPC
  validator set and marks them with a compact badge. Council node health is
  separate and remains `Not tracked` for all 21 until public endpoints can be
  independently attributed. The existing chain observation appears only as
  `Primary duty success`: `Collecting` for Consensus members and `N/A` for the
  other fourteen. No percentage is exposed until the prospective seven-day
  window is complete.
- Cloudflare's build now publishes every checked-in JSON snapshot under
  `/data/`, so the development page can load the uptime observation without
  changing how the approved production branch is selected.

## NEXT (the slice we are currently building)

**Slice 2 — Node health and Consensus performance.** Continue the prospective
primary-duty observation through at least 2026-09-12 19:52:55 UTC, then refresh
the snapshot and inspect all missed-duty evidence. Publish that narrow
percentage only if the full window validates. Separately define a sourced,
effective-dated registry of independently attributable Council endpoints before
collecting or scoring node health; an unidentified endpoint remains `Not tracked`.

## LATER (recorded, not started)

- Discussion engagement metric + the org→GitHub-handle mapping table
- Broader Consensus participation (Prepare/Commit and view-change evidence),
  which may require a continuously running consensus-message listener
- Scheduled/automated refresh (GitHub Actions cron + static redeploy is still
  the leading option)
- Historical trend view (score over time, not just current snapshot)
- Per-proposal / per-thread citation links inside each expanded row, so a
  claim about a member is always one click from its source
- Mobile layout polish
- A short methodology page explaining exactly how each metric is computed
- The actual GrantShares application draft
- ~~Handling contested/ambiguous cases (e.g. a council seat changes hands
  mid-period — how do we attribute historical votes?)~~ — resolved 2026-09-07
  by the historical Council eligibility collector; see the CURRENT section and
  `docs/DECISIONS.md` (2026-09-07).
