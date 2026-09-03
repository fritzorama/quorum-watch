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
