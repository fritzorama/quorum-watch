# Decisions

Dated log. Each entry: the decision, why, and what it rules out. Add to this,
don't rewrite history — if a decision is later reversed, add a new entry that
says so and link back to the old one.

---

### 2026-09-02 — Project scope: attendance record, not a verdict machine

The tool reports participation (did they vote, is the node up, did they show
up to discussion) — it does not score "good" or "bad" council members as
people, and it does not allege intent. This matters because every row is a
real, named organization. Scores are behavior counts against public
commitments the Council itself published (neo.community's "Commitment &
Values" page), not our opinion of anyone.

### 2026-09-02 — No public API on neo.community; scraping is required

Checked network traffic loading a proposal page: it's server-rendered
(Nuxt), vote data is baked into the page server-side, no separate fetchable
JSON endpoint observed. This is a real risk, not a formality — a layout
change on their end can break the parser. Documented so it isn't rediscovered
the hard way later. Mitigation: parse defensively, fail loud (don't publish
a broken/partial scrape as if it were valid data), and note the last-verified
date in the UI.

### 2026-09-02 — Three metrics, fixed 40/30/30 weighting, published on-page

Governance vote participation (40%), node uptime (30%), discussion
engagement (30%). Weights are arbitrary by nature — there's no "correct"
answer — so the mitigation is transparency, not false precision: the formula
is shown on the page itself, not buried, so anyone can disagree with the
weighting on its own terms rather than distrusting the tool as a black box.

### 2026-09-02 — Missing data reads as "not tracked," never as zero

A member with no mappable GitHub handle for the discussion-engagement metric
must not be scored 0 on it — that punishes a data gap, not behavior. Applies
to any future metric with incomplete coverage too.

### 2026-09-02 — Build order: vote data first, not all three metrics at once

Governance votes is the metric with the clearest existing evidence (we've
already hand-verified real numbers on neo.community) and the most contested
claim (Council engagement) — so it's the highest-value slice to prove out
first, per "prioritize the slice that gives the most useful information
about whether the project works." Node uptime is lower-risk (clean RPC API)
and discussion engagement is higher-effort (needs the handle-mapping table),
so both come later.

### OPEN — Stack and hosting

Leaning Node.js for fetch scripts (keeps one language across the whole
project, frontend is already vanilla JS) plus a scheduled GitHub Actions job
and a static host (Cloudflare Pages or GitHub Pages) for redeploys — same
pattern as the existing (independent, unaffiliated) neo-treasury.pages.dev
tool. Not finalized — flagging here so it isn't decided silently mid-slice.

### OPEN — Hosting

Static hosting remains undecided. GitHub Pages and Cloudflare Pages are the
leading options; choose only after the first real-data slice works locally.

### 2026-09-02 — Supersedes “scraping is required”: use the public governance API

The rebuilt neo.community frontend exposes its API base URL and public,
read-only endpoints. `/proposal/get/all` lists proposals,
`/proposal/get?proposal_id=...` includes the Council vote map, and
`/organization/get/all` maps voter IDs to organization names. Slice 1 will use
those endpoints instead of scraping presentation markup. Every fetch is
validated before replacing the checked-in snapshot; mismatched totals or
unknown voter IDs fail the run.

### 2026-09-02 — GitHub source of truth: fritzorama/quorum-watch

The remote repository has been created at
`https://github.com/fritzorama/quorum-watch`. It was empty at takeover time;
the local Slice 0 commit is the only existing history and seeds the remote.

### 2026-09-03 — Branch preview and approval gate

`main` is the approved/public version. Every slice is developed on a branch
created from the latest `origin/main`, pushed for a preview, tested by the user,
and merged only after explicit approval. This supersedes the earlier repository
instruction to commit ordinary development directly to `main`.

### 2026-09-03 — Council identity and historical attribution

Council seats are reconciled by the Neo N3 candidate public key, not by display
name or governance-API organization ID. A roster observation is effective as
evidence of membership at its observation time; it is not backdated across old
proposals. A positive governance vote may be assigned to a current member when
the vote organization and current roster share the same public key. An absent
vote must not be called a missed vote or used in a participation rate until a
dated seat interval proves eligibility for that proposal. Votes whose public
key is outside the current roster remain in an explicit audit list. This is why
Nash.io's four records are preserved but not attributed to any current seat.

### 2026-09-03 — Cloudflare Pages hosting and release channels

Cloudflare Pages is the static host. The `quorum-watch` Pages project deploys
`main` to `https://neoquorumwatch.com` (with
`https://quorum-watch.pages.dev` as the provider hostname), while non-`main`
branches receive preview deployments. This closes the earlier open hosting
decision. Production remains the approved `main` branch; a preview URL is a
testing channel, not permission to merge or promote a slice.

### 2026-09-03 — Stable development domain follows the active slice branch

`https://dev.neoquorumwatch.com` is the user-facing test channel. For Slice 2,
its proxied DNS record targets the stable Cloudflare branch alias
`slice-2-node-uptime.quorum-watch.pages.dev`. It must not target the production
Pages hostname, because that would make the development domain serve `main`.
Changing the development branch requires an explicit DNS retarget; production
continues to follow only `main` and still requires user approval before merge.

### 2026-09-05 — “Node uptime” is consensus primary-duty success

The observable metric is the percentage of scheduled primary/speaker duties
completed by each of the seven current consensus nodes during a prospective
seven-day window. Neo's dBFT rule schedules the view-zero speaker as block
height modulo the ordered validator count; each block header records the actual
primary index. A different actual primary is preserved as missed-duty evidence.
This does not prove continuous host or RPC availability, so the UI describes
the limitation and the other fourteen Council seats read `Not observable`, not
zero. No percentage is published before a complete window.

The collector corroborates validator ordering and a boundary block across
three public Neo N3 RPC nodes, rejects chain tips older than five minutes or
more than three blocks apart, and requires the block range to be consecutive.
The validator keys must map to the current Council roster and both their order
and the block header's next-consensus address must remain unchanged throughout
the window. Any disagreement fails without replacing the previous snapshot.

### 2026-09-06 — Separate Council node health from Consensus performance

This supersedes the 2026-09-05 naming decision, but preserves its collected
evidence and validation rules. Council node health applies conceptually to all
21 Council members and may only be measured when a public endpoint is
independently attributable to its operator; otherwise it reads `Not tracked`.
Consensus performance applies only to the validator set dynamically returned by
Neo N3 RPC and reads `N/A` for other Council members. The current seven-day
on-chain observation measures only `Primary duty success`, not host uptime or
complete Prepare/Commit participation, so it is presented as that narrow
submetric. Consensus membership and future endpoint attribution must be
effective-dated to prevent role changes from rewriting historical evidence.

### 2026-09-07 — Historical Council eligibility: reconstructed via NeoToken cross-node corroboration, not inferred

Proves out the open question left by the 2026-09-03 Council-identity decision ("An absent vote must
not be called a missed vote... until a dated seat interval proves eligibility for that proposal").
That dated seat interval is now real, not aspirational.

**Method.** `getCommittee` has no historical parameter — it always reads live chain state — but the
value it returns is a cached NeoToken contract storage slot (`Prefix_Committee = 0x0E`) that *is*
queryable at a past state root via the StateService plugin's `getstateroot`/`getstate`, on any node
running `FullState: true`. Confirmed live against `neo-project/neo`'s own C# source (storage prefix,
21-block refresh cadence, and the exact `Struct{ByteString(33), Integer}` serialization) before being
trusted — see `docs/COUNCIL-HISTORY-RECONSTRUCTION.md` for the full investigation this implements.

**Eligibility rule.** A member is eligible for a proposal only if their candidate public key was
present in the Council committee (top 21) at the last block at or before that proposal's UTC
creation time. Eligibility and recorded votes are matched only by stable candidate public key, never
by name or organization ID — consistent with the existing Council-identity rule.

**Corroboration and fail-closed behavior.** Every historical committee read is required to come back
byte-identical from two independently operated full-state archival nodes
(`mainnet2.neo.coz.io`, `n3seed1.ngd.network`) before it is trusted. A third RPC source already in
this project's use, `rpc1.n3.nspcc.ru`, was checked and confirmed to run `KeepOnlyLatestState`
(error `-606` on any historical `getstate` call) — it cannot participate in this corroboration and is
deliberately excluded from `fetch-council-history.mjs`'s RPC list. If a recorded vote's public key is
absent from its proposal's verified committee, the collector treats that as a data conflict — it
fails closed and preserves the conflicting evidence for diagnosis rather than silently dropping or
miscounting the vote. Running this against the real 2026-09-07 chain state for all seven checked-in
proposals produced zero such conflicts.

**UI change.** The "Vote participation" bar and value now read `{recorded}/{eligible} eligible
proposals · {percent}%`, colored green (75–100%), yellow (50–74.99%), red (>0–<50%), or a neutral
empty state (0%, or 0 eligible proposals to date — e.g. a member whose seat began after every
currently checked-in proposal). This replaces the earlier "comparative recorded-vote count; not a
participation percentage" bar now that a genuine, verified percentage exists.

### 2026-09-07 — Scope portal votes separately from Council approvals

The existing snapshot proves votes recorded by the neo.community proposal portal; it does not prove
complete Council voting activity. Council decisions can also be executed through committee-authorized
multisignature transactions, including the three-second block-time/GAS adjustment. Some additional
valid signatures may be collected off-chain but omitted from the final witness after quorum is reached.
The UI therefore names the existing metric `neo.community votes` and describes its percentage as
eligible-portal-proposal coverage. Future executed-witness evidence and additional off-chain signature
evidence must remain separately labeled; they must not be blended into this percentage or treated as
proof that a member with no visible signature failed to participate. See
`docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md`.
