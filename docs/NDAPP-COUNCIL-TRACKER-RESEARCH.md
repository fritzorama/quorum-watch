# The ndapp.org Council Vote Tracker — research findings

**Status: research only. No application code, data snapshot, test, or frontend file was modified. No
branch was switched. Nothing was committed, pushed, or merged. Shrike was not installed and no
full-chain sync was started.**

Subject: `https://staging-council-vote-tracker.ndapp.org/`, retrieved and tested live 2026-09-12.

**Headline finding, upfront:** this staging site runs its frontend through an unbundled Vite dev
server, which serves its own TypeScript source files and full source maps over plain HTTP. That is
not a security exploit and nothing here required guessing at hidden endpoints or scraping rendered
HTML — the application handed over its own request logic, its exact TypeScript interfaces, and its
API routes just by reading the files the browser itself already loads. Everything in §3–§5 below is
sourced that way, not inferred from the UI. One explicit boundary was kept throughout: no attempt was
made to escape the Vite project root (e.g. via `../` path traversal) to find the private backend
collector — that would cross from "reading what's served" into probing someone else's server, which
is out of scope for this research and was not attempted.

---

## Headline findings

1. **This tracker independently confirms the exact discovery gap `docs/COUNCIL-VOTING-MECHANISMS-
   RESEARCH.md` (§2) already flagged, with new evidence — recounted exactly, not approximately, this
   pass (§9/§10).** That document noted that a notification-only indexer (`api.n3index.dev`) found
   only **one** historical PolicyContract transaction ever (`tx_count: 1`) because most PolicyContract
   setters emit no event. This tracker lists **nine** `setFeePerByte`/`setStoragePrice`/
   `setExecFeeFactor` transactions (three dates — 2021-08-07, 2021-09-13, 2025-02-25 — three methods
   each) and **eighteen** `blockAccount`/`unblockAccount` transactions (14 + 4), all silent methods,
   all found anyway. This is concrete, independent proof that whatever discovery strategy the tracker
   actually runs recovers what notification search misses, not just a theoretical claim — though see
   §6 for exactly what is, and isn't, established about *how* it does this.
2. **Every one of its 34 records is tagged `discoveredBy: "method"`.** This is a direct, checked fact
   about the tracker's own self-reported label — none say `"notification"`, `"witness-scan"`,
   `"shrike"`, or anything else. It is **not**, by itself, proof of the specific backend implementation
   behind that label (§6).
3. **Five independently sampled transactions were re-verified against live RPC data and matched on
   every checked field** — transaction hash, `vmstate`, the method name literally present in the
   script, the *exact* multisig committee address, and the *exact* count of embedded signatures
   (§11). One structural detail this exposed that matters for any future collector: several of these
   transactions carry **two witnesses**, not one — a single-sig fee-payer/sponsor witness plus the
   21-key committee witness — so a collector that only inspects `witnesses[0]` (as this project's own
   earlier research implicitly did for its one worked example) would miss the committee witness
   entirely on transactions shaped this way.
4. **The tracker's own signature-to-pubkey attribution is empirically consistent with real
   cryptographic verification**, confirmed by cross-checking its data for Proposal #12 against this
   project's own from-scratch ECDSA re-verification in `docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md`
   §1.5 — the raw signature bytes it reports for each signing member match byte-for-byte. Its
   server-side collector code was not found or inspected (only the frontend is exposed), so this is
   an output-level consistency check, not a source-code audit (§8).
5. **The tracker does not distinguish "signed off-chain but not broadcast" from "no signature found
   at all."** For Proposal #12 specifically, it reports AxLabs and NGD8 as `signed: false` — on-chain
   accurate (their signatures never reached the blockchain), but it has no mechanism to know they
   signed at all, because it only ever reads chain data. This project's own five-state model (§3 of
   the voting-mechanisms research) is strictly more precise than what this tracker can express.
6. **A likely (not certain) resolution to an open question from `docs/COUNCIL-VOTING-MECHANISMS-
   RESEARCH.md`:** that document flagged Neo3Scan's overview page labeling
   `NU6wVcRy9mb81YxZcxrpBudVn7d4MTDqEz` as "COMMITTEE MULTI-SIG" as a possible mislabel, since it
   isn't Proposal #12's signer address. This tracker independently reports `NU6wVcRy9mb81YxZcxrpBu
   dVn7d4MTDqEz` as the **real, on-chain-verified** committee address for its *most recent* decision
   (2026-08-31, block 12,830,042) — i.e. that address is a genuine committee multisig address, just
   for a *different, later* committee composition than Proposal #12's. Neo3Scan's page may simply be
   showing whatever the *current* committee address is rather than Proposal #12's specific one. This
   is a reasonable inference from two independent sources agreeing, not a confirmed fact — it doesn't
   revise the earlier document itself (out of this task's scope), but is worth cross-referencing there
   later.
7. **Who specifically built this was not confirmed**, but a strong, named, circumstantial lead was
   found independently (§1) — not asserted as fact.

---

## 1. Who created and maintains the tracker

**Not confirmed directly** — no author, maintainer, or "About" attribution was found anywhere in the
served frontend (checked `index.html`, `App.tsx`, and every component file for the words "author,"
"maintained," "github," "contact," "footer" — nothing substantive returned).

**A real, named, circumstantial lead was found, independently of anything the site itself states:**

- `ndapp.org` (the parent domain this staging tracker lives under) is an established, pre-existing
  Neo ecosystem site — *"nDapp | Neo blockchain dApp & data discovery"* — a dApp/data directory for
  the Neo ecosystem, not a brand-new personal project.
- A web search for "Shrike" (the tool named in this project's prior research,
  `docs/LERIDER-SHRIKE-RESEARCH.md`) resolves to `github.com/EdgeDLT/shrike`, whose second (of two)
  contributors is GitHub user **`lopescode`**, display name **"Lopes."**
- `lopescode`'s own GitHub profile states: *"Senior Developer... Breaking things since 2013"*,
  based in Brazil, and — critically — **lists `@neonewstoday` as an affiliation.** Neo News Today is
  Dean's own outlet, and Dean is the person who originally pointed this project toward both Lerider's
  site and (by name) "Lopes" as someone to ask if the source couldn't be found.
- `lopescode`'s own public repositories include several real, current Neo N3 developer tools
  (`neo-developer-kit`, `nef-reader`, `neoline-webview-sample`, `neo-tracker`), demonstrating genuine,
  active Neo N3 tooling work — but **no repository named `council-vote-tracker` or `ndapp` appears
  among his 10 public repos**, checked directly.

**Conclusion: a named, plausible, but unconfirmed connection.** Lopes is a real, identifiable Neo N3
developer, connected to Neo News Today, and already a contributor to Neo chain-indexing tooling
(Shrike) — but this research did not find direct proof that Lopes personally built or maintains
*this specific tracker*, or that he's affiliated with `ndapp.org` itself. This is exactly the kind of
gap §"Questions for Lopes" below exists to close by simply asking, rather than asserting.

---

## 2. Public source repository

**Not found, and not fully searchable from outside.** Two concrete facts, both from files the site
itself serves (not from GitHub search):

- The frontend's own `package.json` names the project **`council-vote-tracker-web`**, version
  `0.1.0`, `"private": true` — explicitly marked private, which is itself informative (not
  necessarily intended for public distribution as-is).
- It depends on a **sibling workspace package literally named `council-vote-tracker`**
  (`"council-vote-tracker": "file:.."`) — i.e., the actual backend/collector almost certainly lives
  one directory up from this `web/` frontend, in a monorepo structure. That package's own contents
  were **not accessed** — browser-side `fetch("/../...")` requests get normalized by the browser back
  to the site's own root before they're ever sent (this was tested and confirmed: `/../package.json`
  returns the *same* frontend `package.json`, not a parent one), so this alone doesn't constitute a
  boundary bypass — and no further attempt was made to reach outside the served root by other means,
  per this task's explicit "research only" scope.
- A web search for `"council-vote-tracker" ndapp github` and for the exact package name returned no
  matching public repository.

**Conclusion:** if a public repository exists, it was not locatable from the site's own served
content or from a direct search. This is one of the direct questions for the maintainer (§18).

---

## 3. Every API endpoint, static file, or backend request the frontend uses

Found by reading `src/api.ts` directly (served in full, including its original TypeScript via an
embedded source map) — not by guessing or watching network traffic alone, though the same four
endpoints were also independently observed firing as real network requests on page load:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/summary` | Aggregate counts, category breakdown, and the collector's last-run status. |
| `GET` | `/api/votes?limit=&offset=&category=&q=&member=` | Paginated list of decisions, filterable by category, free-text search, or member. |
| `GET` | `/api/votes/{txHash}` | Full detail for one decision, including per-member raw signatures. |
| `GET` | `/api/members` | Every pubkey ever seen in a committee roster, with identity metadata and lifetime signed/eligible counts. |

No other backend routes were found. No static JSON files, downloadable datasets, or bundled data
files were found — every response is served dynamically from these four routes. Avatar images are
served from a separate asset host, `cdn.staging.ndapp.org` (and, for at least one member, the
non-staging `cdn.ndapp.org` — see §12).

---

## 4. Can its data be retrieved programmatically, without scraping rendered HTML?

**Yes, cleanly.** All four endpoints in §3 are plain, unauthenticated, CORS-permitting (tested from
this research's own browser context) JSON REST endpoints. No rendered-HTML scraping was performed or
would be necessary — everything in this document past §1's identity question was obtained via direct
`fetch()` calls to these JSON routes.

---

## 5. Schema and available fields

Reproduced directly from `src/api.ts`'s own TypeScript interfaces (served with its source map — this
is the actual type definition the frontend code was written against, not a guess from sample data):

```ts
interface ActionRow {
  callIndex: number; contract: string; contractName: string | null; method: string;
  category: string; title: string; summary: string; args: unknown[]; argsComplete: boolean;
}
interface VoteListItem {
  txHash: string; blockIndex: number; timestampMs: number; vmState: string; applied: boolean;
  sender: string; committeeAddress: string | null; requiredSigs: number | null;
  eligibleSigs: number | null; signedSigs: number | null; discoveredBy: string;
  actions: ActionRow[]; memberSigned?: boolean; roster: Array<{ pubkey: string; signed: boolean }>;
}
interface RosterSlot {
  pubkey: string; slot: number; signed: boolean; name: string | null; org: string | null;
  imageUrl: string | null; signature: string | null;
}
interface VoteDetail extends VoteListItem {
  sysfee: string; netfee: string; notes: string[]; roster: RosterSlot[]; // richer roster, overrides the list-level one
}
interface MemberRow {
  pubkey: string; name: string | null; org: string | null; url: string | null;
  imageUrl: string | null; signedCount: number; eligibleCount: number;
  firstSeenBlock: number; lastSeenBlock: number;
}
interface Summary {
  network: string; votes: number; applied: number; committeeSigned: number;
  firstBlock: number | null; lastBlock: number | null; firstTime: number | null; lastTime: number | null;
  categories: Array<{ category: string; count: number }>;
  lastRun: { startedAt: string|null; finishedAt: string|null; status: string; throughBlock: number|null; error: string|null } | null;
}
```

**Mapped against the exact fields this research was asked to check for:**

| Requested field | Present? | Where |
|---|---|---|
| Transaction hash | ✅ | `txHash` |
| Block height and timestamp | ✅ | `blockIndex`, `timestampMs` |
| Native contract and method | ✅ | `ActionRow.contract`/`contractName`/`method` |
| Decoded parameters | ✅ | `ActionRow.args` (plus an `argsComplete` flag — see caveat below) |
| VM state | ✅ | `vmState` (only `"HALT"` observed across all 34 — §12) |
| Committee threshold | ✅ | `requiredSigs` (always `11` observed — §12, no `19`-of-21 `RecoverFund`-style entry found) |
| Eligible public keys | ✅ | `roster[].pubkey` (21 per decision, every case checked) |
| Signatures mapped to public keys | ✅, **detail endpoint only** | `RosterSlot.signature` — the list endpoint's simplified `roster` omits the raw signature, only the detail endpoint (`/api/votes/{hash}`) includes it |
| Discovery method | ✅ | `discoveredBy` (always `"method"` — §6) |
| Last indexed block | ✅ | `Summary.lastRun.throughBlock` |

**One caveat found, not assumed:** `ActionRow.argsComplete` exists as its own boolean, implying the
collector itself knows some decoded-argument sets might be incomplete — no `false` value was observed
in the sample checked, but the field's mere existence is worth noting for §16's import-validation
design (never assume `args` is exhaustive without checking this flag).

---

## 6. How it discovered the 34 transactions

**Directly observed fact: every one of the 34 records carries `discoveredBy: "method"`, checked
directly for all 34, not sampled.** No record anywhere in the dataset carries any other value. That is
as far as the observation itself goes.

**What that literal string does and does not prove, kept separate:**

- **Proven:** the tracker itself labels its discovery mechanism `"method"` for every record, and never
  reports `"notification"`, `"witness-scan"`, `"shrike"`, or any other value anywhere in the dataset.
- **Independently corroborated, not merely asserted by the label:** the dataset genuinely contains
  real transactions calling methods this project's own source-verified research confirmed emit no
  notification at all — nine `setFeePerByte`/`setStoragePrice`/`setExecFeeFactor` transactions, 18
  `blockAccount`/`unblockAccount` transactions, one `setRegisterPrice`, one `setPrice` (Oracle), and
  one `setGasPerBlock` action bundled inside Proposal #12 (§9/§10). A pure notification-index approach
  could not have found these, regardless of what the backend calls itself — so *some* discovery
  mechanism broader than notification-watching is genuinely at work here, independent of trusting the
  `"method"` label at all.
- **Not established, and not inferable from the label or the corroboration above:** the tracker's
  *actual* implementation. `"method"` is a name the tracker's own frontend/API chose to expose; without
  its server-side source (§2), this research cannot confirm whether it is literally a hardcoded
  `(contract, method)` catalogue matched against decoded scripts (the mechanism
  `docs/LERIDER-SHRIKE-RESEARCH.md` §6 proposed), a broader raw-script scan that happens to report
  every hit under one label called `"method"`, or something else entirely that a maintainer chose to
  name that way. The consistency between the label and the observed silent-method coverage is
  suggestive, not confirmatory — a single self-reported string is weak evidence of implementation
  detail even when the surrounding data is consistent with it. This distinction is the reason §18 asks
  the maintainer directly rather than this document asserting an implementation.

---

## 7. How historical eligibility is reconstructed at each decision block

**It doesn't need a separate reconstruction step for one specific, narrower question — and this is a
genuinely useful methodological finding, precisely stated below.** This project's own
`scripts/fetch-council-history.mjs` reconstructs a historical committee by querying NeoToken's storage
at a past state root (`getstateroot`/`getstate`), because it needs to know who was eligible
*independent of any specific transaction* (e.g., for correlating with a `neo.community` vote or a
discussion comment at an arbitrary timestamp). This tracker doesn't have that requirement — it only
needs to know who was eligible *at the moment a transaction it already found actually executed*.

**What is cryptographically guaranteed, precisely:** `AssertCommittee` (and the standard 11-of-21
gate every method in §2.4 except `RecoverFund` uses) checks the transaction's witness against
`NEO.GetCommitteeAddress()` — a value **computed live from NeoToken's own storage at the moment the
transaction executes**, not read from the transaction itself. For the transaction to reach `HALT`,
its witness's script hash must equal that live-computed address. Because a standard 21-key,
`PUSH11`/`CheckMultisig` script's address is a one-way hash of its exact pubkey list, this means: **the
21 public keys embedded in an executed transaction's verification script are provably identical to the
actual committee as computed by consensus at that transaction's own execution block** — not
approximately, not "probably," but as a direct consequence of the witness check that had to pass for
the transaction to execute at all. This was independently confirmed in §11: for every sampled
transaction, the derived address from the transaction's own verification script matched the tracker's
reported `committeeAddress` exactly.

**What this does *not* establish, and must not be implied to establish:** eligibility *at execution*
is a different question from eligibility *during whatever earlier period signatures for that
transaction may have been collected*. If a decision's signing window spans a meaningful period before
execution (the sister document's §1.8 found a roughly nine-day window for Proposal #12), a signature
gathered early in that window was only valid participation if the signer was part of the committee
*used in the specific script that was ultimately broadcast* — and that script, by the guarantee above,
necessarily reflects the *execution-time* committee, not any earlier one. A member eligible when asked
to sign but no longer part of the committee by execution time would need an entirely different
(rebuilt) transaction to have their signature count at all; this document's per-transaction technique
cannot see that possibility, because it never observes any point in time other than the one successful,
broadcast transaction. Establishing eligibility across an extended signing window — as the sister
document's §1.8 did for Proposal #12, by independently querying the historical-committee method at
four separate timestamps and confirming no membership change occurred — is a **separate check this
tracker does not perform and this per-transaction technique cannot substitute for.**

**This is a real, useful, lower-dependency technique for one specific question** — it needs no
state-service/archival-node capability at all, only ordinary transaction history — but it only answers
"who was eligible *at this specific transaction's execution*," not "who was eligible at
2026-06-15T00:00:00Z" for an arbitrary timestamp unconnected to a known transaction, and not "who was
eligible throughout this decision's entire signing window." This project's own state-proof method
remains necessary for both of those broader questions, and the two approaches are complementary, not
competing, nor interchangeable.

---

## 8. How witness signatures are mapped to public keys — and whether it's cryptographic

**Empirically consistent with real cryptographic verification, confirmed by cross-check, not proven
from source (the server-side collector was not found — only the frontend is exposed).**

The theoretical requirement is exactly what this task described: a multisig invocation script is
just a bare sequence of raw 64-byte signatures with no embedded identity — Neo's own `CheckMultisig`
syscall determines which pubkey a given signature belongs to by a **greedy, order-preserving
cryptographic match** (walk the sorted pubkey list, test the next unconsumed signature against each
candidate pubkey in turn via real ECDSA verification, advance on a match). Reconstructing that
mapping from outside the VM requires replicating this — genuine signature verification against
candidate keys — not simply reading off a label, because none exists on-chain.

**Direct evidence this tracker does the correct thing:** its reported signature for Flamingo on
Proposal #12 (`bd211603dac834af...b4357`) is **byte-identical** to the signature this project's own
research independently derived and cryptographically verified from scratch in
`docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md` §1.5–§1.6, using a completely separate implementation
(Node's own `crypto.verify`, this project's own script). Getting the *exact same* signature assigned
to the *exact same* pubkey, via an independently-built pipeline, is strong evidence of a correct
method — a naive or broken attribution scheme would be unlikely to coincidentally reproduce the same
byte-for-byte result. This was not a one-off: the same held for all 11 on-chain-embedded members
checked for that transaction.

**What was not verified:** the tracker's actual server-side verification code. This conclusion rests
on comparing *outputs*, not auditing *implementation* — an important distinction to preserve rather
than overstate. Precisely: **"the tracker's output matched our independent verification for Proposal
#12"** is what was actually established — a single transaction, cross-checked once. It is not the same
claim as **"the tracker's unknown backend always performs cryptographic verification correctly"** —
that would require either the source code or many more independently-checked samples than this
research obtained (§11 checked five transactions for structural fields — hash, `vmstate`, method,
committee address, signature *count* — but only re-verified individual per-pubkey signature
attribution, byte-for-byte, for the one transaction, Proposal #12, this project had already done that
work for independently). One matching data point rules out gross or systematic failure for that one
case; it does not establish general correctness, and this document should not be read as claiming it
does.

---

## 9. Does the catalogue include committee-gated methods that emit no notifications?

**Yes, extensively — this is the tracker's single strongest, most independently-checkable
contribution.** This section was re-fetched and recomputed programmatically for this review (all 34
records, all 35 actions), replacing a hand-tallied breakdown in the previous draft that undercounted
(§"Arithmetic resolution" below). Cross-referencing every action against the exact notification-
emission column in `docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md` §2.4, at the transaction and action
level separately:

| Method | Emits a notification? | Unique transactions | Actions |
|---|---|---|---|
| `PolicyContract.setFeePerByte` | No | 3 | 3 |
| `PolicyContract.setExecFeeFactor` | No | 3 | 3 |
| `PolicyContract.setStoragePrice` | No | 3 | 3 |
| `PolicyContract.blockAccount` | No | 14 | 14 |
| `PolicyContract.unblockAccount` | No | 4 | 4 |
| `NeoToken.setRegisterPrice` | No | 1 | 1 |
| `OracleContract.setPrice` | No | 1 | 1 |
| `NeoToken.setGasPerBlock` | No | 1 (bundled inside Proposal #12, alongside a notifying action — see below) | 1 |
| `PolicyContract.setMillisecondsPerBlock` | Yes | 1 (Proposal #12) | 1 |
| `RoleManagement.designateAsRole` | Yes | 4 | 4 |
| **Total** | | **34 unique transactions** | **35 actions** |

**Arithmetic resolution (replacing the previous draft's "26 of 34"):** the previous breakdown — "six
fee-setting transactions, seventeen block/unblock transactions, one `setRegisterPrice`, one
`setPrice`," summing to 25 and asserted as 26 — undercounted on two independent axes, not one:

1. **The fee-setting count (`setFeePerByte`/`setExecFeeFactor`/`setStoragePrice`) omitted an entire
   date's worth of transactions.** These three methods were called together, once each, on **three**
   separate dates — 2021-08-07 (blocks 25544/25525/25249), 2021-09-13 (blocks 233142/233140/233137),
   and 2025-02-25 (blocks 6883033/6883030/6883029) — for **9** transactions total, not 6. The previous
   draft's "2021, 2025" phrasing accounted for only two dates; the entire 2021-08-07 triplet (3
   transactions) was missing from that count.
2. **The block/unblock count undercounted by one.** `blockAccount` accounts for 14 unique transactions
   and `unblockAccount` for 4, an 18-transaction total, not 17. The most probable single cause,
   identified directly in the re-fetched data: **three separate `blockAccount` transactions share the
   identical block height 5,847,960** — `0x5e5a7fbbd907a450f59d2ecfcab58b12a6f820638de9c5fadc48bb67a3795e13`,
   `0xe0c9645983a1a320f164607b07f5bcf2df5365a0167d24d4f0e04b6099f916a4`, and
   `0x525de204bddc904ecf1259a1700e36ef9c3f753ba4135e1c9d9611867b055fde` — each a distinct transaction
   hash blocking a different account in the same block, not duplicates of one another. A same-block
   grouping like this is the most plausible place a manual tally undercounts by exactly one; this
   research cannot confirm that is literally how the earlier figure was produced, only that it is the
   one place in the re-verified data where three genuinely distinct transactions could easily be
   miscounted as two.
3. **No record was found to be actually duplicated, misclassified, or missing from the tracker's own
   34-item dataset itself** — the undercount was in this document's earlier tally of that dataset, not
   in the dataset the tracker serves.

**Distinguishing transaction counts from action counts, precisely:** of the 34 transactions, **30**
contain at least one action whose method this project has independently confirmed never emits a
notification (9 + 18 + 1 `setRegisterPrice` + 1 `setPrice` + 1 for Proposal #12's `setGasPerBlock`
action = 30). Of those 30, **29** are "pure-silent" — every action in the transaction is a
non-notifying method. The 30th is **Proposal #12 itself, which is a mixed transaction**: one of its two
bundled actions (`setMillisecondsPerBlock`) emits a notification, while the other
(`setGasPerBlock`) does not — so it is not correct to call it either purely silent or purely
notification-emitting. The remaining **4** transactions (all `designateAsRole`) are pure-notification.
**29 (pure-silent) + 1 (mixed) + 4 (pure-notification) = 34, the complete, exact partition of the
dataset — this is the number that replaces "26 of 34."** A notification-only collector would have
reliably found only the 4 pure-notification transactions, would have needed to inspect *every* action
within a transaction (not just one) to fully capture the 1 mixed transaction, and would have missed the
remaining 29 entirely. This remains the clearest, most concrete confirmation available that whatever
discovery mechanism the tracker actually runs (§6) closes a real, source-confirmed gap — now stated
with an exact, re-verified count rather than an approximate one.

---

## 10. Comparison against `docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md`'s method catalogue

| Method in this project's catalogue (§2.4) | Present in the tracker's 34? |
|---|---|
| `PolicyContract.SetFeePerByte` | ✅ (2021-08 ×1, 2021-09 ×1, 2025 ×1 — 3 total) |
| `PolicyContract.SetExecFeeFactor` | ✅ (2021-08 ×1, 2021-09 ×1, 2025 ×1 — 3 total) |
| `PolicyContract.SetStoragePrice` | ✅ (2021-08 ×1, 2021-09 ×1, 2025 ×1 — 3 total) |
| `PolicyContract.BlockAccount`/`UnblockAccount` | ✅ (18 total — 14 `blockAccount` + 4 `unblockAccount`; see §9 for the exact per-transaction accounting) |
| `PolicyContract.SetMillisecondsPerBlock` | ✅ (Proposal #12) |
| `NeoToken.SetGasPerBlock` | ✅, but only bundled inside Proposal #12 — no standalone historical call found |
| `NeoToken.SetRegisterPrice` | ✅ (2025-11-19) |
| `RoleManagement.DesignateAsRole` | ✅ (all 4 events this project already knew about) |
| `OracleContract.SetPrice` | ✅ (2021-11-12) |
| `PolicyContract.SetMaxValidUntilBlockIncrement` | ❌ not present |
| `PolicyContract.SetMaxTraceableBlocks` | ❌ not present |
| `PolicyContract.SetAttributeFee` | ❌ not present |
| `PolicyContract.SetWhitelistFeeContract`/`RemoveWhitelistFeeContract` | ❌ not present |
| `PolicyContract.RecoverFund` (the 19-of-21 method) | ❌ not present |

**Absence is not evidence of non-occurrence, exactly per this task's own instruction.** Every method
in the tracker's dataset shows `requiredSigs: 11` — **not one entry anywhere shows the stricter
19-of-21 `RecoverFund` threshold** this project's own research separately confirmed exists in source.
Two explanations are equally plausible and this research cannot distinguish them: (a) `RecoverFund`
has genuinely never been invoked on mainnet (plausible — it requires an account to have sat blocked
for a full year first), or (b) this tracker's "known-method catalogue" simply doesn't include
`RecoverFund` (or the four other absent methods) in its scanned method list, in which case a real
call would be silently invisible to it — precisely the same category of gap this project's own
research already warned a method-catalogue approach could have if the catalogue itself is incomplete.
**This is listed as an open question for the maintainer (§18), not resolved here.**

---

## 11. Independent verification of a representative sample

Five transactions, chosen per this task's exact list, checked directly against
`mainnet2.neo.coz.io:443` (the same RPC node this project already trusts) — not taken on the
tracker's word for any field:

| Sample | Tx hash | Result |
|---|---|---|
| **2026 three-second block-time decision** | `0x50f683f5...b836f1` | Already fully verified independently in `docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md` §1.6; re-confirmed here that the tracker's reported signatures match that independent verification byte-for-byte (§8). |
| **2025 silent fee-setting method** (`setExecFeeFactor`, block 6,883,033) | `0xaf862698...c9eb5b` | `vmstate: HALT` ✅. Script contains `setExecFeeFactor` ✅. **Two witnesses** found: a 1-of-1 fee-payer witness, then a 21-key/11-signature committee witness whose derived address (`NQpa6FUXz8SQQH1pV6pWvs8BmwSjbuaK53`) exactly matches the tracker's `committeeAddress` ✅. |
| **One role designation** (block 7,438,313) | `0xf62caf49...bf8c8b` | Already independently verified in prior research (§6.2); re-confirmed the derived committee address (`NcVB6Yvz3Vk2EeiHVSQbHptEUdwagkrs6g`) exactly matches the tracker's claim, this time checked directly rather than only the pubkey set ✅. |
| **One account unblock** (block 6,204,942) | `0xb8123378...90b804` | `vmstate: HALT` ✅. Script contains `unblockAccount` ✅. Same two-witness shape; derived committee address (`NPg4FtSPaz9F3dX3epwUjppv9vDJir4HdG`) matches exactly ✅. |
| **One early-2021 decision** (block 1,288, `designateAsRole`→Oracle) | `0x5253e99c...32f25c` | `vmstate: HALT` ✅. Script contains `designateAsRole` ✅. Same two-witness shape; derived committee address (`NUHayh6vcgu2uupeDWJ6tjoSwW8qoP73bA`) matches exactly ✅ — checked directly against `/api/summary`'s own `firstBlock: 1288`, this is the tracker's **oldest** record (not "second-oldest," corrected from an earlier pass of this document — block 1,305, also `designateAsRole`, same day, is the second-oldest), and it still checks out precisely. |

**5 of 5 sampled transactions matched on every independently-checkable field — structural fields only
(hash, `vmstate`, method presence, derived committee address, signature count), re-verified fresh for
this review.** Per-pubkey signature *attribution* (which specific signature belongs to which specific
key) was independently re-derived byte-for-byte for only one of these five, Proposal #12, using this
project's own prior cryptographic work (§8) — the other four were not re-checked at that level of
detail in either pass. The consistent two-witness structure across four of the five samples (everything
except Proposal #12, already separately verified as a single-witness case) is itself a useful,
generalizable finding: **a future collector must scan every witness on a transaction for a
committee-shaped verification script, never assume it's at a fixed index.**

---

## 12. Data-quality checks

- **Duplicate transactions:** none — all 34 `txHash` values are unique, checked directly.
- **Multiple method calls bundled into one transaction:** yes, observed and handled correctly —
  Proposal #12 (`0x50f683f5...`) carries two `ActionRow` entries (`setMillisecondsPerBlock` and
  `setGasPerBlock`) under one `txHash`, matching this project's own independent decoding of that same
  script.
- **Failed transactions:** none found — every one of the 34 shows `vmState: "HALT"` and
  `applied: true`. **Whether this is because no committee-authorized attempt has ever failed on
  mainnet, or because the collector's own discovery method silently filters to successful executions
  only, could not be determined from outside** — flagged as an open question (§18), not resolved.
- **Non-Council multisigs accidentally included:** none found in the 5 independently re-verified
  samples (§11) — every derived committee address in the sample matched a real, correctly-shaped
  21-key verification script, not some unrelated multisig.
- **Incorrect signer attribution:** none found — the one case checkable against this project's own
  independent work (Proposal #12) matched exactly, signature-for-signature (§8).
- **Incorrect historical committee membership:** none found — every sampled transaction's derived
  committee address matched the tracker's claim exactly (§11), and per §7's precise statement of the
  guarantee, the *at-execution* membership claim is hard for a collector to get wrong, since it's read
  directly off the executed transaction's own witness rather than independently recomputed. This does
  not extend to eligibility during any earlier signing window (§7's caveat) — no such window was
  checked for any sample here beyond Proposal #12, which the sister document already checked (§1.8).
- **Total unique public keys ever appearing across all 34 rosters: exactly 50** — computed directly by
  taking the union of every `roster[].pubkey` across all 34 records, and cross-checked against
  `/api/members`, which independently returns exactly 50 `MemberRow` entries. Both counts agree, which
  is itself a basic internal-consistency check the tracker passes: `/api/members` should be, and is,
  exactly the set of keys that ever appear in `/api/votes`' rosters, no more and no fewer.
- **Missing known transactions:** the RoleManagement events are all four this project already knew
  about, with no fifth found — consistent. Five whole *methods* from this project's own catalogue are
  absent entirely from the tracker's 34 (§10) — genuinely unresolved, not dismissed.
- **A minor cosmetic inconsistency, reported plainly:** one member's avatar image is served from
  `cdn.ndapp.org` (no `staging.` prefix) while every other member's avatar and this whole site use
  `cdn.staging.ndapp.org` — a small environment-labeling inconsistency, most likely meaningless, noted
  because the task asked to report exactly this category of thing rather than silently smooth it over.
- **The "?" marks seen on the compact roster grid for the two earliest (2021-08-02) decisions**
  are **not** an eligibility or signing-status ambiguity — checked directly against the raw JSON: the
  underlying `signed` field is a clean `true`/`false` for every one of those 21 slots, with real
  64-byte signatures present for the signing ones. The "?" corresponds to `name: null` /
  `imageUrl: null` — **14 of 21 pubkeys for that earliest decision have no identity mapping at all**
  in this tracker's own name/org registry (presumably long-inactive 2021-era committee members). A
  real, honest identity-resolution gap, not a data-quality defect in the signing determination itself.

---

## 13. What the participation figure actually measures

**Every count this tracker exposes — `signedSigs`/`eligibleSigs` per decision, and
`signedCount`/`eligibleCount` per member in `/api/members` — measures exactly one thing: whether that
member's public key is embedded in the *executed, broadcast* transaction's witness.** It must be
described that way and no more expansively:

- It is **not** a measure of agreement — there is no on-chain "against" signal in this mechanism at
  all (same limitation this project's own research already established).
- It is **not** a measure of attendance or awareness — a member absent from the witness may have
  declined, never been asked, been unreachable, or simply not been needed once quorum was reached by
  others (the exact AxLabs/NGD8 case, §"Headline findings" #5).
- It is **not** complete voting participation — because signature collection stops once the 11-of-21
  threshold is reached, a member's absence from the *executed* witness proves nothing about whether
  they were ever asked or would have signed. This tracker has no way to represent "signed off-chain,
  not included" as a distinct state at all — everything not in the final witness reads identically as
  `signed: false`, which is **coarser** than this project's own five-state model (§3 of
  `docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md`), not an equivalent alternative to it.

**Precise description to use if this tracker's data is ever surfaced in Quorum Watch:** "included in
the executed witness for this decision" — never "voted," "participated," or "signed" unqualified.

---

## 14. Update cadence, staging permanence, and a production URL

- **Update cadence:** `Summary.lastRun` was checked twice on 2026-09-12, roughly 20 minutes apart, for
  this review — first showing a run through block 13,167,244, then (on the re-check performed for this
  accuracy pass) a **newer** run, `startedAt`/`finishedAt` both `2026-09-12T13:57:2{0,3}Z`, indexing
  through block **13,167,626**, against this project's own freshly-checked live chain tip of
  **13,167,759** at that same moment — **132 blocks** behind. The run itself completing in ~2-3 seconds
  both times, combined with a genuinely later `lastRun` on the second check, is direct, repeated
  confirmation of an automated, recurring refresh (not a one-time snapshot check on this research's
  first visit) — though the exact schedule is not published anywhere found.
- **Staging permanence:** the subdomain is explicitly named `staging-council-vote-tracker.ndapp.org`
  — by its own naming convention this reads as a pre-production environment, not a durable public
  URL. Nothing on the site itself states an intended lifetime, deprecation date, or promotion plan.
- **A production URL:** not confirmed either way. Given the explicit "staging" naming and the
  existing `ndapp.org` parent domain already being a live, real site, a production rollout (e.g. at
  `council-vote-tracker.ndapp.org` or integrated into `ndapp.org` itself) is a reasonable guess, not
  a confirmed plan — this is one of §18's direct questions.

---

## 15. Should Quorum Watch consume it directly, import it, reproduce it, or use it only for discovery?

**Recommendation: treat it right now as a strong discovery source, feeding this project's own
independent verification pipeline. Do not consume its API directly as a trusted source of truth while
it remains undocumented, privately maintained, and served from a staging domain. Whether to eventually
reproduce its collector is left open, not decided, pending three specific unknowns this research could
not resolve.**

Reasoning, weighing the options this task asked to compare:

- **Consuming its API directly, unverified:** rejected, for as long as current conditions hold. It's
  an unauthenticated staging service with no published stability guarantee (§2, §14), no source code
  to audit (§2), and a coarser identity model than this project already requires (§13) — the same
  category of standing risk this project already documents for every other undocumented third-party
  API it touches (`docs/DECISIONS.md`, 2026-09-02). This conclusion does not depend on any doubt about
  its data quality — it would hold even if every one of its 34 records were perfect, because the risk
  being avoided is dependence on a private, unversioned, staging-hosted service, not a data-accuracy
  concern.
- **Reproducing its collector from scratch:** **left open, deliberately not resolved either way.**
  Five matching samples (§11) is evidence the tracker's *outputs* are trustworthy for what was
  checked — it is not evidence about whether *this project* should build its own independent
  implementation of the same discovery technique. That is a build-vs-depend engineering decision that
  turns on three things this research could not establish: (1) **catalogue completeness** — whether
  the five methods absent from its 34 records (§10) are genuinely never-invoked or simply uncatalogued,
  which bears directly on whether the tracker's discovery method, whatever it is, is safe to depend on
  going forward; (2) **source availability** — whether a public repository for the actual collector
  (`council-vote-tracker`, distinct from the `-web` frontend, §2) ever surfaces, which would let this
  project audit rather than merely output-check it; (3) **service permanence** — whether this stays a
  staging deployment indefinitely, moves to a stable production URL, or disappears (§14). None of these
  three is answerable from the frontend alone; §18's priority questions ask about all three directly.
  Reproducing the collector remains a live, undecided option — not ruled in or out here.
- **Periodically importing and independently validating its data:** **recommended as the concrete
  interim step**, regardless of how the reproduce-vs-depend question above eventually resolves. Treat
  every `txHash` it lists as a *candidate lead*, then run this project's own existing verification
  method (exactly §11's process — `getrawtransaction`, decode every witness, derive the committee
  address, cross-check against `scripts/fetch-council-history.mjs` where a timestamp-based eligibility
  question is needed) before anything derived from it is ever published. Never publish its
  `signedCount`/`eligibleCount` figures directly — always re-derive per this project's own five-state
  model.
- **Using it only as a discovery source, nothing else:** the safe floor, and a reasonable fallback if
  periodic re-validation isn't built right away — its `/api/votes` feed is, at minimum, an excellent,
  already-largely-verified list of "here are transaction hashes worth checking," which is real,
  usable value even before any deeper integration is built.

---

## 16. Proposed fail-closed import schema and validation procedure

A **proposal only** — nothing here was built or run against this project's own data:

```json
{
  "schemaVersion": 1,
  "source": "ndapp-council-vote-tracker",
  "sourceUrl": "https://staging-council-vote-tracker.ndapp.org/api/votes/{txHash}",
  "sourceCollectedAtUtc": "2026-09-12T00:00:00.000Z",
  "sourceLastRun": { "throughBlock": 13167244, "status": "ok" },
  "items": [
    {
      "txHash": "0x50f683f5db177d2e23d11882c411e5cec37c446213d9cea3174d9ad30db836f1",
      "blockIndex": 9246921,
      "sourceClaim": { "committeeAddress": "NeWfLvaPzHZFoGbianvK8wJBqkwGucjeHZ", "requiredSigs": 11, "eligibleSigs": 21, "signedSigs": 11 },
      "independentVerification": {
        "method": "getrawtransaction + witness decode, per docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md §1.6",
        "verifiedAtUtc": "2026-09-12T00:00:00.000Z",
        "vmStateMatches": true,
        "scriptMethodMatches": true,
        "derivedCommitteeAddressMatches": true,
        "signatureCountMatches": true,
        "signatureCryptoVerified": true,
        "result": "verified"
      },
      "publicKeyStates": [
        { "publicKey": "031de8a7...", "state": "included-in-executed-witness" },
        { "publicKey": "02ec143f...", "state": "no-verifiable-signature-found" }
      ],
      "quarantine": null
    }
  ]
}
```

**Validation procedure, fail-closed throughout, consistent with this project's stable-public-key and
effective-date rules:**

1. **Never trust `sourceClaim` fields directly.** Every `txHash` is a lead only. Fetch the transaction
   independently via this project's own trusted RPC nodes and re-derive every field in
   `independentVerification` from scratch (§11's exact method).
2. **If independent verification disagrees with the source's claim on any field** (committee address,
   signature count, VM state, method name) — **quarantine that item**, do not publish it, and do not
   silently prefer either source. This mirrors the quarantine model already designed for other
   sources in this project's research (`docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md` §6-equivalent
   pattern).
3. **Map every public key to this project's own five-state model** (`docs/COUNCIL-VOTING-MECHANISMS-
   RESEARCH.md` §3), never the tracker's own binary `signed`/not-`signed` — specifically, never
   collapse "additional signature recorded off-chain" into "no verifiable signature found" the way
   the tracker itself does (§5, §13).
4. **Resolve identity by stable public key only**, matched against this project's own
   `data/council-roster.json` and `scripts/fetch-council-history.mjs` — never adopt the tracker's own
   `name`/`org` fields as authoritative, since they're independently maintained and were observed to
   be incomplete for older members (§12).
5. **If the source becomes unreachable, or its staging URL disappears entirely** (a real risk per
   §14) — fail closed, keep serving the last independently-verified snapshot, and stop treating it as
   a discovery source until a replacement URL is confirmed. Never let a lost discovery source silently
   shrink what's already been independently verified and published.

---

## 17. Keeping four things separate

- **The underlying Council decision** — the executed, on-chain multisig transaction. This tracker's
  `txHash`/`vmState`/`actions` represent this directly, and (per §11) do so accurately in every
  sample checked.
- **Discussion or temperature voting** — `neo.community` proposals. This tracker has no concept of
  this category at all; it is purely on-chain.
- **Off-chain signatures collected but not broadcast** — the AxLabs/NGD8 case. **This tracker cannot
  represent this category by design** (§5, §13) — it only ever reads chain data, so a signature that
  never reached the chain is invisible to it, indistinguishable from a signature that was never
  produced at all.
- **Signatures included in the executed transaction** — exactly what this tracker measures, and the
  only one of the four categories it can speak to with any confidence.

---

## 18. Questions for Lopes, `ndapp.org`, or the tracker's maintainer

Kept short and genuinely unresolved — none of these are guessed at above. Split into what should go in
a first message, and what only matters once a maintainer is actually confirmed.

### Priority questions — suitable for the first message

These three were chosen because each one directly gates a decision in §15 that this research
otherwise cannot make on its own:

1. **Is there a public source repository for `council-vote-tracker`** (the backend package this
   frontend depends on, §2), even if the frontend package itself (`council-vote-tracker-web`) stays
   private? *(Gates §15's source-availability unknown — the single highest-value answer, since it
   would let this project audit rather than only output-check the collector.)*
2. **What exactly does `discoveredBy: "method"` mean in the collector's own terms** — is it a
   hardcoded list of `(contract, method)` pairs scanned against raw transaction scripts (as
   `docs/LERIDER-SHRIKE-RESEARCH.md` §6 proposed), and if so, is `RecoverFund` (the 19-of-21
   `AssertAlmostFullCommittee` method), `SetMaxTraceableBlocks`, `SetMaxValidUntilBlockIncrement`,
   `SetAttributeFee`, or `SetWhitelistFeeContract`/`RemoveWhitelistFeeContract` included in that
   catalogue, or simply not yet added? *(Gates §10/§15's catalogue-completeness unknown — the direct,
   answerable resolution to the one open discrepancy this research could not close from outside.)*
3. **Is there a plan to move this off the `staging-` subdomain to a durable, versioned production
   URL, and would the current API route shapes (`/api/summary`, `/api/votes`, `/api/members`) be
   expected to stay stable through that move?** *(Gates §14/§15's service-permanence unknown — whether
   any dependency on this service at all is currently advisable.)*

### Secondary questions — only if Lopes is the maintainer, or directs us to one

1. Are you (or is `lopescode`/"Lopes") the author or a contributor to this tracker, and is it related
   to Shrike (`github.com/EdgeDLT/shrike`), which shares a contributor with this same name?
2. Does the collector ever encounter a committee-authorized call that fails (`vmState` other than
   `HALT`), and if so, is it deliberately excluded from `/api/votes`, or has one genuinely never
   occurred on mainnet?
3. Does discovery rely on Shrike, a custom NeoGo-based indexer, or another backend entirely?
4. How is the `name`/`org` identity mapping in `/api/members` maintained, and is there a reason 14 of
   21 keys have no identity for the earliest (2021-08-02) decisions — is that mapping expected to be
   extended for historical/inactive members, or intentionally limited to currently-relevant ones?

---

## 19. Implementation-readiness verdict

- **Verified strongly enough to use now, as a discovery mechanism only:** the `/api/votes` and
  `/api/members` endpoints, treated purely as a source of candidate transaction hashes to check —
  never as a source of trusted `committeeAddress`, `signedSigs`, `eligibleSigs`, or per-pubkey
  `signed`/`signature` values without independent re-derivation. Basis: 34/34 unique-hash check (§12),
  category totals matching `/api/summary` exactly (34 = 18+11+4+1), 50/50 pubkey-count agreement
  between `/api/votes` rosters and `/api/members` (§12), and 5/5 sampled transactions matching on every
  independently-checked structural field (§11).
- **May only be used as a discovery lead, not yet as a validated data source:** every specific
  quantitative claim the tracker makes about a given decision — `committeeAddress`, signature counts,
  per-pubkey `signed` status — until this project's own §16 verification procedure has actually been
  run against it. Five samples out of 34 is not a completed validation pass over the dataset; it is
  evidence the *method* the tracker likely uses is sound, not proof every remaining record is correct.
- **Remains blocked pending a maintainer answer:** any decision to (a) depend on this API directly in
  production, (b) reproduce its collector, or (c) treat its 34-item catalogue as anywhere near
  complete. All three are blocked on the three priority questions in §18 — source availability,
  catalogue completeness, and service permanence — none of which this research could resolve from the
  frontend alone.
- **Whether a Council participation percentage can be defensibly produced from these executed
  witnesses: no, not from this tracker's data alone, and this conclusion is unchanged by anything
  found in this review pass.** The tracker's own `signedSigs`/`eligibleSigs` counts measure inclusion
  in an *executed* witness only (§13) — they cannot distinguish "declined," "never asked," "not needed
  once quorum was reached," or "signed off-chain but not broadcast" (§5, §13, §17), and the underlying
  method catalogue is not established as complete (§10, §18). Combining these into a single percentage
  would misrepresent all of the states this project's own five-state model (`docs/COUNCIL-VOTING-
  MECHANISMS-RESEARCH.md` §3) exists specifically to keep separate. This tracker's data, once
  independently re-verified per §16, is suitable as **one input into the "Executed Council approvals"**
  raw-count category already recommended in the sister document's §5 — not as a percentage, and not on
  its own.

---

## Sources

- `https://staging-council-vote-tracker.ndapp.org/` — rendered page, retrieved 2026-09-12
- `https://staging-council-vote-tracker.ndapp.org/api/summary`,
  `/api/votes?limit=50&offset=0`, `/api/votes/{txHash}` (four hashes fetched in detail),
  `/api/members` — retrieved 2026-09-12, and **re-fetched a second time the same day for this
  accuracy-review pass**, computing every count in §9/§10/§12 programmatically from the full 34-item
  `/api/votes` response (35 actions) rather than by hand-tally
- `https://mainnet2.neo.coz.io:443` JSON-RPC `getblockcount` — re-queried during this review pass
  (result: 13,167,759) to refresh the freshness cross-check in §14
- `https://staging-council-vote-tracker.ndapp.org/src/api.ts`, `/src/App.tsx`, `/src/explorers.ts`,
  `/package.json`, `/` (served via Vite's dev server, including embedded source maps) — retrieved
  2026-09-12
- `https://mainnet2.neo.coz.io:443` JSON-RPC (`getrawtransaction`, `getblockcount`) — the same RPC
  node already trusted by `scripts/fetch-council-history.mjs` — queried directly for 5 independent
  transaction verifications and one current-chain-tip check, 2026-09-12
- Web search identifying `ndapp.org`, and identifying `github.com/lopescode` (Lopes) via his
  contribution to `github.com/EdgeDLT/shrike` — retrieved 2026-09-12
- `https://github.com/lopescode?tab=repositories` — retrieved 2026-09-12
- `docs/COUNCIL-VOTING-MECHANISMS-RESEARCH.md`, `docs/LERIDER-SHRIKE-RESEARCH.md`,
  `data/council-roster.json`, `scripts/fetch-council-history.mjs` (this repository) — cross-referenced
  throughout, checked 2026-09-12
