# Quorum Watch project instructions

This repository is **Quorum Watch**, an independent public record of Neo
Council participation. It is unrelated to Wandering Lords. Do not use files,
requirements, terminology, or assumptions from Wandering Lords in this repo.

## Source of truth

- GitHub: `https://github.com/fritzorama/quorum-watch`
- Local checkout: `C:\Users\Usuario\Documents\DevChimp\Neo Quorum Watch`
- Current state and plan: `docs/STATUS.md`
- Architecture and product decisions: `docs/DECISIONS.md`
- Completed and active vertical slices: `docs/SLICES.md`

Read those three documents before beginning substantial work. Treat old chat
history and mockup copy as context, not as authoritative project state. Keep
`docs/STATUS.md` accurate whenever a slice materially changes.

## Working method

1. Work in small vertical slices that produce something testable or visibly
   useful.
2. Do not rewrite working parts unless the active slice requires it.
3. Run the relevant tests and inspect the rendered interface before closing a
   slice.
4. Never develop or merge directly on `main`. Create a slice branch from the
   latest `origin/main`, push it, provide a preview for user testing, and merge
   only after explicit user approval. `main` is the approved/public version.
5. Keep the active slice branch on GitHub; do not leave the remote behind the
   local source of truth.
6. Record durable decisions and reversals in `docs/DECISIONS.md` instead of
   silently changing direction.

## Data integrity

- Never present synthetic, incomplete, stale, or unmapped data as a real
  measurement of a named organization.
- Fail closed when source totals, voter records, identities, or Council-seat
  mappings disagree.
- Preserve source URLs and snapshot timestamps so public claims are auditable.
- Missing data means `not tracked`, not zero.
- Reconcile organizations by stable public key and effective date before
  attributing historical participation across Council-seat changes.
- Historical Council-seat state (e.g. committee membership at a past block) must be corroborated
  byte-for-byte across at least two independently operated full-state RPC sources before it is
  trusted; a single source, or two sources that disagree, fails the run closed.

## Current technical baseline

- Frontend: dependency-free HTML/CSS/JavaScript in `web/index.html`.
- Data fetcher: Node.js 20+ script in `scripts/fetch-governance.mjs`.
- Snapshot: `data/governance.json`.
- Historical Council eligibility fetcher: `scripts/fetch-council-history.mjs`.
- Historical eligibility snapshot: `data/council-history.json`.
- Tests: run `npm test` (or `node --test`).
- Refresh governance data: run `npm run fetch:governance`.
- Extend the consensus-duty observation: run `npm run fetch:uptime`.
- Refresh historical Council eligibility: run `npm run fetch:council-history`.

The production site and later slice branches read verified governance vote records from the checked-in
snapshot. A Slice 2 branch may show uptime collection status, but production
uptime, discussion, and the combined score remain unavailable.

**Historical Council eligibility (dated seat interval rule, implemented).** A member is eligible
for a proposal only if their candidate public key was present in the Council committee (top 21) at
the last block at or before that proposal's UTC creation time. This is reconstructed via
`scripts/fetch-council-history.mjs`, which reads the NeoToken native contract's cached committee
storage (key `0x0E`) at a past state root through the StateService RPC methods (`getstateroot`,
`getstate`), corroborated byte-for-byte across two independent full-state (`FullState: true`)
archival nodes — `https://mainnet2.neo.coz.io:443` and `https://n3seed1.ngd.network:10332`. See
`docs/COUNCIL-HISTORY-RECONSTRUCTION.md` for the investigation this method is based on. A recorded
vote from a public key absent from that proposal's verified committee is a data conflict, not a
silent miscount: the collector fails closed and preserves the conflicting evidence rather than
publishing it. Never turn an absent historical vote into a missed vote or rate for a proposal this
collector has not verified eligibility for.

Council node health and Consensus performance are separate metrics. Council
node health remains `not tracked` unless a public endpoint can be independently
attributed to its operator. Slice 2's existing chain observation is the narrower
Consensus `Primary duty success` measurement, derived from block height and the
block header's actual primary index. It applies only to the seven dynamically
identified current Consensus nodes. For other Council members it is `N/A`, not
zero. Do not publish a percentage before the full seven-day window.

## Hosting and previews

- Cloudflare Pages project: `quorum-watch`
- Production branch: `main`
- Production domain: `https://neoquorumwatch.com`
- Active development domain: `https://dev.neoquorumwatch.com`
- Active development branch: `slice-2-node-uptime`
- Cloudflare Pages fallback: `https://quorum-watch.pages.dev`
- The development domain is a proxied CNAME to the active branch alias
  (`slice-2-node-uptime.quorum-watch.pages.dev`), not to the production Pages
  hostname. Update this mapping deliberately when the active long-lived slice
  branch changes.
- Non-`main` branches deploy as preview builds for user testing. Do not attach
  a preview branch to the production domain or promote it without explicit user
  approval.
- The Pages build copies `web/index.html` to the deployment root and includes
  every checked-in `data/*.json` snapshot; keep those paths deployable when
  changing the layout or adding a metric.
