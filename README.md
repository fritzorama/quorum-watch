# Quorum Watch

A public attendance record for Neo's 21 elected Council members — how often
they vote on governance proposals, whether their consensus node stays
online, and whether they show up to the discussions that actually decide
things.

Built as a candidate Neo GrantShares submission, born out of watching the
Council fail to reach quorum on its own governance portal (0 of 6 proposals
have ever passed; the last one drew votes from 2 of 21 members).

## Status

Pre-MVP. See [`docs/STATUS.md`](docs/STATUS.md) for what's real, what's next,
and what's deliberately deferred — that file is the source of truth, not this
README or old chat history.

## Repository map

- `web/` — the frontend (currently a working mockup with synthetic data)
- `scripts/` — data-fetching scripts (none written yet — see Slice 1)
- `data/` — fetched snapshots, once the fetcher exists
- `docs/STATUS.md` — CURRENT / NEXT / LATER, kept up to date every slice
- `docs/DECISIONS.md` — dated log of architecture/product decisions and why
- `docs/SLICES.md` — one entry per vertical slice: problem, scope, result, learnings

## Local workflow

Requires Node.js 20 or newer. No third-party packages are needed yet.

```sh
npm test
npm run fetch:governance
```

The fetch command writes a validated, traceable snapshot to
`data/governance.json`. It refuses to replace the previous snapshot if vote
totals, voter records, or organization mappings are inconsistent.

## Data sources

| Metric | Source | Access |
|---|---|---|
| Governance vote participation | neo.community public governance API | JSON; proposal details + organization directory |
| Node uptime | any public Neo N3 RPC endpoint | clean JSON-RPC |
| Discussion engagement | github.com/neo-project/neo (Discussion-labeled issues) | GitHub API, + a small hand-maintained org→handle map |

## Not affiliated

Independent community project. Not built or endorsed by the Neo Foundation,
NGD, or the Neo Council.
