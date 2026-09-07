# Neo N3 Council voting and approval mechanisms — research findings

**Status: research only. No application code, data snapshot, test, or deployment configuration was
modified. No branch was switched. Nothing was committed, pushed, or merged.**

**Revision note (previous pass):** a review found six problems in the first draft — language that
treated absence from a broadcast witness as proof of non-participation; a claim that the mechanism
catalogue was complete; an unresolved 13-signature/8-pending count that turned out to be *my own*
arithmetic error, not a real data inconsistency; metric-category wording that could misdescribe
genuine additional signers; no investigation of whether the committee itself changed across
Proposal #12's multi-day signing window; and a general need to keep unresolved questions unresolved
rather than guess at them. All six were corrected, with new primary-source work behind each one
(most notably: every one of the 13 stored signatures was independently re-verified, from scratch,
with real cryptography — not just re-read from Neo3Scan's UI).

**Revision note (this pass):** a transcript of a separate Neo3Scan AI assistant conversation was
supplied as **untrusted discovery material** — treated throughout as a lead to check, never as a
source of fact on its own. Its list of nine "committee-authorized" PolicyContract methods was
checked line-by-line against the actual `PolicyContract.cs` source, at both the current `master`
branch and the original Neo N3 mainnet launch tag (`v3.0.0`): **five of the nine are real and
verified; four do not exist in PolicyContract at any point in Neo N3's history and are rejected as
false** (§2.1). `setMillisecondsPerBlock` — the exact method Proposal #12 used, and conspicuously
absent from the AI's answer — was independently confirmed to be a real, newer addition, gated behind
a specific hardfork (§2.2). `RoleManagement.designateAsRole`, `NeoToken`'s committee setters, and
`OracleContract.setPrice` were independently verified from source, without relying on the AI
transcript at all (§2.3). The AI's account of pre-Neo3Scan manual coordination is kept, but now
explicitly labeled as an unverified hypothesis from that transcript, not a documented fact (§6.2).

Retrieved 2026-09-07 against: `neo3scan.com` (live rendered pages and its own internal
`/api/multisig/requests` endpoint), `api.n3index.dev` (Neo3Scan's documented public REST indexer),
and `mainnet2.neo.coz.io:443` (a Neo N3 RPC node this project already trusts and uses in
`scripts/fetch-council-history.mjs`). Every on-chain claim below was checked against the RPC node
directly — not taken from any explorer's label — and every place that couldn't be independently
checked is marked as such.

---

## Headline findings

1. **Tyler Adams is right, and the evidence is structural, not just incomplete.** Proposal #12's
   actual technical change (`setMillisecondsPerBlock=3000`, `setGasPerBlock=100000000`) is executed
   by an **11-of-21 committee multisignature transaction**, a completely different on-chain mechanism
   from anything `neo.community` records. `neo.community` Proposal #7 in this project's own
   `data/governance.json` — titled "Competitive Fee and Blocktime Enhancements," proposing the
   identical parameter values — is almost certainly the *discussion and approval* of the same
   underlying decision that Proposal #12 later *executed* on-chain, though no explicit
   cross-reference ties the two records together (a reasonable inference, not a confirmed link).
2. **Neo3Scan's governance tool is very new and has exactly one entry.** Its own governance page
   states "Proposal Queue: 0 — No active proposals under review," and its list API
   (`/api/multisig/requests?network=mainnet`) returns exactly one object: Proposal #12. IDs 1–11 and
   13 all return `{"error":"Request not found."}`.
3. **The 13-signature/8-pending discrepancy flagged in the previous pass is resolved, and it was a
   mistake in that pass, not a real inconsistency in the source.** Re-fetching the record and
   computing the eligible/signed/unsigned sets programmatically (rather than by hand-copying a
   truncated list, which is what produced the earlier wrong count of 7) gives a clean, internally
   consistent result: **21 eligible signers, 13 with a stored signature, 8 without** — see §1.6 for
   the exact roster and independent identity resolution of all eight.
4. **All 13 stored signatures — including the 2 never broadcast on-chain — were independently
   cryptographically verified in this pass**, not merely re-read as "valid" from Neo3Scan's own
   label. This is new work beyond the first draft and directly answers the question of whether an
   off-chain signature can be checked without trusting the explorer (§1.5, §1.6).
5. **A concrete discrepancy in Neo3Scan's own display was found and is reported, not silently
   corrected:** its governance overview page labels `NU6wVcRy9mb81YxZcxrpBudVn7d4MTDqEz` as
   "COMMITTEE MULTI-SIG." It is not the address that actually signed Proposal #12. The real signer,
   independently derived from the transaction's own verification script (§1.6), is
   `NeWfLvaPzHZFoGbianvK8wJBqkwGucjeHZ` — a different address.
6. **The committee did not change during Proposal #12's roughly nine-day signing window** — checked
   directly, not assumed (§1.8). This is a fact about this one proposal, not a guarantee for any
   future one.
7. **Not every committee-gated action uses the same multisig threshold.** Source verification found
   that `PolicyContract.RecoverFund` requires **19-of-21** signatures (`AssertAlmostFullCommittee`),
   a different, stricter address than the standard 11-of-21 committee address used everywhere else
   (§2.4). A collector that only recognizes the standard threshold would misclassify or miss this
   entirely.
8. **Four of the nine PolicyContract methods claimed in a separately-supplied AI transcript do not
   exist, at any point in Neo N3's history** — confirmed against both the current source and the
   original 2021 mainnet-launch release (§2.1). The transcript is treated throughout as untrusted
   discovery material, not fact.

---

## 1. Neo3Scan governance proposals

### 1.1 Every proposal Neo3Scan exposes

`GET https://www.neo3scan.com/api/multisig/requests?network=mainnet` returns a JSON array. As of
2026-09-07 it contains **exactly one object** (id `12`). The same page's own summary UI confirms
this independently: *"PROPOSAL QUEUE — 0 — No active proposals under review"* and *"SIGNATURE
PRESSURE — 13 — Council witness fragments currently stored across the active queue."* Requesting
`network=testnet` returns `[]`. Requesting individual IDs 1–11 and 13 all return
`{"error":"Request not found."}` — a clean "not found" response, not a redacted or soft-deleted
record, though **why numbering starts at 12** with nothing before it is unexplained and is one of
§7's questions.

### 1.2 Is there a public/stable API?

**Reachable, unauthenticated, machine-readable — but not officially documented, and not part of
Neo3Scan's own published API docs.** `https://neo3scan.com/api-docs` documents a *separate*, general
REST indexer at `api.n3index.dev` (network/blocks/transactions/accounts/contracts/tokens categories
— 5 endpoints actually rendered under the "Network" tab when checked). The governance-specific
`www.neo3scan.com/api/multisig/...` routes used throughout this research were found by inspecting
live network traffic while the page rendered, not by reading documentation, and they do not appear
anywhere in the documented API. **This is structurally the same situation this project already has
with `neo-governance-api.flamingo.finance`** (`docs/DECISIONS.md`, 2026-09-02: undocumented, inferred
from network traffic, could change without notice) — the same standing risk applies here.

### 1.3 Request URL, response schema, identifiers, timestamps

```
GET https://www.neo3scan.com/api/multisig/requests?network=mainnet         (list)
GET https://www.neo3scan.com/api/multisig/requests/{id}?network=mainnet    (detail)
```

Top-level detail fields (from the live Proposal #12 response, re-fetched fresh for this revision,
2026-09-07):

| Field | Example | Notes |
|---|---|---|
| `id` | `12` | Integer, Neo3Scan's own auto-increment ID. Not a blockchain identifier. |
| `network` | `"mainnet"` | |
| `title`, `description` | free text | Human-authored, not derived from chain data. |
| `contract_hash`, `method` | `"0xcc5e...c67b"`, `"setMillisecondsPerBlock,setGasPerBlock"` | |
| `params.invocations[]` | array of `{params, targetHash, selectedMethod, selectedContract}` | The decoded, human-readable call plan — matches the actual script (§1.6). |
| `params.unsigned_tx` | hex | The draft transaction before any signatures. Used directly in this pass's independent signature verification (§1.6). |
| `params.network_magic` | `860833102` | Mainnet magic — matches `getversion`'s own reported network value; used directly in signature verification (§1.6). |
| `params.eligible_signers` | array of **21** Neo addresses, all unique | Individual (single-sig) addresses of each currently-eligible committee member — **not** the committee multisig address. Re-checked this pass: exactly 21, no duplicates. |
| `params.committee_pubkeys` | array of **21** compressed public keys, all unique | **Independently confirmed byte-identical** to the pubkeys actually embedded in the on-chain verification script (§1.6), and independently confirmed to derive the exact 21 `eligible_signers` addresses (§1.6) — no duplicates, no mismatches. |
| `params.committee_verification_script` | hex | The multisig redeem script Neo3Scan believes is current. Confirmed identical to the one actually used on-chain (§1.6). |
| `params.governance_mode` | `"official"` | Only value observed; other values are unknown — a question for §7. |
| `params.broadcast_witness` | `{invocationScript, verificationScript}` | Only present once broadcast. |
| `signers_required` | `11` | Matches `n - (n-1)/2` for `n=21`, i.e. `NeoToken.GetCommitteeAddress()`'s own majority formula. |
| `status` | `"EXECUTED"` | Other values are presumably `DRAFT`/`READY`/similar, not observed since this is the only record. |
| `creator_address` | `"NU6wVcRy9mb81YxZcxrpBudVn7d4MTDqEz"` | The Neo3Scan account that authored the draft. **Not** in `eligible_signers`, **not** a committee member address, **not** the real signer (§1.6). Almost certainly just "whoever clicked Create" in the tool. |
| `created_at` | `2026-04-14T15:33:38.012Z` | Draft creation. |
| `updated_at` | `2026-04-23T06:31:41.929Z` | |
| `broadcast_tx_hash`, `broadcast_at` | `0x50f683...`, `2026-04-23T05:32:03.000Z` | |
| `metadata.broadcast_state` | `"HALT"` | |
| `signatures[]` | array, **13** entries, all unique `signer_address` and `public_key` | See below. Re-checked this pass: no duplicate rows. |

Each `signatures[]` entry: `id` (Neo3Scan's own row ID), `signer_address`, `public_key`,
`signature` (128 hex chars = 64 bytes, a raw ECDSA `r‖s` pair), and its **own** `created_at` —
a per-signer timestamp independent of the proposal's own `created_at`, and used directly in §1.8's
committee-stability check.

**Pagination:** not observed or needed — the list endpoint returns the complete (one-element) array
with no `limit`/`offset`/cursor parameters found in the request Neo3Scan's own UI makes.

### 1.4 Do historical proposals and non-signers remain available after execution?

**Yes, for this one proposal.** The detail record for `id=12` is still fully served, in full, after
execution and broadcast — nothing about `status: "EXECUTED"` removed data. `eligible_signers` still
lists all 21 addresses, and the 8 who never signed are identifiable and named in §1.6. Whether this
holds for proposals that are abandoned, rejected, or superseded is **untested** — there is no second
example to check against.

### 1.5 Are the "votes" cryptographic signatures over the exact transaction payload, and can they be independently validated?

**Yes to both, and both were actually done in this pass, not assumed.**

Each `signatures[]` entry's 64-byte value, together with its `public_key`, is exactly the shape of a
raw ECDSA (secp256r1) signature over Neo's standard transaction sign-data
(`network_magic ‖ tx_hash`, in the little-endian byte order Neo's own wallet code signs, sha256'd
once before the ECDSA operation).

**This pass independently re-verified all 13 stored signatures from scratch**, using nothing but
`params.network_magic`, `params.hash` (the transaction hash), each signer's stored `public_key`, and
each stored `signature` — reconstructing the exact secp256r1 SPKI key and calling Node's own ECDSA
verifier (`crypto.verify` with `dsaEncoding: 'ieee-p1363'`) against the sign-data, entirely without
asking Neo3Scan or any explorer whether a signature is "valid." The method was validated first
against a signature already known-good by an independent, stronger proof (one of the 11 embedded in
the real on-chain witness, §1.6) — it verified correctly — and then applied to all 13, including the
2 that never reached the blockchain.

**Result: all 13 verify correctly**, including AxLabs (neow3j)'s and NGD8's — the two whose
signatures were never included in the broadcast transaction. This lets §1.6/§3 draw the precise
distinction the review asked for:

- **11 signatures are cryptographically valid *and* independently provable from the blockchain
  alone**, forever, by anyone, without needing Neo3Scan to exist — because they are the literal
  bytes accepted into a confirmed block by the whole network's own consensus.
- **2 signatures (AxLabs, NGD8) are now independently proven cryptographically valid by this
  research**, but their *preservation* depends entirely on Neo3Scan's database — if that database
  disappeared or those two rows were altered, there would be no other copy anywhere to re-verify
  against. "Cryptographically valid" and "durably, independently preserved" are two different
  properties, and this is the concrete case where they come apart: valid — yes, proven; durable
  independent of Neo3Scan — no.

### 1.6 Independent verification of Proposal #12's transaction and full 21-member roster — the worked example

Fetched directly from `mainnet2.neo.coz.io:443` via `getrawtransaction` (not from Neo3Scan):

- `hash`: `0x50f683f5db177d2e23d11882c411e5cec37c446213d9cea3174d9ad30db836f1` — matches.
- `vmstate`: `"HALT"` — executed successfully, in a real, confirmed block
  (`blockhash: 0xb6461940...`, height **9,246,921**, time `2026-04-23T06:10:35.223Z`).
- `sender`: `NeWfLvaPzHZFoGbianvK8wJBqkwGucjeHZ`.
- `script` (base64-decoded) contains the literal method names `setMillisecondsPerBlock` and
  `setGasPerBlock`, calling `PolicyContract` and `NEO` respectively — **exact match** to Neo3Scan's
  `params.invocations[]`.
- The transaction's single `witnesses[0].verification` script was decoded byte-by-byte: exactly
  **21 compressed public keys**, a leading `PUSH11` opcode, ending in a `CheckMultisig` syscall —
  a standard Neo `11-of-21` multisig redeem script. **Byte-identical, same order, to Neo3Scan's
  `params.committee_pubkeys`.**
- **Independently hashing that decoded script** (`RIPEMD160(SHA256(script))`, Neo's standard address
  encoding) produces `NeWfLvaPzHZFoGbianvK8wJBqkwGucjeHZ` — **exactly the transaction's own `sender`
  field.** The committee's actual multisig address was derived from scratch and matches.
- The transaction's `witnesses[0].invocation` script decodes to **exactly 11** embedded 64-byte
  signatures (`726` bytes ÷ `66` bytes/signature), not 13.
- Cross-referencing those 11 against Neo3Scan's stored 13 (by exact signature bytes): 11 match. The
  two that do not are AxLabs (neow3j)'s and NGD8's (§1.5).

**The full, resolved 21-member roster for this decision** — every address independently re-derived
from `params.committee_pubkeys` using Neo's standard single-signature script format
(`PUSHDATA1(pubkey) SYSCALL System.Crypto.CheckSig`, hashed the same way as the multisig address
above), then matched against `eligible_signers` (**21-for-21 exact match**, confirming
`committee_pubkeys` and `eligible_signers` describe the identical set) and against `signatures[]`:

| Member | Evidence state |
|---|---|
| Red4Sec, NeoSPCC, Neo News Today, Flamingo, R3E, COZ, NGD4, NEXT（NeoLine）, Switcheo Labs, HashKey Cloud, Everstake (**11**) | **Included in executed witness** |
| AxLabs (neow3j), NGD8 (**2**) | **Additional signature recorded off-chain** (cryptographically valid, per §1.5 — preserved only by Neo3Scan) |
| NF1, The Neo Order, NGD6, BinanceStaking1, lazynode, bNEO representative, MakeNeoGreatAgain, **Nash.io** (**8**) | **No verifiable signature found** |

**This fully resolves the previous pass's count discrepancy, and the resolution is that the previous
pass made an arithmetic/transcription error, not that the source data disagrees with itself.**
Re-fetching `eligible_signers` (21, all unique) and `signatures[]` (13, all unique) and computing the
set difference **programmatically** — rather than by hand-copying a truncated address list out of a
terminal dump, which is what produced the earlier, wrong count of 7 — gives exactly **8**,
matching the task's own "eight pending" framing precisely. No duplicate address, no omitted eligible
signer, and no address/public-key mismatch was found anywhere in the record.

**One genuine, separate finding surfaced by doing this properly:** the 21-member committee used for
Proposal #12 (April 2026) is **not** the same 21 as this project's current `data/council-roster.json`
(observed 2026-09-03). It includes **Nash.io** (`03fd04de...`, currently rank 22, excluded from the
current roster and from `data/council-roster.json` entirely) and does **not** include **InfStones**
(`02cc10d0...`, present in the current roster). This is real evidence of committee turnover between
April and September 2026, not an error — and it means Nash.io, specifically, is one of the 8 "no
verifiable signature found" cases above despite not appearing anywhere in this project's existing
data files. **This is exactly the "not eligible under one roster, but was eligible under the
roster that actually governed this decision" case §3/§5's states exist for.**

**The Neo3Scan display discrepancy, restated precisely:** the governance *overview* page
independently labels a *different* address, `NU6wVcRy9mb81YxZcxrpBudVn7d4MTDqEz`, as "COMMITTEE
MULTI-SIG." That address is not in `eligible_signers`, is not the real transaction signer, and its
origin is unexplained — most plausibly it's simply the wallet of whoever created the draft (the same
value as `creator_address`), mislabeled on the summary card, but this is an inference, not confirmed
(§7).

### 1.7 Evidence stored only by Neo3Scan vs. independently recoverable from the blockchain

| Evidence | Neo3Scan-only | Independently recoverable |
|---|---|---|
| The final transaction, its script, its `vmstate`, its actual witness/signatures, the block it's in | | ✅ via any Neo N3 RPC node |
| The 21-member committee's public keys and multisig threshold *as of the transaction's block* | | ✅ via `scripts/fetch-council-history.mjs`'s existing method (confirmed, §6.2) |
| Which 11 (of however many signed) were the ones actually used | | ✅ by decoding the witness (§1.6) — Neo3Scan doesn't surface this distinction itself |
| That AxLabs's and NGD8's signatures are cryptographically valid | | ✅ **now** — independently re-derivable by anyone with the unsigned transaction, network magic, and the stored (pubkey, signature) pair (§1.5) |
| Proposal title/description, human framing | ✅ | — |
| **That AxLabs's and NGD8's signatures exist at all** | ✅ | — the signature bytes themselves have no other home; if Neo3Scan's database were lost, there would be nothing left to verify |
| Exact per-signer timestamps for signatures never broadcast | ✅ | — |
| The draft's existence at all, before broadcast | ✅ | — an unbroadcast draft leaves no on-chain trace whatsoever |

### 1.8 Did the committee change during Proposal #12's lifecycle?

**Investigated directly, not assumed — and found stable throughout, for this one proposal.** Three
different timestamps could plausibly govern three different questions about a multisig decision:

- **What the prepared packet's multisig script represents** — fixed at whatever moment the packet
  (`params.committee_pubkeys`/`committee_verification_script`) was built, effectively the proposal's
  `created_at`.
- **Whether a given signature is valid participation** — governed by the committee at *that
  signer's own* `created_at` (§1.5's per-item timestamp), the same "evaluate at the item's own
  timestamp" rule this project already applies to governance-discussion evidence.
- **Which Council was "in office" when the decision actually took effect** — governed by the
  committee at the *execution block's* time, not the draft's or any signer's.

**These need not agree, and must not be assumed to, per decision.** For Proposal #12 specifically,
they were checked and do agree: this project's own historical-committee method
(`scripts/fetch-council-history.mjs`'s `getstateroot`/`getstate` technique) was queried at four
points — the block nearest the proposal's `created_at` (height 9,197,762), the block nearest the
first stored signature's `created_at` (height 9,213,770), the block nearest the last stored
signature's `created_at` (height 9,230,790), and the execution block itself (height 9,246,921) — and
**the decoded 21-public-key committee set is byte-for-byte identical at all four heights.** No
membership change occurred at any point across this proposal's roughly nine-day lifecycle. This is a
verified fact about this one proposal, not a general guarantee — a future decision spanning a longer
window, or straddling an actual committee-election change, could produce a genuinely different
answer at each of the three timestamps, and any future collector must check this per decision rather
than assume the execution-block roster retroactively applies to every earlier signature.

---

## 2. Other Council decision mechanisms — verified directly against `neo-project/neo` source

The previous pass's mechanism table was reasoned from partial knowledge. This pass replaces it with
line-by-line verification against the actual native-contract source: `PolicyContract.cs`,
`NativeContract.cs`, `RoleManagement.cs`, `OracleContract.cs`, and `NeoToken.cs`, fetched fresh from
`github.com/neo-project/neo` (current `master` at commit `b108895ac6601d21b89d47c5f5589b9a8a948ded`,
and additionally the original Neo N3 mainnet launch tag `v3.0.0` for PolicyContract specifically, to
check whether methods absent today ever existed historically). A separate transcript, supplied by
the user as **untrusted discovery material** ("Neo3Scan Ai Assistant Answers.md" — a different AI
assistant's own conversation, not this project's output), claimed a list of PolicyContract methods;
that list was checked against source rather than trusted, with the results in §2.1.

### 2.1 The untrusted transcript's PolicyContract claim, checked against source

The transcript asserted nine PolicyContract methods "require committee authorization
(`CheckWitness` against the committee)":

| Claimed method | Verdict | Evidence |
|---|---|---|
| `setFeePerByte` | ✅ **Real, verified** | Present at `v3.0.0` and current `master`; gated by `AssertCommittee` (the same helper `CheckCommittee` uses internally — see §2.4). |
| `setExecFeeFactor` | ✅ **Real, verified** | Same as above; present since `v3.0.0`. |
| `setStoragePrice` | ✅ **Real, verified** | Same as above; present since `v3.0.0`. |
| `blockAccount` | ✅ **Real, verified** | Present since `v3.0.0`; current `master` has two overloads (`BlockAccountV0`/`V1`, both `AssertCommittee`-gated, the newer one added at the `Faun` hardfork with an added notification — §2.3). |
| `unblockAccount` | ✅ **Real, verified** | Present since `v3.0.0`; `AssertCommittee`-gated, unchanged in shape since launch. |
| `setMaxBlockSize` | ❌ **Rejected — does not exist** | Absent from current `master` **and** from the original `v3.0.0` source. Never a PolicyContract method at any point in Neo N3's history, as far as this repository's history shows. |
| `setMaxTransactionsPerBlock` | ❌ **Rejected — does not exist as a contract method** | Absent from `PolicyContract.cs` at both versions checked. `MaxTransactionsPerBlock` **is** a genuine Neo N3 concept — this project's own earlier RPC research (`getversion`) shows it as a live protocol-settings field (`"maxtransactionsperblock":200`) — but it is a **static, per-node config value**, not an on-chain, committee-multisig-settable PolicyContract method. Most plausible explanation: the transcript's answer conflated a real `ProtocolSettings` field name with a contract method, a category error. |
| `setMaxBlockSystemFee` | ❌ **Rejected — does not exist** | Same conclusion as `setMaxBlockSize` — absent from both source versions checked; not found as any protocol-settings field either in this project's own prior RPC research. |
| `setStorageContextFee` | ❌ **Rejected — does not exist** | Absent from both source versions. No similarly-named real field or method was found anywhere in this pass; most likely a garbled/hallucinated variant of the real `setStoragePrice`. |

**Four of the transcript's nine claims are false, confirmed by direct source inspection, not by
absence of a search result.** The transcript also omitted several real, currently committee-gated
PolicyContract methods entirely — see §2.2 for the most consequential omission and §2.4 for the full
corrected list.

### 2.2 Why `setMillisecondsPerBlock` — the exact method Proposal #12 used — was missing from the transcript's answer

**Confirmed from source: it is a newer method, gated behind a specific hardfork, not a different
authorization path and not merely "incomplete AI output" in a vague sense.** Current
`PolicyContract.cs` declares it as:

```csharp
[ContractMethod(Hardfork.HF_Echidna, CpuFee = 1 << 15, RequiredCallFlags = CallFlags.States | CallFlags.AllowNotify)]
public void SetMillisecondsPerBlock(ApplicationEngine engine, uint value)
{
    ...
    AssertCommittee(engine);
    ...
    engine.SendNotification(Hash, MillisecondsPerBlockChangedEventName, [...]);
}
```

`Hardfork.HF_Echidna` activated at mainnet block **7,300,000** (per `getversion`'s own reported
hardfork list, already used elsewhere in this project's research). The method is **absent** from the
`v3.0.0` launch source entirely (§2.1's table). **It uses the exact same authorization mechanism as
every other standard PolicyContract setter** (`AssertCommittee`, the standard 11-of-21 committee
check) — so this is not "another authorization path" in the sense of a different threshold or
different check; it is simply a method that did not exist for most of Neo N3's history and does now.
Any tool, AI or otherwise, whose knowledge of PolicyContract predates Echidna, or that queried a
cached/stale contract manifest from before block 7,300,000, would correctly not know about it. This
research cannot determine *which* of those applies to the specific transcript supplied — only that
the method's own source confirms a newer-version explanation is fully sufficient and requires no
speculation about a different mechanism.

### 2.3 `RoleManagement.designateAsRole`, `NeoToken`, and `OracleContract` — verified independently from source, not from the transcript

None of these were asked about in the untrusted transcript beyond `RoleManagement`'s one-line answer
("`designateAsRole`," already consistent with what's found below) — all three were verified directly
from `neo-project/neo` source in this pass.

- **`RoleManagement.designateAsRole(role, nodes[])`** — the *only* state-changing method on this
  contract. Gated by `AssertCommittee(engine)` (standard 11-of-21). Present since Neo N3 genesis, no
  `Hardfork` gate on the method itself. **Always emits a `Designation` notification, unconditionally,
  on every successful call, at every protocol version** — the payload shape changed at the `Echidna`
  hardfork (adding `Old`/`New` node arrays to the event) but the event itself has fired on every call
  since launch. This is a materially *stronger* discoverability guarantee than most PolicyContract
  setters (§2.4) — it is the reason all four historical events in §6.2/§6.3 were straightforward to
  find by notification search alone.
- **`NeoToken.SetGasPerBlock(gasPerBlock)`** and **`NeoToken.SetRegisterPrice(registerPrice)`** —
  both `AssertCommittee`-gated, both present since genesis (no `Hardfork` attribute), and **neither
  method's body calls `SendNotification` at all** — confirmed by reading both method bodies in full.
  Both are silent to notification-based discovery, exactly like several PolicyContract setters
  (§2.4) — a historical `setGasPerBlock` call before Proposal #12 (if one ever occurred) would not be
  findable by the notification-search method this research otherwise relies on.
- **`OracleContract.SetPrice(price)`** — `AssertCommittee`-gated, present since genesis (no
  `Hardfork` attribute), and its body does not call `SendNotification` either — another silent
  setter.

### 2.4 The corrected, source-verified catalogue

| Contract.Method | Version / activation | Exact authorization check | Emits a notification? | Primary source |
|---|---|---|---|---|
| `PolicyContract.SetFeePerByte` | Since `v3.0.0` (genesis) | `AssertCommittee` → `CheckWitnessInternal(NEO.GetCommitteeAddress())`, standard 11-of-21 | **No** | [PolicyContract.cs#L503](https://github.com/neo-project/neo/blob/b108895ac6601d21b89d47c5f5589b9a8a948ded/src/Neo/SmartContract/Native/PolicyContract.cs#L503) |
| `PolicyContract.SetExecFeeFactor` | Since `v3.0.0` | Same, 11-of-21 | **No** | same file, `SetExecFeeFactor` |
| `PolicyContract.SetStoragePrice` | Since `v3.0.0` | Same, 11-of-21 | **No** | same file, `SetStoragePrice` |
| `PolicyContract.BlockAccount` / `UnblockAccount` | Since `v3.0.0`; a second `BlockAccount` overload added at `HF_Faun` (block 8,800,000) | Same, 11-of-21 | **No** for `UnblockAccount`; the `Faun`-era `BlockAccount` overload does not itself notify (fund-recovery bookkeeping only) | same file |
| `PolicyContract.SetMillisecondsPerBlock` | Added at `HF_Echidna` (block 7,300,000) | Same, 11-of-21 | **Yes** — `MillisecondsPerBlockChanged` | same file, §2.2 |
| `PolicyContract.SetMaxValidUntilBlockIncrement` / `SetMaxTraceableBlocks` | Added at `HF_Echidna` | Same, 11-of-21 | **No** | same file |
| `PolicyContract.SetAttributeFee` (V0/V1) | Added at `HF_Echidna` | Same, 11-of-21 | **No** | same file |
| `PolicyContract.SetWhitelistFeeContract` / `RemoveWhitelistFeeContract` | Added at `HF_Faun` (block 8,800,000) | Same, 11-of-21 | **Yes** — `WhitelistChanged` | same file |
| `PolicyContract.RecoverFund` | Added at `HF_Faun` | **A stricter, different threshold** — `AssertAlmostFullCommittee`: `max(11, 21-2) = 19`-of-21, a *different* multisig address than the standard committee address | **No** | [NativeContract.cs#L370](https://github.com/neo-project/neo/blob/b108895ac6601d21b89d47c5f5589b9a8a948ded/src/Neo/SmartContract/Native/NativeContract.cs#L370) (helper), `PolicyContract.cs` (call site) |
| `NeoToken.SetGasPerBlock` | Since `v3.0.0` | Standard 11-of-21 | **No** | [NeoToken.cs](https://github.com/neo-project/neo/blob/b108895ac6601d21b89d47c5f5589b9a8a948ded/src/Neo/SmartContract/Native/NeoToken.cs), `SetGasPerBlock` |
| `NeoToken.SetRegisterPrice` | Since `v3.0.0` | Standard 11-of-21 | **No** | same file, `SetRegisterPrice` |
| `RoleManagement.DesignateAsRole` | Since `v3.0.0` (genesis) | Standard 11-of-21 | **Yes, always** — `Designation` | [RoleManagement.cs](https://github.com/neo-project/neo/blob/b108895ac6601d21b89d47c5f5589b9a8a948ded/src/Neo/SmartContract/Native/RoleManagement.cs) |
| `OracleContract.SetPrice` | Since `v3.0.0` | Standard 11-of-21 | **No** | [OracleContract.cs](https://github.com/neo-project/neo/blob/b108895ac6601d21b89d47c5f5589b9a8a948ded/src/Neo/SmartContract/Native/OracleContract.cs), `SetPrice` |

**One genuinely new, important finding beyond correcting the transcript:** `PolicyContract.RecoverFund`
uses a **different multisig address entirely** — 19-of-21, not the standard 11-of-21 committee
address — because `AssertAlmostFullCommittee` builds its own redeem script at a stricter threshold.
A collector built only to recognize the standard `PUSH11`-of-21 committee script (§1.6's method)
would **not** recognize a `RecoverFund` transaction's witness as a committee action at all, even
though it is one. Any future collector must check for both thresholds, not just one.

**How historical invocations of each of these could be discovered, and what discovery this research
actually performed:**

- **For `RoleManagement.designateAsRole`:** notification search is genuinely reliable (§2.3) —
  this research queried `api.n3index.dev/v1/networks/mainnet/contracts/0x49cf.../notifications` and
  found all 4 events the contract has ever emitted, across the full range the indexer covers
  (results spanned block 1,288 to block 7,438,313; the indexer was not asked for, and did not
  return, any explicit "is this the complete history" guarantee).
- **For the "No" column above (most PolicyContract setters, both NeoToken setters,
  OracleContract's setter):** notification search **cannot** find these calls at all if they exist.
  This research checked `api.n3index.dev`'s notification index for PolicyContract
  (`0xcc5e...c67b`, `tx_count: 1`, `first_seen_block = last_seen_block = 9,246,921` — i.e., **only
  Proposal #12's own transaction was found this way**) and did not attempt a separate,
  notification-independent historical scan for any silent method. **This is a real, acknowledged gap,
  not a completeness claim** — reaching completeness for these methods would require walking every
  block's transactions directly (or an indexer that specifically indexes by called-method regardless
  of notifications), which was not performed in this pass.
- **Block range actually checked in this research:** the full range `api.n3index.dev`'s notification
  index returns for the two contracts queried (`PolicyContract`, `RoleManagement`) — no explicit
  upper/lower bound was set by this research beyond the indexer's own default response; no other
  contract's notification history (NeoToken, OracleContract) was queried for historical invocations
  in this pass at all.

### Discovery limits — why this catalogue cannot be called complete, and what completeness would require

**This research discovered five qualifying transactions (one PolicyContract call, four
RoleManagement calls) using the methods examined in this pass — a statement about what was found,
not a count of what exists.** The specific, now source-confirmed gaps:

- Roughly half of the confirmed committee-gated methods in §2.4 emit **no notification at all** —
  confirmed by reading their bodies, not inferred from an empty search result. Any historical call to
  one of these (if it ever happened) is invisible to the notification-search method this research
  otherwise relies on.
- **What true completeness would require, not performed in this pass:** (1) the method inventory in
  §2.4 is now sourced directly from the four contracts checked — `PolicyContract`, `RoleManagement`,
  `NeoToken`, `OracleContract` — but other native contracts (`ContractManagement`, `Notary`,
  `CryptoLib`, `StdLib`, `Ledger`) were not audited for committee-gated methods in this pass; (2) for
  every "No notification" method in §2.4, scanning **historical invocation transactions directly** —
  walking blocks/transactions rather than relying on notification logs; (3) cross-checking against a
  second, independently-run indexer or a full node's own history, since this research relied on a
  single indexer (`api.n3index.dev`).
- No search of NGD/Neo Foundation internal documentation and no interview with Council operators was
  performed in this pass either — §7 asks directly whether a more complete enumeration already
  exists somewhere.

### 2.5 Other mechanisms outside this pass's method-level scope (unchanged from the previous pass, not re-verified here)

Three mechanisms from the original research remain relevant but are not native-contract methods and
were not part of this pass's source-verification work: **`neo.community` proposals** (no on-chain
gate at all — already handled by `scripts/fetch-governance.mjs`); **`ContractManagement`
deploy/update/destroy** of *regular* (non-native) contracts (authority is whatever that specific
contract's own manifest/logic requires — case-by-case, not a single committee mechanism); and
**native contract protocol upgrades via node-software hardforks** (not an on-chain vote at all —
coordinated off-chain among core developers/node operators, and not attributable to individual
Council members' approval the way a signed transaction is).

---

## 3. Attribution and eligibility

For every mechanism above that produces an on-chain transaction (i.e., everything except
`neo.community` and the "coordination process" half of manual signature collection), evidence is
recorded using exactly these five states — chosen specifically so that absence is never read as a
judgment:

| State | Meaning |
|---|---|
| **Included in executed witness** | The member's signature is one of the ones actually embedded in the confirmed, broadcast transaction — independently verifiable on-chain by anyone, forever (§1.6). |
| **Additional signature recorded off-chain** | A cryptographically valid signature exists (independently checkable, §1.5), collected by a tool like Neo3Scan, but was not embedded in the executed witness — real participation, lower-durability evidence. |
| **No verifiable signature found** | **Neutral.** No signature was found in either the on-chain witness or any off-chain record checked. This is *not* labeled non-participation, absence, rejection, or a missed vote — it means exactly what it says: none was found by the sources checked, and nothing more. A member in this state may have been asked and declined, never been asked, been unreachable, or simply not needed once quorum was reached by others — none of that can be distinguished from the record alone. |
| **Not eligible** | Independently verified (via the historical-committee method) that the public key was outside the Council at the relevant timestamp. |
| **Unknown / source incomplete** | Eligibility or source coverage could not be established — e.g. §2's discovery-limits gap, or a source that could not be reached. |

**Why "no verifiable signature found" replaces "did not participate," concretely:** Proposal #12
itself is the proof this distinction matters — AxLabs and NGD8 both supplied a valid signature
(§1.5), and a system that only looked at the *executed witness* would have wrongly filed both of
them alongside the 8 who left no trace anywhere. The moment a second source (Neo3Scan, or any future
equivalent) is checked, "not in the witness" and "no record anywhere" become different findings, and
only the second one is close to meaning "no participation found" — and even then, "found" is doing
the work, not "participated."

- **What constitutes a vote/approval:** a valid ECDSA signature, by a specific committee member's
  public key, over the exact transaction being decided. Whether that signature was *embedded in the
  broadcast witness* or merely *recorded off-chain* are both real approval, at different confidence
  and durability levels (§1.5) — neither should be silently treated as the other.
- **Cryptographic provability of individual participation:** yes, per public key, for anything with
  a recorded signature — on-chain witness inclusion is provable forever by anyone (§1.6); an
  off-chain-only signature is provable today, given the source's data, but its continued availability
  depends on that source (§1.5, §1.7).
- **Stable identifying public key:** the same compressed secp256r1 public key already used
  throughout this project — confirmed identical across `neo.community`, Neo3Scan's
  `committee_pubkeys`, and the RoleManagement transaction's verification script.
- **Relevant decision timestamp:** not a single answer — see §1.8's three-timestamp breakdown
  (packet composition / each signer's own signing time / execution block time). For *whether the
  decision itself took effect*, the execution block's time governs; for *whether a specific
  signature is valid participation*, that signature's own timestamp governs.
- **Reconstructing the eligible roster at the relevant timestamp:** this project's existing
  historical-Council method (`scripts/fetch-council-history.mjs`) does this unmodified — proven
  directly in §6.2 (exact match at block 7,438,313) and again in §1.8 (exact match at all four
  Proposal #12 checkpoints).
- **Distinguishing abstention, rejection, non-signing, and absence:** on-chain, a multisig witness
  only ever proves *inclusion* — there is no on-chain "against" or "abstain" signal for this
  mechanism (unlike `neo.community`'s explicit for/against/neutral choices), and "not included" does
  not distinguish declined from never-asked from not-needed. Off-chain, "no record" carries the same
  ambiguity, one level further out.
- **Former/new members:** handled by the exact same existing method, no new capability required —
  and §1.6 found a real instance (Nash.io) where this mattered: eligible for Proposal #12 under the
  April-2026 committee, absent from this project's current roster entirely.

**Fail-closed determination for this research:** the on-chain "included in executed witness" state
for Proposal #12 and the four RoleManagement events is established with the highest available
confidence. The "additional signature recorded off-chain" state (AxLabs, NGD8) is now established as
cryptographically valid (§1.5), but its long-term durability remains dependent on a single external
source. The "coordination process" behind the pre-2026 RoleManagement events (who was asked, who
declined) cannot currently be established at all.

---

## 4. Coverage and automation — proposed collector architecture

Two structurally different sources need two different collectors, following the same separation
this project already uses (`fetch-governance.mjs` vs. `fetch-council-history.mjs` vs.
`fetch-uptime.mjs`):

### 4a. On-chain committee-multisig transactions (the durable, high-confidence source)

| Aspect | Design |
|---|---|
| **Discovery method** | Watch `Notification` events from known committee-gated native contracts via an RPC node or a public indexer's notification feed — **with the explicit limitation from §2's discovery-limits discussion**: this misses any committee-gated call that doesn't emit an event. A more complete future design should add periodic full re-checks of each contract's current parameter values against the last known snapshot, and/or historical invocation scanning per §2. |
| **Stable ID** | The transaction hash — permanent, chain-native, never reused. |
| **Evidence fields** | Everything in §1.6's method, plus the per-item eligibility result using §3's five states, plus the §1.8-style multi-timestamp committee check for any decision spanning more than a single block. |
| **Freshness behavior** | Poll on the existing cadence pattern (`fetch-uptime.mjs`'s model); a committee decision is rare, not per-block. |
| **Mutation/deletion handling** | Structurally impossible for confirmed on-chain data once sufficiently confirmed; a not-yet-deeply-confirmed transaction should simply not be published yet. |
| **Rate limits/reliability** | Same public RPC nodes this project already uses, with the same two-independent-source corroboration rule already in `AGENTS.md`. |
| **Human classification required?** | Only for judgment calls this research couldn't resolve automatically — is a given call actually a Council-facing governance decision? Mirrors the `real`/`test`/`unreviewed` model already designed for discussion engagement. |
| **Outage behavior** | Fail closed, preserve the last verified snapshot. |
| **Cross-source duplicates** | A transaction hash is globally unique — trivially deduplicated. |

### 4b. Neo3Scan's off-chain multisig-request records (the lower-confidence, richer-context source)

| Aspect | Design |
|---|---|
| **Discovery method** | Poll `GET /api/multisig/requests?network=mainnet`, diff against previously seen `id`s. |
| **Stable ID** | Neo3Scan's own integer `id` — stable only for as long as Neo3Scan's database exists (§1.2). |
| **Evidence fields** | Every field in §1.3's table, preserved per item — including signatures never broadcast (now known to be independently re-verifiable per §1.5, which should itself be recorded as a field: `independently_verified: true/false` plus the verification timestamp). |
| **Freshness behavior** | Polling at the same cadence as the governance-discussion collector is plausible; no evidence yet on how often new proposals appear (only one data point exists). |
| **Mutation/deletion handling** | The real structural risk in this pipeline, because it's someone else's live off-chain database. Same rule already designed for `neo.community` comments: a changed `signature`, `signer_address`, `public_key`, or `created_at` for a previously-seen row is a quarantine-worthy conflict, blocking the candidate snapshot; new activity is not. |
| **Rate limits/reliability** | Unknown — not load-tested. Unauthenticated and un-throttled in casual use, but no guaranteed stability (§1.2). |
| **Human classification required?** | Whether an "additional signature recorded off-chain" should ever be *displayed* alongside on-chain evidence (vs. purely preserved) is a product decision, not automatic — flagged, not decided here. |
| **Outage behavior** | Fail closed; the on-chain half (§4a) is unaffected and keeps publishing independently. |
| **Cross-source duplicates** | Once §4a discovers a transaction and §4b discovers Neo3Scan's record of it, `broadcast_tx_hash` is the join key. |

---

## 5. Metric recommendation

**Do not combine these mechanisms into one "Vote participation" percentage.** None of the candidate
denominators is currently complete enough to support one — `neo.community` alone misses operational
decisions entirely (§ headline finding 1); Neo3Scan alone has one decision on record; and a
hand-built "every committee-gated native contract call" denominator is only complete-in-principle,
since §2 found five qualifying transactions **by the methods this research used**, explicitly not
claiming that's every one that exists.

**Recommendation: three separate, clearly-labeled evidence categories, with raw counts, not a
rate, in any of them:**

1. **`neo.community` recorded votes** — the existing metric, unchanged, clearly scoped as
   discussion-platform activity.
2. **Executed Council approvals** — signatures actually included in a confirmed on-chain multisig
   witness (§1.6's highest-confidence category), by mechanism, each with a transaction hash link.
3. **Additional documented signatures** — valid signatures recorded off-chain (Neo3Scan, or any
   future similar tool) that were **not** used in the final executed witness. **This category must
   not be described as "showed up to vote" on its own** — Proposal #12 shows exactly why: AxLabs and
   NGD8 belong here, and their signatures are real and cryptographically valid, but describing this
   category alone as "voted" would misstate what it captures (it can, and here does, omit genuine
   additional signers who happen to already be represented by category 2's quorum) and would blur
   the durability difference from category 2.

**Per-member, per-decision states — exactly the five from §3, restated for the metric itself:**

| State | When it applies |
|---|---|
| Included in executed witness | Category 2, above. |
| Additional signature recorded off-chain | Category 3, above — never merged into category 2's count. |
| No verifiable signature found | Neutral, not a judgment (§3). |
| Not eligible | Public key verified outside the committee at the relevant timestamp (§1.8's three-timestamp model, per decision). |
| Unknown / source incomplete | The honest default whenever §2's discovery gaps, §1.2's undocumented-API risk, or an unconfirmed mechanism mean a confident state can't be assigned. |

**No percentage should be published for any of this until the mechanism catalogue (§2) is
demonstrably complete** — this research explicitly documents what completeness would require and
did not attempt it.

---

## 6. Worked evidence

### 6.1 Proposal #12 — the full worked example

Fully detailed in §1.6, using the states from §3:

- **11 members — Included in executed witness:** Red4Sec, NeoSPCC, Neo News Today, Flamingo, R3E,
  COZ, NGD4, NEXT（NeoLine）, Switcheo Labs, HashKey Cloud, Everstake.
- **2 members — Additional signature recorded off-chain, independently cryptographically verified
  by this research (§1.5):** AxLabs (neow3j), NGD8.
- **8 members — No verifiable signature found:** NF1, The Neo Order, NGD6, BinanceStaking1,
  lazynode, bNEO representative, MakeNeoGreatAgain, and **Nash.io** — the last of these eligible
  under the April-2026 committee that actually governed this decision, despite being entirely absent
  from this project's current roster (§1.6).
- **Committee stability:** independently confirmed unchanged across creation, every individual
  signature, and execution (§1.8) — all three of §1.8's candidate timestamps agree for this specific
  decision.
- **Likely (not certain) connection to `neo.community` Proposal #7:** identical parameter values,
  no explicit cross-reference field — a reasonable inference, not a confirmed fact.

### 6.2 The June 2025 RoleManagement designation — a second real decision, a different mechanism, and a direct test of this project's existing tooling

Discovered via `api.n3index.dev/v1/networks/mainnet/contracts/0x49cf4e5378ffcd4dec034fd98a174c5491e395e2/notifications`
(RoleManagement's own notification history — 4 events found this way, ever, per §2's discovery-limits
caveat). The most recent: `0xf62caf49eb0c994be9bb72f909c9281fe3778184c144ed73c488f29411bf8c8b`,
block 7,438,313 (2025-06-09T10:35:55.878Z).

- **Independently confirmed via RPC:** `vmstate: "HALT"`; script contains the literal method name
  `designateAsRole`; the witness's verification script decodes to **21 public keys, `PUSH11`
  threshold** — the same multisig shape as Proposal #12, a different (2025-era) committee.
- **The `Designation` event** shows role `4` (`StateValidator`) with an *old* array of 4 public keys
  and a *new* array of 4 — a real role rotation.
- **Direct test of this project's own tooling:** queried this project's existing historical-committee
  method at block 7,438,313, and **the resulting 21 public keys are an exact set match** to the
  transaction's own verification script — independently proving the transaction's claimed committee
  is correct, and that the existing method works unmodified for a mechanism it was never built for.
- **Predates Neo3Scan by roughly 8 months** and used some other, currently unidentified coordination
  process. **On how that coordination happened:** a separate AI assistant's own conversation
  transcript (supplied by the user as untrusted discovery material, not this project's work)
  describes a plausible-sounding generic process — off-chain drafting, sharing one canonical unsigned
  transaction, sequential `neo-cli`/wallet-based signing member-by-member, manual signature
  collection until quorum, then broadcast. **This research did not find that description confirmed
  in any Neo documentation, `neo-project` repository history, or named ecosystem source, and did not
  attempt to verify it.** It is kept here explicitly labeled as an unverified hypothesis from that
  transcript — plausible, structurally consistent with how a multisig witness must mechanically be
  assembled, but not independently established — rather than either asserting it as fact or deleting
  a real (if unconfirmed) lead. §7 keeps this as an open question for Tyler Adams/COZ rather than
  guessing further.

### 6.3 The earlier RoleManagement events — real but not deeply investigated

Three more, older events, confirmed to exist but not individually decoded in this pass: block 25591
(2021-08-07, role `16` = `NeoFSAlphabetNode`), block 1305 (2021-08-02, role `4` =
`StateValidator`), and block 1288 (2021-08-02, role `8` = `Oracle`). Real evidence this mechanism has
recurred across Neo N3's history for at least three role types, though full independent verification
(as done for §6.2) was not repeated for these three.

---

## 7. Questions for Tyler Adams, COZ, Neo Foundation, NGD, or Neo3Scan maintainers

Kept short and unresolved deliberately — none of these are guessed at above.

1. Is `neo.community` Proposal #7 formally the approval step for Neo3Scan Proposal #12's execution,
   or is the parameter-value match a coincidence of two independently-run initiatives?
2. Why does Neo3Scan's governance overview page label `NU6wVcRy9mb81YxZcxrpBudVn7d4MTDqEz` as the
   "Committee Multi-Sig" address when Proposal #12 was actually signed by a different,
   independently-derivable address?
3. Why does proposal numbering on Neo3Scan start at 12 — were there 11 earlier drafts or test
   entries, and are any recoverable?
4. What coordination method was actually used for the pre-Neo3Scan `RoleManagement` designations
   (2021, 2025)? (A generic off-chain-drafting/sequential-`neo-cli`-signing process has been
   described in passing by a third-party AI assistant, but this research found no documentation or
   repository evidence confirming it applies to these specific transactions — can COZ or NGD confirm
   or correct it?) Is there any surviving record of who was asked and who declined?
5. Is `www.neo3scan.com/api/multisig/*` intended as a stable, publicly-consumable API?
6. What does `governance_mode: "official"` imply exists as an alternative?
7. Is there a canonical, complete list of every native-contract method requiring committee witness?
8. For AxLabs's and NGD8's signatures on Proposal #12 — now independently confirmed
   cryptographically valid (§1.5) but absent from the executed witness — was there a specific
   selection policy for which 11 of the (at least) 13 valid signatures got embedded, or was it simply
   whichever 11 existed first once quorum was reached?

---

## Sources

- `https://www.neo3scan.com/tools/governance/12` (rendered page) and
  `https://www.neo3scan.com/api/multisig/requests/12?network=mainnet` — re-fetched fresh for this
  revision, 2026-09-07
- `https://www.neo3scan.com/api/multisig/requests?network=mainnet` (list) — retrieved 2026-09-07
- `https://neo3scan.com/tools/governance` (overview page, "Committee Multi-Sig" label) — retrieved 2026-09-07
- `https://neo3scan.com/api-docs` — retrieved 2026-09-07
- `https://api.n3index.dev/v1/networks/mainnet/accounts/NeWfLvaPzHZFoGbianvK8wJBqkwGucjeHZ`,
  `.../contracts/0xcc5e4edd9f5f8dba8bb65734541df7a1c081c67b`,
  `.../contracts/0x49cf4e5378ffcd4dec034fd98a174c5491e395e2/notifications` — retrieved 2026-09-07
- `https://mainnet2.neo.coz.io:443` JSON-RPC (`getrawtransaction`, `getstateroot`, `getstate`,
  `getblockheader`, `getnativecontracts`) — the same RPC node already trusted by
  `scripts/fetch-council-history.mjs` — queried directly, including four separate historical-state
  queries for §1.8's committee-stability check, 2026-09-07
- Independent ECDSA signature re-verification (§1.5) performed with Node.js's built-in `crypto`
  module against `params.unsigned_tx`'s sign-data, validated first against a known-on-chain-good
  signature before being applied to the two off-chain-only ones — 2026-09-07
- `data/governance.json`, `data/council-history.json`, `data/council-roster.json`,
  `scripts/fetch-council-history.mjs`, `docs/COUNCIL-HISTORY-RECONSTRUCTION.md`, `docs/DECISIONS.md`
  (this repository) — checked 2026-09-07
- `github.com/neo-project/neo`, `src/Neo/SmartContract/Native/{PolicyContract,NativeContract,
  RoleManagement,OracleContract,NeoToken}.cs`, fetched at `master` commit
  `b108895ac6601d21b89d47c5f5589b9a8a948ded` via the GitHub contents API — retrieved 2026-09-07
- `github.com/neo-project/neo`, `src/neo/SmartContract/Native/PolicyContract.cs` at tag `v3.0.0`
  (the original Neo N3 mainnet launch release) — retrieved 2026-09-07, used specifically to confirm
  which PolicyContract methods existed at genesis (§2.1)
- "Neo3Scan Ai Assistant Answers.md" (user-supplied transcript of a separate Neo3Scan AI assistant
  conversation) — treated throughout as **untrusted discovery material**, never as a primary source;
  every claim from it was either independently confirmed or rejected against `neo-project/neo`
  source in this pass (§2.1–§2.3, §6.2)
