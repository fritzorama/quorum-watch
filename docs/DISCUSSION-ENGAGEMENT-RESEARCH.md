# Discussion engagement — research findings

**Status: research only. No application code, script, or frontend was modified. No collector was
implemented. Nothing was committed or pushed.**

**Revision note (this pass):** a second Codex review found five further problems in the previous
revision — an eligibility rule that quarantined things that were merely ineligible, not conflicting;
a coverage denominator built on proposal-open timestamps alone, which isn't actually a fair
"opportunity to comment" window; publication behavior that let a single new `unreviewed` proposal
block unrelated already-approved updates (directly contradicting this same document's own claim that
Proposal #6 wouldn't block the pilot); an insufficiently justified `test` classification for
Proposal #2; and a schema that didn't name its eligibility/conflict states precisely. All five are
corrected in place below.

Retrieved 2026-09-07 against: the public `neo-governance-api.flamingo.finance` API (same
undocumented-but-public API `scripts/fetch-governance.mjs` already depends on); the live
`neo.community` site; `data/governance.json` and `data/council-history.json` in this repository; and
web search for adjacent venues. Every claim is either a quoted primary source, an explicit
assumption, or an explicit unverifiable/ambiguous item.

---

## Headline finding (still the right starting point)

`neo.community`'s own proposal pages have a native, per-proposal comment system, exposed on the same
public API this project already polls for votes (`proposal/get?proposal_id=...` returns
`messages[]` and `proposer_org_id`), attributed by the same `organization_id` identity system
already used for governance votes. No GitHub-handle mapping is needed for this pilot.

Working proposal set after this revision (§4 changes Proposal #2):

| # | Title | `message_count` | Classification (recommended, unapproved) |
|---|---|---|---|
| 1 | Debug proposal | 5 | `test` |
| 2 | Ended proposal | 0 | `unreviewed` — **changed this pass, see §4** |
| 3 | This will be replaced | 0 | `test` |
| 4 | This replaces Prop #3 | 12 | `test` |
| 5 | European Neo developer hub pilot | 13 | `real` |
| 6 | First time to neo.community governance platform MVP?... | 1 | `unreviewed` |
| 7 | Competitive Fee and Blocktime Enhancements | 0 | `real` |

Source: `https://neo-governance-api.flamingo.finance/proposal/get?proposal_id={id}` for each of the
seven proposal IDs in `data/governance.json`, retrieved 2026-09-07.

---

## 1. Correction: eligibility handling

**The error:** the previous revision treated "eligible when the proposal opened, but not eligible
when this specific comment was posted" as a *conflict* requiring quarantine. That's wrong. Losing a
Council seat and then commenting anyway is not tampering, data corruption, or an identity mismatch —
it's an ordinary, expected thing to observe in a durable public record. Quarantine should be reserved
for evidence that something about *our own collected record* is unreliable, not for evidence that
someone acted outside the window we'd like them to have acted in.

**Corrected rule — every item (an authored proposal or a comment) gets exactly one eligibility check,
against its own natural timestamp** (a comment's `created_at`; a proposal's `created_at` for the
authoring org, since authorship happens at the moment of creation):

- **`eligible`** — the org's public key was present in the verified historical committee at that
  timestamp (same method as `scripts/fetch-council-history.mjs`). The item is **eligible evidence**
  and counts toward the org's published figures (§2).
- **`ineligible`** — the org's public key was *not* present in the committee at that timestamp. The
  item is preserved in full (§5's schema) as **ineligible evidence** and is explicitly **excluded**
  from Council engagement figures. **This is not a quarantine.** No human review is required to
  reach this state; it's a normal, expected classification outcome, exactly as unremarkable as a
  member simply not commenting at all.
- Quarantine is reserved for a different, narrower set of problems — see §5/§6: the item's own
  record has **mutated** since we last saw it, or its **organization/public-key identity cannot be
  reconciled** at all (an `organization_id` that doesn't resolve to any known org, which is a mapping
  failure, not an ineligibility finding).

**Correcting the false claim that this "doesn't arise":** the previous revision said a member
gaining a seat after a proposal opens means the question of whether their later comment counts
"doesn't arise," because the proposal wasn't in their denominator. That reasoning was smuggling
proposal-open eligibility back in as a gate on *comments*, which is exactly the error. It absolutely
can arise, plainly:

- **A member can join the Council after a proposal opens and comment while it's still open.** Their
  comment is evaluated at its own timestamp; if they hold the seat at that moment, it is `eligible`
  evidence — full stop, regardless of when the proposal itself opened. Proposal-open timing is no
  longer part of this check at all (§2 explains why the old model conflated two different questions).
- **A member can leave the Council and then comment anyway.** That comment is evaluated at its own
  timestamp, found `ineligible`, preserved, and excluded — never quarantined.
- **A member can comment on an older, still-open proposal shortly after joining.** Same rule: their
  comment's own timestamp is what's checked, not the proposal's age.

None of these require quarantine. They require an accurate `eligible`/`ineligible` label on the item
and nothing more.

---

## 2. Correction: the coverage denominator is not yet buildable — publish raw facts instead

**The error:** the previous revision defined "commented on X of Y eligible real proposals" using
*proposal-opening* Council membership as the sole basis for Y. That is not the same question as "did
this org have a fair opportunity to comment," and treating them as the same thing is exactly the
mistake §1 corrects for individual items. A genuine opportunity-to-comment window would need to
account for all of the following — and, having actually checked, this project's current data does
**not** support building one yet.

**What a fair opportunity window would need, and what we actually have:**

| Requirement | What exists today |
|---|---|
| When did the org's seat begin? | `scripts/fetch-council-history.mjs` only checks eligibility **at chosen timestamps** (a proposal's open time, or an item's own time) — it does not locate the exact block where a seat *began* or *ended*. We know "eligible at point T," not "eligible continuously from T1 to T2." |
| When did the org's seat end (if it did)? | Same gap — no continuous interval, only point checks. |
| When was the comment facility publicly available? | One real, checked data point: Proposal #7's rendered page shows *"The deadline for commenting on this proposal has passed"* next to a deadline of `Sat Mar 28 2026 00:59:59 GMT+0100` — which is exactly `endsAt` (`2026-03-27T23:59:59` UTC) from `data/governance.json`, converted to CET. This is real evidence that `endsAt` gates commenting, at least for this one proposal. It has **not** been checked across all seven proposals, and it is an assumption (not confirmed) that the window's *opening* is exactly `createdAt` with no earlier/later adjustment, or that a proposal can't have its comment window closed early or reopened. |
| What happens for a proposal with no closing timestamp at all? | Every proposal in the current checked-in set happens to have an `endsAt` value. A future proposal might not. If it doesn't, there is no basis at all for bounding that proposal's window — not even the one data point above would apply. |

**Conclusion: do not publish an X/Y coverage rate or percentage for this pilot.** The honest
statement is that this project can reliably compute *item-level* eligibility (§1), but not yet a
*continuous opportunity window* per org per proposal — those are different capabilities, and only
the first one exists today. Manufacturing a denominator from the proposal-open timestamp alone (the
previous revision's approach) would present a specific number as fair when it isn't demonstrably so.

**What can be published instead — three raw, independently true facts, each counting only
`eligible`-evidence items (§1) on `real`-classified proposals (§4):**

1. **Proposals authored while eligible** — count and list.
2. **Recorded comments made while eligible** — count and list.
3. **Distinct real proposals commented on while eligible** — count and list (how many different
   `real` proposals produced at least one `eligible` comment from this org; a proposal with one such
   comment and one with ten both contribute exactly 1).

**No denominator, no percentage, no combined score.** These are the same three kinds of fact the
previous revision reported, just no longer expressed as "X of Y" — because Y was never actually
defensible. This also directly answers Codex's six specific scenarios:

- **Joining after a proposal opens:** no longer relevant to whether a later comment counts — only
  that comment's own timestamp matters (§1).
- **Leaving before discussion ends:** any comment after leaving is `ineligible`, excluded, not
  quarantined (§1).
- **Comment facility availability while holding a seat:** the missing piece that blocks a real
  opportunity-based rate — see the table above.
- **Proposals with no explicit closing timestamp:** would have an entirely unbounded window; no rate
  should be attempted for such a proposal even in a future slice that otherwise solves the rest of
  this.
- **Comments after leaving:** `ineligible`, preserved, excluded (§1).
- **Comments after joining, on an older still-open proposal:** `eligible`, fully counted (§1) —
  this is the scenario the previous revision incorrectly said "doesn't arise."

---

## 3. Correction: `unreviewed` must not block unrelated approved updates

**The error:** the previous revision's automation layer said *any* new `unreviewed` proposal
"blocks automatic publication until resolved" — the same treatment as an actual quarantine. That
directly contradicts this document's own repeated claim that Proposal #6 remaining `unreviewed`
"does not block the pilot." Both statements can't be true at once; the automation description was
wrong, not the Proposal #6 claim.

**Corrected behavior:**

- A new proposal is **automatically collected and preserved** — its evidence (messages, authorship)
  is fetched and stored exactly like any `real` proposal's, in full, per §5's schema.
- It is **excluded from every displayed calculation** (§2's three facts never include it) until a
  human reclassifies it.
- Its presence **surfaces a `review required` status** — visible, but not a blocker.
- **Updates to already-`real` proposals continue to publish normally.** If Proposal #5 gets a new
  comment tomorrow, that comment is collected, checked for eligibility, and published in the next
  candidate snapshot — a brand-new `unreviewed` Proposal #8 appearing in the same run does not hold
  that update back.
- **Human approval is required only for one specific transition:** moving a proposal from
  `unreviewed` to `real` or `test`. Nothing else about `unreviewed` requires a human in the loop.
- **A genuine quarantine event (§1, §5, §6) still blocks the entire candidate snapshot** — that
  part of the previous design was correct and is unchanged. The fix here is narrowly about
  `unreviewed` proposals, which are not conflicts and should never have been treated like one.

This resolves the contradiction: Proposal #6 (and now #2, §4) can sit `unreviewed` indefinitely,
fully preserved and clearly flagged as needing review, while Proposal #5's and #7's already-`real`
figures keep updating on every run.

---

## 4. Correction: Proposal #2 becomes `unreviewed`, not `test`

**The error:** classifying #2 as `test` rested entirely on the *absence* of evidence — zero votes,
zero comments — plus a title ("Ended proposal") that is ambiguous rather than clearly a platform-test
label the way "Debug proposal" or "This will be replaced" are. Absence of activity is not the same
kind of evidence as the *positive* test content found on #1 and #4 (literal strings like `"test test
test"`, six near-duplicate posts in 77 seconds). A proposal nobody happened to discuss is not
automatically a fake one.

**Corrected recommendation:**

| # | Title | Recommended | Evidence for this pass |
|---|---|---|---|
| 2 | Ended proposal | **`unreviewed`** | Title is ambiguous (could be a real proposal that simply ended with no engagement, or a platform placeholder — no way to tell from what's available). Zero votes and zero comments (`data/governance.json`, retrieved 2026-09-07) are preserved as the complete evidence record, but they are absence-of-evidence, not positive test content. Requires either stronger evidence (e.g., confirmation from someone who worked on the platform, or discovery of some other signal) or an explicit user judgment call before it becomes `test` or `real`. |

Proposals #1, #3, #4 keep their `test` recommendation from the previous revision — their evidentiary
basis (title *and* positive message/status content agreeing) is unchanged and unaffected by this
correction. Proposal #6 keeps its `unreviewed` recommendation, unchanged. The working proposal set is
now: `real` = {5, 7}; `unreviewed` = {2, 6}; `test` = {1, 3, 4}.

---

## 5. Corrected audit schema

```json
{
  "schemaVersion": 2,
  "fetchedAt": "2026-09-07T00:00:00.000Z",
  "collectedAtUtc": "2026-09-07T00:03:12.481Z",
  "method": "neo-community-proposal-messages",
  "collectionStatus": "ok",
  "proposalClassifications": [
    { "proposalNumber": 1, "proposalId": "69243355008ce4201f06946b", "status": "test",
      "recommendedBy": "research-pass-2026-09-07", "approvedBy": null,
      "evidence": "Title \"Debug proposal\"; all 5 messages are literal platform-test strings." },
    { "proposalNumber": 2, "proposalId": "692433721ea69cca3a40afa0", "status": "unreviewed",
      "recommendedBy": null, "approvedBy": null,
      "evidence": "Zero votes, zero comments, ambiguous title — absence of evidence only. See docs/DISCUSSION-ENGAGEMENT-RESEARCH.md §4." },
    { "proposalNumber": 6, "proposalId": "692dbc8fe505a19890ccce5b", "status": "unreviewed",
      "recommendedBy": null, "approvedBy": null,
      "evidence": "Contested — title says \"test\" but carries real votes and a real comment. See §4 of the prior revision (renumbered)." }
  ],
  "sources": {
    "messagesApi": "https://neo-governance-api.flamingo.finance/proposal/get?proposal_id={id}",
    "eligibilityMethod": "scripts/fetch-council-history.mjs (historical committee at each item's own timestamp)",
    "classificationFile": "human-reviewed, checked into git; see docs/DECISIONS.md for the approval record"
  },
  "items": [
    {
      "itemId": "8ca2a830-6732-4f7b-ad0c-45c64555c66a",
      "evidenceType": "comment",
      "proposalNumber": 5,
      "proposalId": "69245578684209924c5fbe0b",
      "proposalStatus": "real",
      "organizationIdRaw": "68ef43be9765e8c33f3b1039",
      "publicKey": "031de8a766da668b2935351acd8f23c26dbedd54b8208b135f0a636b544c9e0dad",
      "authorUsername": "atlazor",
      "createdAtUtc": "2025-11-25T20:06:40.825Z",
      "contentHash": "sha256:1f3c9a...redacted-for-brevity",
      "contentLength": 743,
      "isReaction": false,
      "eligibilityResult": "eligible",
      "eligibilityEvidence": {
        "checkedAtUtc": "2025-11-25T20:06:40.825Z",
        "blockHeight": 8398112,
        "stateRoot": "0x...",
        "method": "fetch-council-history.mjs, item's own created_at"
      },
      "sourceUrl": "https://neo.community/proposals/69245578684209924c5fbe0b",
      "collectedAtUtc": "2026-09-07T00:03:12.481Z"
    },
    {
      "itemId": "example-ineligible-comment",
      "evidenceType": "comment",
      "proposalNumber": 5,
      "proposalStatus": "real",
      "organizationIdRaw": "68f5fda72dafd413c4109a62",
      "publicKey": "03fd04de983f4e04c9629ab3cfc83f41be7431b96bf852a91873c38ca8f737ee2c",
      "createdAtUtc": "2026-04-01T00:00:00.000Z",
      "contentHash": "sha256:...",
      "isReaction": false,
      "eligibilityResult": "ineligible",
      "eligibilityEvidence": {
        "checkedAtUtc": "2026-04-01T00:00:00.000Z",
        "blockHeight": 9000000,
        "stateRoot": "0x...",
        "method": "fetch-council-history.mjs, item's own created_at"
      },
      "note": "Illustrative only — not a real message. Shows an org's key absent from the committee at this timestamp: preserved, excluded from figures, not quarantined."
    }
  ],
  "quarantine": [],
  "perMember": [
    {
      "publicKey": "031de8a766da668b2935351acd8f23c26dbedd54b8208b135f0a636b544c9e0dad",
      "name": "Flamingo",
      "proposalsAuthoredWhileEligible": 0,
      "recordedCommentsWhileEligible": 2,
      "distinctRealProposalsCommentedOnWhileEligible": 1
    }
  ]
}
```

**The five states Codex asked for, and where each lives:**

- **`eligible`** and **`ineligible`** — `items[].eligibilityResult`. Both are normal outcomes. Only
  `eligible` items count toward `perMember` figures; `ineligible` items are fully preserved and
  visible in `items[]`, just never summed.
- **`identity-conflict`** — a quarantine reason (§6): the same `itemId` previously resolved to one
  `organizationIdRaw`/`publicKey` and now resolves to a different one, **or** an `organizationIdRaw`
  doesn't resolve to any organization in the governance API's own table at all (an irreconcilable
  mapping, not an ineligibility finding).
- **`source-mutation`** — a quarantine reason (§6) covering the same `itemId` disappearing, its
  `contentHash` changing, or its `createdAtUtc` changing, relative to the last approved snapshot.
- **`collection-failure`** — `collectionStatus` at the top level (or, if a partial fetch is possible,
  attached to the specific proposal that failed to load): the fetch attempt itself didn't succeed.
  This is explicitly **not** a per-item eligibility or quarantine finding — no prior evidence is
  implicated, nothing has mutated, there's simply nothing new to evaluate this run. Handled exactly
  like `fetch-uptime.mjs`/`fetch-council-history.mjs` already handle any other source outage: fail
  this run closed, keep serving the last good snapshot, retry later.

**Two design choices kept from the previous revision, unchanged:** a `contentHash` rather than
republishing full comment text (`neo.community` has no per-comment deep link — only the proposal-level
URL exists — so `itemId` + hash + timestamp + username is the reproducible substitute); and
`collectedAtUtc` kept distinct from `fetchedAt`.

---

## 6. Quarantine, precisely (only two reasons trigger it now)

| Event | Detection | `eligibilityResult`/reason | Response |
|---|---|---|---|
| Org was not a verified Council member at the item's own timestamp | Historical-committee check at that timestamp returns absent | `ineligible` | **Not a quarantine.** Preserve the item, exclude it from `perMember` figures, no human review required (§1). |
| A previously collected item **disappears** | `itemId` was in the last approved snapshot, absent from a fresh fetch | `source-mutation` | **Quarantine.** Preserve the old item as last recorded; add to `quarantine[]`; block the entire candidate snapshot; require human review. |
| Its **content changes** | Same `itemId`, different `contentHash` | `source-mutation` | **Quarantine**, same as above. |
| Its **organization/public-key attribution changes**, or its `organizationIdRaw` can't be resolved at all | Same `itemId`, different `organizationIdRaw`/`publicKey`, or no match in the org table | `identity-conflict` | **Quarantine** — the most serious case, since it would move or orphan a public accountability record. |
| Its **timestamp changes** | Same `itemId`, different `createdAtUtc` | `source-mutation` | **Quarantine** — a changed timestamp can flip an eligibility result; never silently recompute. |
| The **API call itself fails**, no prior item involved | Fetch/parse failure | `collection-failure` | **Not a quarantine** — an ordinary outage. Fail this run closed, keep serving the last good snapshot, no human alarm. |

**Quarantine still blocks the whole candidate snapshot**, exactly as the previous revision
described, and exactly as `fetch-uptime.mjs`/`fetch-council-history.mjs` already behave — a mutated
or vanished item is evidence something about *this run* can't be trusted, so nothing from this run
publishes until a human resolves it. What changed this pass is narrowing *which* events qualify:
ordinary ineligibility (§1) and ordinary new-proposal appearance (§3) no longer masquerade as
quarantine-worthy problems.

---

## 7. GitHub/Tier-B/C note (unaffected by this pass, kept for a future slice)

| Tier | Source | Confidence |
|---|---|---|
| B | GitHub link on a *claimed* `neo.community` candidate profile (has members) | Medium. |
| C | GitHub link on an *unclaimed* profile | Low. Real examples: R3E (`github.com/r3e-network`), bNEO representative (`github.com/neoburger`). |
| — | No GitHub link at all | Not attributable via this venue. Real example: MakeNeoGreatAgain. |

Irrelevant to the Tier-A pilot's states or figures — kept only as groundwork for a future,
separately-labeled source.

---

## 8. Automation requirement (revised layering)

1. **Fully automatic, safe for a scheduled runner (GitHub Actions or equivalent):** fetch every
   proposal's `messages[]`/`proposer_org_id`; resolve each item's own-timestamp eligibility (§1);
   diff every item against the last approved snapshot for the two quarantine reasons (§6); compute
   the three raw facts (§2) for proposals already classified `real`; collect and preserve evidence
   for any `unreviewed` proposal, new or existing, without letting it block anything (§3). If no
   quarantine reason was triggered, publish the candidate snapshot automatically — **a new or
   still-pending `unreviewed` proposal is never, by itself, a reason to withhold publication.**
2. **Requires human approval, and only for this:** reclassifying a proposal from `unreviewed` to
   `real` or `test` (§3, §4) — an infrequent, deliberate decision, recorded the same way
   `AGENTS.md` already requires for durable decisions. A `quarantine[]` entry (§6) also requires
   human review, but that's a different, rarer event, not a routine part of new-proposal handling.
3. **Frontend publication:** reads only the last snapshot that passed layer 1 with no unresolved
   quarantine. An `unreviewed` proposal may remain flagged for classification without blocking
   verified updates for already-`real` proposals — mirroring how `web/index.html` only ever reads
   checked-in `data/*.json` files today.

---

## 9. Worked examples (real data, retrieved 2026-09-07 — updated for this pass)

### Example 1 — Flamingo: eligible evidence, no denominator needed to state it

Flamingo has 2 recorded comments on Proposal #5 (`real`), both `eligible` (Flamingo's key was
present in the committee at both comments' own timestamps). One explicitly explains a recorded vote
change. Published facts: `recordedCommentsWhileEligible: 2`,
`distinctRealProposalsCommentedOnWhileEligible: 1`. No "out of Y" framing — per §2, none is offered.

### Example 2 — HashKey Cloud: one proposal counted, one preserved-but-pending

HashKey Cloud has one recorded comment on Proposal #5 (`real`, `eligible`) and one on Proposal #6
(`unreviewed`). Only the first currently contributes to any published figure — the second is fully
collected and preserved (§5), visible in `items[]`, and will count the moment a human resolves #6's
classification, with no re-collection needed.

### Example 3 — COZ: authorship and comments, kept as separate facts

COZ is Proposal #7's `proposer_org_id` (`proposalsAuthoredWhileEligible: 1`) and separately has one
`eligible` comment on Proposal #5. Authorship of #7 does not add #7 to COZ's
"distinct real proposals commented on" figure — COZ hasn't commented on #7, which currently has zero
comments from anyone.

### Example 4 — Neo News Today: classification protects the count regardless of content

Neo News Today authored Proposals #5 and #6, and has 3 `eligible` comments on Proposal #5.
Separately, the same account posted 7 messages on Proposals #1 and #4 (`test`) — none of those 7
contribute to any figure, because of what the *proposals* are classified as, not because anyone
judged those 7 messages as low-quality (§1 of the prior revision's Correction 2, unaffected by this
pass).

### Example 5 — R3E and MakeNeoGreatAgain: same raw numbers, different context, no rate to tell them apart

Both currently show the same three raw facts: 0 authored, 0 recorded comments, 0 distinct real
proposals. For context only — **not part of the published figures, and not a rate** —
`data/council-history.json` shows R3E was never present in the historical committee at any of the
seven proposals' opening timestamps (consistent with a very recently begun seat), while
MakeNeoGreatAgain was present at every one of them, including both proposals currently `real`. The
raw counts alone cannot distinguish "never had a seat yet" from "had a seat and didn't engage" — which
is exactly why §2 declines to compress this into a single rate. Anyone who wants that distinction can
already see it by cross-referencing `data/council-history.json` directly; this metric doesn't need to
manufacture its own version of the same fact.

---

## 10. Known limitations and ways the metric could be gamed

- **The opportunity-window gap is real and unresolved (§2).** This project can state item-level
  eligibility precisely but cannot yet state whether an org had a *fair* opportunity to comment on a
  given proposal. No rate is published because of this — but the raw counts alone still can't fully
  substitute for it (Example 5).
- **Padding via volume** remains visible, not hidden — an org posting many low-effort but non-empty
  eligible comments raises `recordedCommentsWhileEligible` with no quality signal attached, by design
  (unchanged from the prior revision).
- **Multiple accounts under one org** can each post, inflating comment count without inflating
  distinct-proposal coverage — report both for this reason (unchanged).
- **No revision history from the source API** — §6's quarantine response can't detect an edit made
  and reverted between two scheduled fetches. Not solved; stated plainly (unchanged).
- **Registering to appear active, not to govern** — unchanged from the prior revision; this metric
  measures recorded presence, not intent, by design.
- **API stability** — `neo-governance-api.flamingo.finance` remains an undocumented public API
  (unchanged, `docs/DECISIONS.md`, 2026-09-02).
- **Two proposals (#2, #6) are now `unreviewed`**, not one — both fully excluded from every figure
  until reviewed, per §3's corrected (non-blocking) behavior.

---

## 11. A minimal pilot suitable for the next tested vertical slice (revised)

1. **Source: Tier A only** — `neo.community` `messages[]` + `proposer_org_id`. No GitHub.
2. **Classification file, human-approved before first run**: `real` = {5, 7}; `unreviewed` = {2, 6};
   `test` = {1, 3, 4} — per §4's table, checked into git with evidence preserved per entry.
3. **Objective, item-level-eligible evidence only** (§1, §2): authored while eligible / recorded
   comments while eligible / distinct real proposals commented on while eligible. No denominator, no
   percentage, no combined score.
4. **Eligibility**: every item checked at its own timestamp — no proposal-open gate (§1, §2).
5. **Mutation handling**: exactly the two quarantine reasons in §6, and the one non-alarm case.
   Ordinary ineligibility and new-`unreviewed`-proposal appearance are explicitly not alarms (§1, §3).
6. **Tests to write before any UI work** (mirroring Slice 1's own bar; none of these have been
   implemented or run — this remains a research plan):
   - a comment on a `test` or `unreviewed` proposal never appears in any published figure, even
     before/without upstream filtering;
   - a reaction (`thumbs_up`/`thumbs_down` only, empty `content`) is never counted as a comment;
   - **a former member commenting after leaving is preserved with `eligibilityResult: "ineligible"`
     and does *not* appear in `quarantine[]`;**
   - **a new member commenting on an older, still-open proposal is evaluated at the comment's own
     timestamp and counted as `eligible` — the proposal's own age is irrelevant to that check;**
   - **when a new `unreviewed` proposal appears in the same run as a new valid comment on an
     already-`real` proposal, the `real` proposal's updated figures still publish — the new
     `unreviewed` proposal does not block that publication;**
   - **Proposal #2 remains excluded from every published figure while `unreviewed`, and its
     evidence is still collected and preserved in `items[]`;**
   - **the collector does not attempt to compute or publish any X-of-Y coverage percentage,
     because the org-level opportunity window (seat-start/seat-end intersected with comment-window
     availability) cannot currently be established from available data;**
   - a changed `contentHash`, disappeared `itemId`, or changed `createdAtUtc`/`organizationIdRaw`
     for a previously-seen item triggers `quarantine[]` (tagged `source-mutation` or
     `identity-conflict` as appropriate) and blocks the entire candidate snapshot;
   - a plain API failure (`collection-failure`, no prior item involved) fails the run closed without
     populating `quarantine[]`.
7. **Then** one real fetch against live data, inspected by hand exactly as this research was, before
   any UI work begins.

---

## 12. Questions for Tyler Adams (COZ), Dean (Neo News Today), and other ecosystem contacts

1. Is `neo-governance-api.flamingo.finance`'s `messages`/`proposer_org_id` data stable, or could its
   shape change without notice?
2. Is there a canonical, org-maintained list mapping each Council organization to its official
   GitHub account(s), for a future Tier B/C slice?
3. Do you know of another durable, publicly-fetchable governance discussion venue this research
   missed?
4. For candidates whose profile shows "No members available" (unclaimed) — is claiming it something
   Council members are actually expected to do?
5. **New this pass:** does a proposal's `end_time`/`endsAt` genuinely close its comment facility for
   every proposal, or was that only true for the one case checked (#7)? Is there ever an earlier or
   later cutoff, or a way to reopen one?
6. **New this pass:** is there any way to query, or would it be possible to expose, the exact block
   height or timestamp at which a Council seat began or ended — rather than only being able to check
   "was this org a member at time T" one timestamp at a time? That capability is the specific gap
   blocking a fair coverage rate (§2).
7. Are proposal comments ever edited or deleted after posting in practice?
8. Would COZ, Neo News Today, or other Council orgs object to a public metric counting their
   `neo.community` proposal comments and authorship this specifically?
9. Given the `registerCandidate` fee-only registration gap already raised with Dean — does anyone in
   the ecosystem already track any form of Council-candidate capability or activity verification we
   could learn from?

---

## Sources

- `https://neo-governance-api.flamingo.finance/proposal/get/all` and `.../proposal/get?proposal_id={id}` for all 7 proposal IDs in `data/governance.json` — retrieved 2026-09-07
- `https://neo-governance-api.flamingo.finance/organization/get/all` — retrieved 2026-09-07
- `https://neo.community/candidates` and `https://neo.community/candidates/{publicKey}` (live rendered pages) — retrieved 2026-09-07
- `https://neo.community/proposals/{id}` for proposals #5, #6, #7 (rendered), including the observed comment-deadline text on #7 used as evidence in §2 — retrieved 2026-09-07
- `https://github.com/neo-project/proposals` (NEP repository, existence and sample PRs confirmed via search) — retrieved 2026-09-07
- `data/council-history.json`, `data/governance.json` (this repository) — checked 2026-09-07
- Web search: Neo N3 governance forum/discussion venues — retrieved 2026-09-07
