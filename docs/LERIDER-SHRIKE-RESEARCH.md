# Lerider's site and "Shrike" — can either help reconstruct historical Council decisions?

**Status: research only. No application code was modified. Nothing was committed, pushed, or
merged.**

Context: Dean (Neo News Today) told this project that `neo.community` records off-chain/temperature
proposals while formal protocol decisions execute as Council-authorized transactions, that
Neo3Scan's signing tool has only ever been used once, and suggested looking at
`https://lerider.com/neo/index.html` and possibly "Shrike" as leads for finding historical Council
parameter-change transactions. This document checks both leads directly, retrieved 2026-09-09.

**Bottom line, upfront:** Lerider's site is not a blockchain data tool and does not mention
"Shrike" anywhere. "Shrike" is real, identifiable, and independently discovered by this research
(not from Lerider's site) — it is a small, self-hosted, early-stage Neo N3 chain indexer whose
database schema genuinely could support the kind of historical-invocation search this project's
`docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md` flagged as missing. Nobody has run it against this
project's question yet, in this research or otherwise; no data was pulled from it, because doing so
requires syncing a full node and would take far longer than this pass allowed.

---

## 1. What Lerider's site actually provides

`https://lerider.com/neo/index.html` (confirmed via the browser's own `location.href`, matching the
URL given) is a single-page, ten-tab **independent governance/strategy report**, authored by
"Malcolm Lerider," titled *"Neo 2026–2030: The Independent Case for the Data-Supply Layer,"*
version 1.0, dated 2026-08-25. Reading every tab's full text (`document.body.textContent`,
108,610 characters, all ten tabs — the page renders every tab into the DOM at once and toggles
visibility, so nothing was missed by not clicking through manually), it contains:

- A market/strategy thesis about Neo's competitive positioning for 2026–2030 (oracle + NeoFS +
  dBFT + dual-token GAS).
- A treasury/governance critique of the Neo Foundation and NGD, covering the ongoing 2026
  Da Hongfei / Erik Zhang founder dispute, custody disclosure, and a "temporary committee" spend.
- A "Governance" tab comparing three GitHub-hosted governance proposals (`neo-project/neo` issues
  **#4526** — Da Hongfei, Foundation Restructuring; **#4531** — Erik Zhang, Governance Restoration;
  **#4532** — Malcolm Lerider (the report's own author), Consolidate Assets — all dated
  2026-04-09/04-13, independently confirmed to exist via a direct web search, not just Lerider's own
  citation) plus references to `neo-project/proposals` issues **#225**, **#226**, and **#233**
  (checked directly, not assumed: `#233` — *"Consolidated Accountability Proposal: Temporary
  Committee Transparency, Treasury Control, and Council Intervention,"* also opened by Lerider — is
  confirmed at `github.com/neo-project/proposals/issues/233`; an earlier pass of this document
  wrongly grouped it under `neo-project/neo`, corrected here) and further `neo-project/neo` issues
  **#4411** and **#4467** (both independently confirmed to exist in that repo).
- A "Sources" tab (Tab 10) with a full **Primary Source Index**: the GitHub governance-proposal
  issues above; press/announcement citations (Neo News Today, CoinDesk, Yahoo Finance, Blockmanity,
  BlockchainReporter, Chainwire, Business Wire); comparable-chain governance precedents (Solana,
  Cosmos, Ethereum Foundation policy); and an "underlying research corpus" the author describes as
  his own private capture files, "available on request for reviewers, analysts, and journalists" —
  not published.

**What is explicitly absent, checked by keyword count across the full 108,610-character page text,
not by skimming:** zero occurrences of "RPC," "witness" (as a technical term — the word appears
nowhere despite "multisig" appearing 10 times and "signature" 9 times), "public key," "repository"
(as a code-repo concept), "explorer," "indexer," "endpoint," "download," "csv," "JSON," "contract
call," or "native contract." "Transaction hash" and "block height" each appear effectively once, and
not as part of any queryable tool — "block height" appears in one sentence about a proposed
tokenholder-rebasing mechanism, unrelated to transaction lookup.

**This site provides none of: a transaction index, native-contract method documentation, a
searchable invocation history, downloadable chain data, an RPC tool, or source code for anything
blockchain-related.** It is a policy essay with citations, not infrastructure.

---

## 2. Can it identify historical calls requiring Committee/Council authorization?

**No.** The one governance-participation statistic Lerider's report does make — *"2 / 21 committee
members signalling willingness to sign one proposed multisig transaction"* — is explicitly, by the
author's own labeling, **not** sourced to on-chain data or any indexing tool. The report's own text
says: *"Author observation on a specific below-threshold proposal... Below-threshold proposals are
typically not broadcast on-chain, so evidence lives in Discord/GitHub — the specific proposal ID is
pending publication in v1.0.1."* The author has not yet even named which proposal this refers to, and
flags it himself as `MEDIUM SOURCED CLAIM` (his own confidence tier, below `HIGH FACT`) with an
explicit follow-up gap: *"Whether this low-water figure is a one-off or a recurring pattern across
N3 lifetime is not consolidated here. UNKNOWN / GAP."*

This is worth taking at face value rather than either dismissing or overweighting: it is a real,
named-source-pending claim about a specific below-threshold proposal, not a fabricated statistic —
but it is not independently verifiable from this document alone, was not broadcast on-chain (so this
project's own §1.6-style witness-decoding method cannot check it), and should not be cited by this
project as evidence of a general committee-participation rate until the author publishes the
specific proposal ID in v1.0.1 (§7's questions ask about this directly).

---

## 3. Does the site expose transaction hash, block height, invoked contract/method, parameters, witness script, or signer public keys?

**No, none of these, anywhere on the site**, per the keyword audit in §1. The GitHub governance-issue
citations (#4526/#4531/#4532/etc.) are discussion threads about founder-level strategic and treasury
proposals — not committee-multisig transaction records, and not the kind of routine Council
parameter-change decision (fee factors, block time, storage price) this project's existing research
in `docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md` is trying to catalogue. They are a genuinely
different governance venue from `neo.community`, Neo3Scan, and the on-chain committee-multisig
mechanism already documented — real, but tangential to this specific research question, and not
followed further in this pass.

---

## 4. Is "Shrike" identifiable, and can it search historical native-contract invocations efficiently?

**Identifiable: yes, independently of Lerider's site** (which never mentions it — confirmed by the
full-text keyword audit in §1). A direct web search for "Shrike" alongside Neo N3 resolves
unambiguously to one project: **`github.com/EdgeDLT/shrike`**, described in its own README as
*"Data analysis infrastructure for the Neo N3 blockchain."* Retrieved and read directly from the
repository (not from any secondary description) on 2026-09-09:

### 4.1 What Shrike actually is

Four components in one repository (Rust + a small JavaScript GUI, BSD-3-Clause license, 12 stars,
3 forks, 2 contributors, "no releases published" — a small, early-stage, community project, not an
official Neo Foundation/NGD/COZ tool):

- **Indexer** — runs and syncs its own local NeoGo node, then walks every block and transaction,
  writing them into a local SQLite database.
- **API** — a REST service (Actix Web, Rust) that queries that SQLite database. Its own README
  states plainly: *"A hosted version of the API will be available in the future"* — **there is no
  public, hosted Shrike instance today.** The default run target is `http://0.0.0.0:8080` — local
  only.
- **GUI** — a web frontend for the API, same self-hosting requirement.
- **Lib** — shared Rust models/utilities used by the other three.

### 4.2 The database schema — checked directly from source, not inferred

`indexer/src/db/database.rs` (fetched directly from GitHub, 2026-09-09) defines the `transactions`
table with exactly these columns:

```
hash, block_index, vm_state, size, version, nonce, sender, sysfee, netfee,
valid_until, signers, script, witnesses, stack_result, notifications
```

This is the single most important fact in this whole research pass: **Shrike stores the raw
`script` and `witnesses` fields for every transaction**, not merely decoded notifications. That
means, in principle, a query against a fully-synced Shrike database could:

- Find every transaction whose `script` contains a call to a specific contract hash + method name
  (e.g. `PolicyContract` + `setFeePerByte`), **regardless of whether that call emitted a
  notification** — directly closing the exact gap `docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md` (§2)
  identified: several real, committee-gated methods (`SetFeePerByte`, `SetExecFeeFactor`,
  `SetStoragePrice`, `NeoToken.SetGasPerBlock`/`SetRegisterPrice`, `OracleContract.SetPrice`) emit
  **no** notification at all, and are therefore invisible to any notification-only indexer
  (`api.n3index.dev`, the one this project has used so far).
- Decode every transaction's `witnesses` field the same way this project's existing method already
  does (`scripts/fetch-council-history.mjs`'s technique, and `docs/COUNCIL-VOTING-MECHANISMS-
  RESEARCH.md` §1.6's), to find every transaction ever whose *verification script* is either the
  standard 11-of-21 committee multisig or the stricter 19-of-21 `AssertAlmostFullCommittee` pattern
  (also documented in that research, §2.4) — a scan by *witness shape*, not by *event presence*, is
  exactly what's needed for completeness.

**One correction to how far witness decoding alone gets you, stated precisely because the first pass
of this document blurred it:** decoding a verification script tells you the *eligible* public keys
and the required threshold for that transaction — it does not, by itself, tell you *which* of those
keys actually produced one of the invocation script's signatures. A multisig invocation script is
just a sequence of raw 64-byte signatures in whatever order they were assembled in; nothing in the
witness labels signature *N* as belonging to public key *M*. Determining that mapping requires an
additional step this project's existing research already performs correctly (`docs/COUNCIL-VOTING-
MECHANISMS-RESEARCH.md` §1.5–§1.6): reconstruct the transaction's exact signed message
(`network_magic ‖ tx_hash`, hashed once with SHA-256) and cryptographically verify each stored
signature against each eligible public key in turn — only a key/signature pair that actually
verifies is proven to have signed. §6, step 4 below states this explicitly for the proposed
catalogue method; treat any restatement of witness decoding elsewhere in this document as implying
that same verification step, not a shortcut around it.

**The block table** similarly stores `speaker`, `next_consensus`, and block `witnesses` — enough to
independently corroborate consensus/validator data, though this project already has its own
independently-built method for that (`scripts/fetch-council-history.mjs`).

### 4.3 The real caveats — this is a lead, not a solved problem

- **No hosted instance exists.** Using Shrike means running your own full NeoGo node plus the
  Shrike indexer, from genesis, to build the database yourself. This research did **not** attempt
  that in this pass — it would require syncing and indexing the entire Neo N3 chain (currently over
  13,000,000 blocks), which is a multi-hour-to-multi-day infrastructure undertaking, not something
  achievable inside a research pass. **No data was actually pulled from a Shrike database in this
  research.** Everything in §4.2 is confirmed from reading Shrike's own source code, not from
  running it.
- **Storage cost is real and only estimated, not verified for the current chain height.** Shrike's
  own README states that *as of block height 4,408,282*, the synced NeoGo chain data was 39.1 GB and
  the Shrike database itself was 12.2 GB. The current chain height is roughly 3× that reference
  point; extrapolating linearly (which the README itself does not claim is accurate, since
  transaction/block sizes and activity levels are not constant across Neo N3's history) would
  suggest a rough, unverified estimate in the ballpark of 100–150+ GB combined today — flagged
  explicitly as an estimate, not a measurement.
- **Early-stage and unofficial.** The repository's own contributing note says: *"As the project is
  in early development, schema changes may occur from time to time."* Two contributors, no tagged
  releases. This is not a reason to dismiss it, but it is not a mature, stable dependency either —
  the same category of standing risk this project already documents for undocumented third-party
  APIs (`docs/DECISIONS.md`, 2026-09-02), just for a different kind of tool (self-hosted software
  instead of a remote API).
- **The API's own query surface is minimal today** ("supports basic queries... more detailed
  documentation... will be provided in the future") — even with a populated database, whether
  Shrike's *existing* REST API already exposes a query shaped like "find all transactions calling
  contract X method Y" is unconfirmed; the raw SQL table is confirmed to hold the right data
  regardless of what the current API layer happens to expose, since a direct SQLite query against
  the database file would work regardless of the REST API's own maturity.

**Verdict on "can it efficiently search historical native-contract invocations or committee-
authorized transactions":** *the schema says yes, in principle, for anyone willing to sync a full
node and either use or extend the existing API — but this has not been demonstrated, only assessed
from source.* Calling it "efficient" without actually running a query against real, fully-synced
data would overclaim.

### 4.4 What chain data can prove, and what it cannot — stated exactly

Precisely, and only, these three things are provable from on-chain data (via Shrike or any
equivalent full-chain index, once the signature-verification step in §4.2 is actually performed):

1. **Which eligible public keys cryptographically match a signature included in the executed
   witness** — proven by verification, not merely by the key appearing in the verification script.
2. **The threshold and committee encoded in the verification script itself** — the standard 11-of-21
   pattern or the stricter 19-of-21 `AssertAlmostFullCommittee` pattern (§2.4), and exactly which
   public keys were eligible to sign.
3. **The executed transaction and the invoked contract/method** — `script`, `vm_state`, `sender`,
   block height, and timestamp, all independently recoverable forever.

**What chain data cannot recover, under any amount of indexing:** any signature that was collected
during off-chain coordination but never included in the broadcast transaction — the AxLabs/NGD8 case
in `docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md` §1.5–§1.6 is the concrete proof of this. That
evidence exists only where a tool like Neo3Scan happened to record it off-chain; no chain-indexing
method, however complete, can produce it after the fact.

---

## 5. Does either site reveal anything beyond the existing research in `docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md`?

Yes, three things — none of them a working tool this project has actually used yet:

1. **Shrike itself** — a previously undocumented, real, self-hostable path to exactly the
   "historical invocation scanning... rather than notifications alone" capability that
   research explicitly named as missing (§2's "Discovery limits" section). This is new.
2. **A separate GitHub-issue-based governance venue** (`neo-project/neo` issues in the #4000s,
   `neo-project/proposals` issues in the #200s) used for founder-level/constitutional proposals —
   distinct from `neo.community`, distinct from Neo3Scan's multisig-signing tool, distinct from the
   NEP-proposal repository already noted in the prior research. Not about routine parameter-change
   decisions, so not pursued further here, but a real venue this project hadn't named before.
3. **A named, dated, but not-yet-independently-verifiable claim** about committee signing behavior
   on one specific (still unidentified) proposed transaction, explicitly caveated by its own author
   as incomplete and pending publication (§2). Worth tracking when Lerider's v1.0.1 publishes the
   proposal ID, not worth citing before then.

Neither site provides anything that changes or corrects a specific factual claim already made in
`docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md` — nothing found here contradicts that document's
worked example (Proposal #12), its source-verified method catalogue, or its stated discovery limits.
It reinforces the same limits with a concrete idea for how to close them.

---

## 6. A proposed reproducible method for a genesis-to-current Council-decision catalogue, including silent methods

This is a **proposal**, not something built or run in this pass. Building on the corrected method
catalogue in `docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md` §2.4 (which already lists every known
committee-gated native contract method, its exact authorization check, and whether it emits a
notification):

1. **Build (or obtain) a full-chain index covering every block and transaction from genesis to the
   current height.** A locally-synced NeoGo node feeding Shrike's indexer is the most practical
   reproducible route this research has actually identified and checked against real source (§4) —
   but it is not being called the only possible one. Any source that can be shown to hold the same
   block and transaction data completely and trustworthily — a complete public RPC service willing
   to serve historical `getblock`/`getapplicationlog` calls for the full chain range, or another
   full-chain dataset whose completeness and integrity can be independently checked — would serve
   the same purpose. Self-hosting NeoGo + Shrike is simply the option this pass verified is real,
   inspectable, and works the way its own source code says it does; it is a practical default, not
   a claimed necessity.
2. **Run Shrike's indexer against that node** (or, if Shrike's schema proves too immature, a
   purpose-built equivalent using the same `getblock`/`getapplicationlog` RPC calls this project's
   own `scripts/fetch-council-history.mjs` already uses) to populate a `transactions` table with
   `script`, `witnesses`, `signers`, and `notifications` for every transaction ever.
3. **For each method in §2.4's catalogue**, decode every transaction's `script` field (the same
   NeoVM script-decoding approach already built for this project's witness-verification work) and
   match on `(contract_hash, method_name)` — this finds a call **regardless of whether it emitted a
   notification**, closing the exact gap flagged previously.
4. **For every matched transaction, decode its `witnesses` field** the same way §1.6 of the voting
   research already does, to recover the multisig threshold used (standard 11-of-21 vs. the stricter
   19-of-21 `AssertAlmostFullCommittee` pattern — §2.4) and the full set of *eligible* public keys
   embedded in the verification script. **That alone does not yet say who signed** (§4.2/§4.4) — the
   next, required sub-step is to reconstruct the transaction's exact signed message and
   cryptographically verify each of the invocation script's raw signatures against each eligible
   public key in turn, exactly as `docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md` §1.5 already did by
   hand for Proposal #12. Only a key that verifies against a specific signature is proven to have
   signed. Only then, for the keys that do verify, resolve them against this project's own
   historical Council-committee method at the transaction's own block height to attach a named
   Council organization to each *at that time* (reusing `scripts/fetch-council-history.mjs` exactly
   as already proven to work for a different mechanism in the existing research, §6.2).
5. **Report completeness precisely, not by assertion:** the catalogue is complete *for the exact set
   of methods checked* up to *the exact block height the node was synced to* — both should be stated
   explicitly in any output, exactly as this project already requires for its other collectors
   (`AGENTS.md`'s fail-closed, source-URL-and-timestamp-preserving standard). A catalogue built this
   way would be the first one in this project's research that can honestly claim full-chain coverage
   for the specific methods in §2.4 — still bounded by that method list being itself checked against
   only four native contracts so far (per the existing research's own stated gap).

**This was not executed in this research pass.** No node was synced, no Shrike database was built,
no query was run. This section is a design, checked for feasibility against Shrike's real schema,
not a report of results.

---

## 7. Keeping four things separate

Directly relevant regardless of which tool eventually gets used, because neither Lerider's site nor
Shrike's schema does this distinguishing automatically:

- **The underlying Council decision** — the actual on-chain multisig transaction that changed a
  parameter or designated a role. Shrike's `transactions.hash`/`script`/`vm_state` would represent
  this directly, once matched per §6.
- **Discussion or temperature voting** — `neo.community` proposals (already tracked separately by
  this project) and, per §1's finding, apparently also GitHub-issue discussion for
  founder/constitutional-level matters. Neither Lerider's site nor Shrike touches this category at
  all; Shrike is purely on-chain.
- **Signatures collected** — every valid signature gathered during coordination, whether or not it
  ended up in the broadcast witness (the AxLabs/NGD8 case already documented in
  `docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md` §1.5–§1.6). **Shrike's schema has no place for this
  category at all** — a signature collected off-chain and never broadcast leaves no on-chain trace,
  so it would never appear in Shrike's `transactions` table regardless of how completely the chain
  is indexed. Only a tool like Neo3Scan (or an equivalent off-chain coordination log) can ever
  capture this category; that limitation is architectural, not a gap in effort.
- **Signatures included in the executed transaction** — exactly what `witnesses` decoding (§6, step
  4) recovers, and the only one of the four categories that is ever fully recoverable from chain data
  alone, forever, by anyone.

A genesis-to-current catalogue built per §6 would be complete for categories 1 and 4. It would say
nothing at all about categories 2 and 3 for any decision — those require the specific off-chain
source (`neo.community`, Neo3Scan, GitHub, Discord) that happened to exist for that particular
decision, and for most of Neo N3's history, no such source has been shown to exist at all.

---

## 8. Non-inference discipline, restated for this document specifically

- **A missing signature is not evidence of non-participation.** This applies with full force to
  every method §6 would newly discover — a member absent from a matched transaction's witness may
  have declined, never been asked, or simply not been needed once quorum was reached by others
  (exactly the AxLabs/NGD8 finding already on record). Use the five-state model already defined in
  `docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md` §3 (`Included in executed witness` /
  `Additional signature recorded off-chain` / `No verifiable signature found` / `Not eligible` /
  `Unknown or source incomplete`) for anything §6 eventually produces — do not invent a new label.
- **The catalogue is not complete merely because §6's method was run.** Completeness is a claim
  about *which methods were checked* and *to which block height the node was synced* — both must be
  stated exactly, every time, the way this document has tried to throughout. A future run that adds
  a fifth native contract to the check, or advances the synced height, changes the completeness
  claim and must say so.
- **Lerider's below-threshold-proposal statistic is not adopted as fact by this document** — it is
  reported in §2 as an unverified, author-labeled claim, with the specific reason it cannot yet be
  checked (no proposal ID published).

---

## 9. Questions for Tyler Adams, COZ, Malcolm Lerider, or the Shrike maintainer

1. (Lerider) Which specific proposal does the "2 of 21 committee members signalled willingness to
   sign" claim refer to, and is there any way to see the underlying Discord/GitHub evidence before
   v1.0.1 publishes it?
2. (Lerider) Is the "underlying research corpus" (private capture files, "available on request")
   something this project could request specifically for governance-transaction-adjacent material,
   separate from the treasury/founder-dispute material?
3. (Shrike maintainer, `EdgeDLT`) Is there any plan for a hosted, publicly queryable instance, as the
   README suggests ("will be available in the future")? Has anyone already synced Shrike to a recent
   height, and would that database be shareable rather than requiring a full resync?
4. (Shrike maintainer) Does the `script` field store the full invocation script unmodified, or any
   processed/truncated form? Is there existing tooling in the repo (even partial) for decoding
   `script`/`witnesses` into method calls and public keys, or would this project need to write that
   from scratch against the raw bytes?
5. (Tyler/COZ) Given this project has now identified Shrike independently — is COZ or NGD aware of
   it, and is there any institutional interest in it (or a similar tool) as a maintained, official
   resource, the way Neo3Scan and `api.n3index.dev` already are?
6. (Anyone) Is there a reason no public Neo N3 indexer currently exposes raw invocation-script
   search (as opposed to notification search), given how clearly useful it would be for exactly this
   kind of governance-transparency question?

---

## Sources

- `https://lerider.com/neo/index.html` — full ten-tab single-page report, read via
  `document.body.textContent` (108,610 characters, all tabs, since the page renders all tabs into
  the DOM and toggles visibility rather than lazy-loading per tab) — retrieved 2026-09-09
- Web search confirming `neo-project/neo` issues `#4526`, `#4531` exist as described —
  retrieved 2026-09-09
- Web search identifying "Shrike" as `github.com/EdgeDLT/shrike` — retrieved 2026-09-09
- `https://github.com/EdgeDLT/shrike` (repository root README) — retrieved 2026-09-09
- `https://github.com/EdgeDLT/shrike/tree/main/indexer` (Indexer README, storage/size figures,
  quickstart) — retrieved 2026-09-09
- `https://raw.githubusercontent.com/EdgeDLT/shrike/main/indexer/src/db/database.rs` (exact SQL
  table definitions for `blocks`, `transactions`, `addresses`, `contracts`) — retrieved 2026-09-09
- `https://raw.githubusercontent.com/EdgeDLT/shrike/main/api/README.md` (confirms no hosted
  instance exists yet) — retrieved 2026-09-09
- `docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md` (this repository) — cross-referenced throughout,
  checked 2026-09-09
