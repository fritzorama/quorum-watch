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

## Current technical baseline

- Frontend: dependency-free HTML/CSS/JavaScript in `web/index.html`.
- Data fetcher: Node.js 20+ script in `scripts/fetch-governance.mjs`.
- Snapshot: `data/governance.json`.
- Tests: run `npm test` (or `node --test`).
- Refresh governance data: run `npm run fetch:governance`.

The production site and later slice branches read verified governance vote records from the checked-in
snapshot. Uptime, discussion, and the combined score remain unavailable. Never
turn an absent historical vote into a missed vote or rate unless a dated seat
interval proves that the member was eligible for that proposal.

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
  `data/governance.json`; keep both paths deployable when changing the layout.
