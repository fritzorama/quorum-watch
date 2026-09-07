# Reconstructing the historical Neo N3 Council (top 21) at a proposal's block height

**Status: investigation notes, added to `docs/` for reference on 2026-09-07. Not committed or pushed. Nothing else in the repository was touched.** This is not yet an implemented feature — see `docs/STATUS.md`'s LATER section for where this fits.

Everything below was tested live against public mainnet RPC nodes on 2026-09-07. Every request shown is copy/pasteable and reproducible; where a claim can't be reproduced, it's marked as such.

---

## 1. Answer to the core question

**Yes.** `getCommittee` itself is a *live-state-only* RPC method — it takes no height/root parameter and always reads the current snapshot. There is no historical variant of it.

But the value it reads is not computed on the fly — it's a **cached value in NeoToken contract storage**, recomputed only every `CommitteeMembersCount` (21) blocks. That storage slot *is* retrievable historically, through the **StateService plugin's MPT-backed state queries** (`getstate` / `findstates` / `getproof`), **provided the RPC node retains full historical state** (`FullState: true`, not the default `KeepOnlyLatestState`).

So: no historical *invocation*, but yes, historical *state read* of the exact same cached value `getCommittee()` would have returned at that height — confirmed against live C# source and two independent public nodes, worked example below.

---

## 2. Exact RPC methods and parameters

| Step | Method | Params | Notes |
|---|---|---|---|
| 1 | `getblockheader` | `[height, true]` → read `.time` (ms since epoch) | Used to binary-search a timestamp → block height. Block time is **not constant** — 3000ms today, was different before the `Faun`/`Gorgon` hardforks — so linear extrapolation from timestamp is unreliable; binary search on real headers is not. |
| 2 | `getstateroot` | `[height]` → `.roothash` | Requires **StateService** plugin. Works even on nodes that don't keep full historical *state* — it only needs the header chain, not the MPT. |
| 3 | `getstate` | `[roothash, contractHash, base64Key]` → raw value | Requires **StateService with `FullState: true`**. Returns the raw serialized value at that historical root. Single most direct call for this use case. |
| 3b | `findstates` | `[roothash, contractHash, base64Prefix, base64From?]` | Same requirement as `getstate`; useful to enumerate/discover storage keys rather than guess them. This is how the key below was confirmed empirically before it was cross-checked against source. |
| 3c | `getproof` | `[roothash, contractHash, base64Key]` → base64 proof blob | Same data as `getstate` but with an MPT proof attached; verifiable client-side against the root hash via `verifyproof` (not exercised in this session — see §7). |

**Fixed parameters for this specific query:**

- NeoToken native contract hash: **`0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5`** — confirmed live via `getnativecontracts`, not assumed.
- Committee storage key: **`Prefix_Committee = 14`** (single byte `0x0E`, i.e. base64 `"Dg=="`). Confirmed two ways: (a) empirically, by running `findstates` with an empty prefix and recognizing the committee-shaped blob at key `0x0E`; (b) against the live `neo-project/neo` C# source (`NeoToken.cs`, fetched via GitHub's contents API on 2026-09-07):
  ```csharp
  private const byte Prefix_Committee = 14;
  ...
  private CachedCommittee GetCommitteeFromCache(IReadOnlyStore snapshot)
  {
      return snapshot[CreateStorageKey(Prefix_Committee)].GetInteroperable<CachedCommittee>();
  }
  ```

**Refresh cadence — also confirmed against source, not assumed:**

```csharp
public static bool ShouldRefreshCommittee(uint height, int committeeMembersCount)
    => height % committeeMembersCount == 0;
```

So the committee is recomputed exactly every 21 blocks (`CommitteeMembersCount = 21`). Reading the cache at any height gives you the committee **as it stood at that exact height**, whatever the most recent refresh was — no snapping/rounding needed on your part.

**Storage value format — confirmed against source:**

```csharp
internal class CachedCommittee : InteroperableList<(ECPoint PublicKey, BigInteger Votes)>
{
    protected override StackItem ElementToStackItem((ECPoint, BigInteger) element)
        => new Struct() { element.PublicKey.ToArray(), element.Votes };
}
```
i.e. a NEO VM `Array` of 21 `Struct{ByteString(33-byte compressed pubkey), Integer(votes)}`, ordered by **vote rank** (not alphabetically — `getCommittee()`'s `.OrderBy(p => p)` sort happens only at the very end, after reading the cache). The raw order you get back is the actual rank order at that height, which is incidentally useful: the first 7 entries are that height's consensus validators (`GetNextBlockValidators` just takes `.Take(validatorsCount)` off this same cached list).

---

## 3. Is an archival/full-state node required? — tested, not assumed

Tested `getstateroot`/`getstate` for block **1,000,000** (deep history) against all three RPC hosts this repository already uses in `data/uptime.json`:

| Node | `getstateroot` (old height) | `getstate` (old height) |
|---|---|---|
| `mainnet2.neo.coz.io:443` | ✅ returns root hash | ✅ returns committee bytes |
| `n3seed1.ngd.network:10332` | ✅ returns root hash | ✅ returns **byte-identical** committee bytes |
| `rpc1.n3.nspcc.ru:10331` | ✅ returns root hash | ❌ `-606 "state-based methods are not supported for old states: 'KeepOnlyLatestState' setting is enabled"` |

So: **yes, a full-state node is required**, and it's a specific, named node setting (`FullState: true` vs. the default `KeepOnlyLatestState`) — not a vague "some nodes are better than others." Two of the three nodes this project already polls for uptime data happen to run full-state, and they **agree byte-for-byte** on 2026-09-07's query for a block from years ago. That's a real, free corroboration opportunity, mirroring the project's existing 3-source corroboration pattern for the uptime collector.

One more test worth recording: `maxtraceableblocks` (`2,102,400` per `getversion`) did **not** block this query, even though block 1,000,000 is ~12M blocks behind the current chain tip (far outside that window). That setting governs transaction/witness pruning, not state-service retention — worth confirming this doesn't regress on a future node upgrade, but as observed today it's not a blocker.

---

## 4. Mapping proposal timestamps → block heights

Block time is not constant (`getversion` shows hardforks at heights 1.73M / 4.12M / 5.45M / 5.57M / 7.30M / 8.80M / 12.02M, and this project's own Proposal #7 is literally titled *"Competitive Fee and Blocktime Enhancements"*, right at the 8.8M-height hardfork). So: **binary search on real block headers, not linear extrapolation.**

Algorithm (implemented and run, not hypothetical):
1. Get current height via `getblockcount`.
2. Binary search `[0, currentHeight]`: at each midpoint, `getblockheader(mid, true).time` (ms since epoch); narrow toward the first block whose time is ≥ the target timestamp.
3. ~24–25 RPC round trips per lookup for a chain this size (`log2(13,000,000)`).

---

## 5. Worked examples (reproducible)

Using this repo's own `data/governance.json`.

### Proposal #5 — "European Neo developer hub pilot", createdAt `2025-11-24T12:54:16.479Z`

- Binary search → **height 8,395,675**, actual block time `2025-11-24T12:54:28.973Z` (12.5s after target — within one block).
- `getstateroot(8395675).roothash` = `0xc2e41258799cc7052e206c3461c2e09b731ca15e6d2c29e20b97cc63dbc9a9b9`
- `getstate(<root>, 0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5, "Dg==")` → decoded to 21 public keys:

| # | Public key | Matches current roster (`council-roster.json`)? |
|---|---|---|
| 1 | `0239a374...` | The Neo Order |
| 2 | `03b209fd...` | NF1 |
| 3 | `03d9e8b1...` | NeoSPCC |
| 4 | `039e6e21a49a5698d3840837d4e89770a75d66aaf3520a1dc45b80ea7c16c44908` | **not in current roster** |
| 5 | `029b46bf...` | NGD4 |
| 6 | `02ec143f...` | AxLabs (neow3j) |
| 7 | `02a93d38...` | NGD8 |
| 8 | `02517f55...` | NGD6 |
| 9 | `0389ba00...` | lazynode |
| 10 | `035d574c...` | Everstake |
| 11 | `02946248...` | COZ |
| 12 | `0248a37e...` | Neo News Today |
| 13 | `024036ee...` | HashKey Cloud |
| 14 | `031de8a7...` | Flamingo |
| 15 | `034f7ea4...` | BinanceStaking1 |
| 16 | `03fd04de...` | Nash.io |
| 17 | `02cc10d0...` | InfStones |
| 18 | `0392fbd1...` | Switcheo Labs |
| 19 | `03f27e79...` | MakeNeoGreatAgain |
| 20 | `02237309...` | NEXT（NeoLine） |
| 21 | `03734d4b...` | bNEO representative |

**20 of 21 match today's roster exactly.** One seat (`039e6e21...`) is a public key not present in `data/council-roster.json`'s 2026-09-03 snapshot — i.e., real evidence of a seat change since this proposal.

### Proposal #7 — "Competitive Fee and Blocktime Enhancements", createdAt `2026-02-03T19:13:23.003Z`

- Binary search → **height 8,800,501**, actual block time `2026-02-03T19:13:27.798Z` (4.8s after target).
- `getstateroot(8800501).roothash` = `0xcb7f0a1cc05edcb3ba5c1da1778f4e505d55562519eb8f4885331df383307285`
- Decoded committee: **all 21 keys match the current roster exactly**, including `036eaee5...` (**Red4Sec**) in the seat that was the unmapped key at Proposal #5's height.

**Conclusion from the pair:** Red4Sec's seat began sometime between 2025-11-24 (Prop #5) and 2026-02-03 (Prop #7). That's a real, dated, on-chain-anchored fact this method can now produce for every proposal in `governance.json` — not an inference from names, entirely from public keys.

---

## 6. Sources

- [getstateroot](https://developers.neo.org/docs/n3/reference/rpc/getstateroot) — method signature, `FullState` requirement
- [getproof](https://developers.neo.org/docs/n3/reference/rpc/getproof) — method signature, `FullState` requirement, `-100`/error behavior
- [Governance and Incentives](https://developers.neo.org/docs/n3/foundation/governance) — 21-block committee refresh cadence (also independently confirmed against source, §2)
- [Consensus Nodes Election](https://developers.neo.org/docs/n3/foundation/consensus/vote_validator) — election/voting mechanics
- `neo-project/neo`, `src/Neo/SmartContract/Native/NeoToken.cs`, fetched live via `https://api.github.com/repos/neo-project/neo/contents/src/Neo/SmartContract/Native/NeoToken.cs` on 2026-09-07 — `Prefix_Committee`, `ShouldRefreshCommittee`, `CachedCommittee` serialization (quoted in §2)
- Live RPC calls in this document: `mainnet2.neo.coz.io:443`, `n3seed1.ngd.network:10332`, `rpc1.n3.nspcc.ru:10331` — the same three endpoints already listed in `data/uptime.json`

---

## 7. Failure cases and confidence limits

- **Node config is the binary gate.** `KeepOnlyLatestState` (default, and what `rpc1.n3.nspcc.ru` runs) makes `getstate`/`getproof`/`findstates` fail *completely* for any non-current root, with a distinct, unambiguous error (`-606`). This isn't a fuzzy degradation — a node either has the history or it visibly doesn't.
- **Only 2 of the project's existing 3 RPC sources support this today.** If either `coz.io` or `ngd.network` changes its config, corroboration drops to 1 source, which is weaker than the project's existing 3-source uptime-collector standard. Worth monitoring, not assuming permanent.
- **I did not run `verifyproof`.** `getproof` returns a proof blob verifiable client-side against the root hash without trusting the RPC server at all — that's the strongest form of confidence available and I didn't exercise it this session. What I did instead — reading the same value from two independently-operated nodes and getting byte-identical results — is real corroboration, but weaker than cryptographic proof verification. Implementing `verifyproof` (or equivalent local MPT verification) is the natural next step before treating this as production-grade.
- **My byte-level decode of the storage value was reverse-engineered empirically first, then checked against source** — not written from source-down. I'm confident in it because: (a) it now matches the source's exact serialization description (`Struct{ByteString(33), Integer}` inside an `Array`, quoted above) field-for-field, (b) the Proposal #7 example decoded to *zero* unrecognized keys (21/21 matched the current roster) — a parsing bug would much more plausibly produce garbage or misalignment than a clean 21/21 match, and (c) two independent nodes returned identical raw bytes. I'd still recommend a from-scratch NEO VM StackItem deserializer (or reusing an existing one from a Neo SDK) over my ad hoc byte scanner before shipping this in the actual fetcher script.
- **This gives you committee (top 21), not validators-with-names for eras before an org's current name/branding existed**, and it says nothing about *why* a seat changed hands (resignation, vote shift, disqualification) — only that it did, and at which block.
- **Timestamp→height mapping is exact to the nearest block** (confirmed within 5–13 seconds in both worked examples), not an estimate — but a proposal's `createdAt` is itself sourced from the governance API, not from chain data, so this method inherits whatever precision that API's clock has.

---

## 8. Proposed effective-dated data structure

```json
{
  "schemaVersion": 1,
  "method": "neotoken-storage-cross-node-corroboration",
  "generatedAt": "2026-09-07T00:00:00.000Z",
  "sources": {
    "rpcUrls": ["https://mainnet2.neo.coz.io:443", "https://n3seed1.ngd.network:10332"],
    "corroborationRule": "Both sources must return byte-identical raw storage values for the committee key at the same state root; disagreement fails closed.",
    "neoTokenContractHash": "0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5",
    "committeeStorageKeyBase64": "Dg==",
    "verified": "getproof/verifyproof not yet implemented — corroboration is cross-node agreement only, not cryptographic MPT proof verification"
  },
  "intervals": [
    {
      "proposalNumber": 5,
      "proposalId": "69245578684209924c5fbe0b",
      "blockHeight": 8395675,
      "blockTimeUtc": "2025-11-24T12:54:28.973Z",
      "stateRoot": "0xc2e41258799cc7052e206c3461c2e09b731ca15e6d2c29e20b97cc63dbc9a9b9",
      "committee": [
        { "publicKey": "0239a374...", "rankByVotes": 1 },
        { "publicKey": "039e6e21a49a5698d3840837d4e89770a75d66aaf3520a1dc45b80ea7c16c44908", "rankByVotes": 4, "matchesCurrentRoster": false }
      ]
    },
    {
      "proposalNumber": 7,
      "proposalId": "698248d380b112125a296fc4",
      "blockHeight": 8800501,
      "blockTimeUtc": "2026-02-03T19:13:27.798Z",
      "stateRoot": "0xcb7f0a1cc05edcb3ba5c1da1778f4e505d55562519eb8f4885331df383307285",
      "committee": [ "...21 entries..." ]
    }
  ]
}
```

Design notes matching this project's existing rules:
- Keyed by **public key**, never by org name (per the existing Council identity/attribution decisions in `docs/DECISIONS.md`).
- Every interval carries its **block height + state root**, so any claim is independently re-checkable by re-running the same `getstate` call — same spirit as the existing `boundaryEvidence` block in `data/uptime.json`.
- A seat not matching the current roster is recorded as `matchesCurrentRoster: false` with its raw public key, **never** silently resolved to a name or dropped — consistent with the existing `excludedVotes` treatment of Nash.io.
- Two-source corroboration is declared in the schema itself, honestly labeled as *not* cryptographic proof verification, so a future reader doesn't overstate what this method actually guarantees.
