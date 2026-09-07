// Reconstructs, for every governance proposal, the Council committee (top 21) that was in
// effect at the last block at or before the proposal's UTC creation time, then derives each
// current member's eligible-proposal participation percentage from that history.
//
// Method (see docs/COUNCIL-HISTORY-RECONSTRUCTION.md for the investigation this implements):
// `getCommittee` itself has no historical parameter, but the value it returns is a cached
// NeoToken storage slot (Prefix_Committee = 14 / 0x0E) that is queryable at a past state root
// via the StateService plugin's `getstate`, on any RPC node running `FullState: true`. Two
// independently operated full-state nodes are queried and must return byte-identical raw
// storage bytes before that height's committee is trusted.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_GOVERNANCE_INPUT = resolve(HERE, "../data/governance.json");
const DEFAULT_ROSTER = resolve(HERE, "../data/council-roster.json");
const DEFAULT_OUTPUT = resolve(HERE, "../data/council-history.json");

// Exactly the two RPC sources this feature was verified against (see the investigation doc).
// `rpc1.n3.nspcc.ru` is deliberately excluded here: it runs `KeepOnlyLatestState` and returns
// error -606 for any historical `getstate` call, which was confirmed live, not assumed.
const DEFAULT_RPC_URLS = ["https://mainnet2.neo.coz.io:443", "https://n3seed1.ngd.network:10332"];

const NEO_TOKEN_HASH = "0xef4073a0f2b305a38ec4050e4d3d28bc40ea63f5";
const COMMITTEE_STORAGE_KEY_BASE64 = "Dg=="; // Prefix_Committee = 14 = 0x0E
const COMMITTEE_SIZE = 21;

function assert(condition, message) {
  if (!condition) throw new Error(`Council history validation failed: ${message}`);
}

// ---------------------------------------------------------------------------
// UTC-explicit timestamp parsing (requirement: treat createdAt explicitly as UTC,
// regardless of whether the source string carries a trailing "Z" — the governance
// API's own `created_at` values never do).
// ---------------------------------------------------------------------------

const CREATED_AT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z)?$/;

export function parseCreatedAtUtc(value) {
  assert(typeof value === "string" && value.trim(), "createdAt is missing or not a string");
  const match = CREATED_AT_PATTERN.exec(value.trim());
  assert(match, `createdAt "${value}" is not a recognized UTC-explicit timestamp`);
  const [, year, month, day, hour, minute, second, fraction] = match;
  const milliseconds = fraction ? Number(fraction.padEnd(3, "0").slice(0, 3)) : 0;
  const epochMs = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), milliseconds);
  assert(Number.isFinite(epochMs), `createdAt "${value}" could not be converted to a UTC instant`);
  return epochMs;
}

// ---------------------------------------------------------------------------
// Generic NEO VM StackItem binary decoder (the format contract storage caches
// IInteroperable values in). Confirmed against `neo-project/neo`'s
// `NeoToken.CachedCommittee` (an `Array` of 2-field `Struct`s: ByteString pubkey,
// Integer votes) — see docs/COUNCIL-HISTORY-RECONSTRUCTION.md §2.
// ---------------------------------------------------------------------------

const STACK_ITEM_TYPE = {
  ANY: 0x00,
  POINTER: 0x10,
  BOOLEAN: 0x20,
  INTEGER: 0x21,
  BYTE_STRING: 0x28,
  BUFFER: 0x30,
  ARRAY: 0x40,
  STRUCT: 0x41,
  MAP: 0x48,
};

function readCompactLength(buffer, offset) {
  assert(offset < buffer.length, "truncated StackItem length prefix");
  const first = buffer[offset];
  if (first < 0xfd) return { length: first, next: offset + 1 };
  if (first === 0xfd) {
    assert(offset + 3 <= buffer.length, "truncated 2-byte StackItem length");
    return { length: buffer.readUInt16LE(offset + 1), next: offset + 3 };
  }
  if (first === 0xfe) {
    assert(offset + 5 <= buffer.length, "truncated 4-byte StackItem length");
    return { length: buffer.readUInt32LE(offset + 1), next: offset + 5 };
  }
  assert(offset + 9 <= buffer.length, "truncated 8-byte StackItem length");
  const big = buffer.readBigUInt64LE(offset + 1);
  assert(big <= BigInt(Number.MAX_SAFE_INTEGER), "StackItem length exceeds a safe integer");
  return { length: Number(big), next: offset + 9 };
}

function decodeSignedLittleEndian(bytes) {
  if (bytes.length === 0) return 0n;
  let value = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) value = (value << 8n) | BigInt(bytes[index]);
  const bitLength = BigInt(bytes.length * 8);
  const signBit = 1n << (bitLength - 1n);
  if (value & signBit) value -= 1n << bitLength;
  return value;
}

export function decodeStackItem(buffer, offset = 0) {
  assert(offset < buffer.length, "unexpected end of StackItem buffer");
  const type = buffer[offset];
  let position = offset + 1;
  switch (type) {
    case STACK_ITEM_TYPE.ANY:
      return { value: null, next: position };
    case STACK_ITEM_TYPE.BOOLEAN: {
      assert(position < buffer.length, "truncated Boolean StackItem");
      return { value: buffer[position] !== 0, next: position + 1 };
    }
    case STACK_ITEM_TYPE.INTEGER: {
      const { length, next } = readCompactLength(buffer, position);
      position = next;
      assert(position + length <= buffer.length, "truncated Integer StackItem");
      const bytes = buffer.subarray(position, position + length);
      position += length;
      return { value: decodeSignedLittleEndian(bytes), next: position };
    }
    case STACK_ITEM_TYPE.BYTE_STRING:
    case STACK_ITEM_TYPE.BUFFER: {
      const { length, next } = readCompactLength(buffer, position);
      position = next;
      assert(position + length <= buffer.length, "truncated ByteString/Buffer StackItem");
      const bytes = Buffer.from(buffer.subarray(position, position + length));
      position += length;
      return { value: bytes, next: position };
    }
    case STACK_ITEM_TYPE.ARRAY:
    case STACK_ITEM_TYPE.STRUCT: {
      const { length: count, next } = readCompactLength(buffer, position);
      position = next;
      const items = [];
      for (let index = 0; index < count; index += 1) {
        const item = decodeStackItem(buffer, position);
        items.push(item.value);
        position = item.next;
      }
      return { value: items, next: position };
    }
    case STACK_ITEM_TYPE.MAP: {
      const { length: count, next } = readCompactLength(buffer, position);
      position = next;
      const entries = [];
      for (let index = 0; index < count; index += 1) {
        const key = decodeStackItem(buffer, position);
        position = key.next;
        const mapValue = decodeStackItem(buffer, position);
        position = mapValue.next;
        entries.push([key.value, mapValue.value]);
      }
      return { value: entries, next: position };
    }
    default:
      throw new Error(`Council history validation failed: unsupported StackItem type 0x${type.toString(16)}`);
  }
}

export function decodeCommitteeValue(base64Value) {
  assert(typeof base64Value === "string" && base64Value.length > 0, "committee storage value is missing");
  const buffer = Buffer.from(base64Value, "base64");
  const { value: items, next } = decodeStackItem(buffer, 0);
  assert(next === buffer.length, "committee storage value has trailing bytes after the outer Array");
  assert(Array.isArray(items), "committee storage value is not an Array");
  return items.map((entry, index) => {
    assert(Array.isArray(entry) && entry.length === 2, `committee entry ${index} is not a two-field Struct`);
    const [publicKeyBytes, votes] = entry;
    assert(Buffer.isBuffer(publicKeyBytes) && publicKeyBytes.length === 33, `committee entry ${index} public key is not a 33-byte ByteString`);
    assert(publicKeyBytes[0] === 0x02 || publicKeyBytes[0] === 0x03, `committee entry ${index} public key has an invalid compressed-point prefix`);
    assert(typeof votes === "bigint", `committee entry ${index} votes field is not an Integer`);
    return { publicKey: publicKeyBytes.toString("hex").toLowerCase(), votes: votes.toString(), rankByVotes: index + 1 };
  });
}

export function validateCommittee(entries) {
  assert(Array.isArray(entries), "committee is not an array");
  assert(entries.length === COMMITTEE_SIZE, `committee must contain exactly ${COMMITTEE_SIZE} members (found ${entries.length})`);
  const seen = new Set();
  for (const entry of entries) {
    assert(/^(02|03)[0-9a-f]{64}$/.test(entry.publicKey), `invalid committee public key ${entry.publicKey}`);
    assert(!seen.has(entry.publicKey), `duplicate committee public key ${entry.publicKey}`);
    seen.add(entry.publicKey);
  }
  assert(seen.size === COMMITTEE_SIZE, `committee does not contain ${COMMITTEE_SIZE} unique public keys`);
  return entries;
}

// ---------------------------------------------------------------------------
// Timestamp -> block height boundary search. `getBlockTime` is injected so this
// is testable without a network call (see the fixture-based tests).
// ---------------------------------------------------------------------------

export async function findBoundaryHeight(targetMs, { minHeight = 0, maxHeight, getBlockTime }) {
  assert(Number.isInteger(minHeight) && minHeight >= 0, "boundary search minHeight is invalid");
  assert(Number.isInteger(maxHeight) && maxHeight >= minHeight, "boundary search maxHeight is invalid");
  assert(typeof getBlockTime === "function", "boundary search requires a getBlockTime function");
  // Binary search for the smallest height whose time is strictly after the target;
  // the boundary block is the one immediately before it.
  let low = minHeight;
  let high = maxHeight + 1;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    const time = await getBlockTime(mid);
    if (time <= targetMs) low = mid + 1;
    else high = mid;
  }
  const boundary = low - 1;
  assert(boundary >= minHeight, "no block at or before the target timestamp exists in the searched range");
  return boundary;
}

export async function assertBoundaryAgreement(boundaryHeight, targetMs, getBlockTime) {
  const atBoundary = await getBlockTime(boundaryHeight);
  const afterBoundary = await getBlockTime(boundaryHeight + 1);
  assert(atBoundary <= targetMs, `boundary disagreement: block ${boundaryHeight} time is after the target`);
  assert(afterBoundary > targetMs, `boundary disagreement: block ${boundaryHeight + 1} time is not after the target`);
}

// ---------------------------------------------------------------------------
// Two-source agreement (pulled out of resolveProposalRecord so it's directly
// testable without a network call).
// ---------------------------------------------------------------------------

export function assertStateRootAgreement(rootA, rootB, context) {
  assert(rootA?.roothash && rootB?.roothash, `state root request failed for ${context}`);
  assert(rootA.roothash.toLowerCase() === rootB.roothash.toLowerCase(), `${context}: sources disagree on the state root`);
}

export function assertRawCommitteeAgreement(rawA, rawB, context) {
  assert(typeof rawA === "string" && rawA.length > 0, `${context}: first source returned no committee value`);
  assert(typeof rawB === "string" && rawB.length > 0, `${context}: second source returned no committee value`);
  assert(rawA === rawB, `${context}: sources returned different raw committee storage bytes`);
}

// ---------------------------------------------------------------------------
// Roster + eligibility + participation
// ---------------------------------------------------------------------------

function normalizeKey(value) {
  assert(typeof value === "string" && /^(02|03)[0-9a-f]{64}$/i.test(value), `invalid public key ${value}`);
  return value.toLowerCase();
}

function validateRoster(roster) {
  assert(roster?.schemaVersion === 1, "Council roster schema is unsupported");
  assert(Array.isArray(roster.members) && roster.members.length === 21, "Council roster must contain 21 members");
  const members = roster.members.map((member) => ({ ...member, publicKey: normalizeKey(member.publicKey) }));
  assert(new Set(members.map((member) => member.publicKey)).size === 21, "Council roster contains duplicate keys");
  return members;
}

export function bandForPercent(eligibleCount, percent) {
  if (eligibleCount === 0 || percent === null) return "not-eligible";
  if (percent === 0) return "empty";
  if (percent < 50) return "red";
  if (percent < 75) return "yellow";
  return "green";
}

export function buildCouncilHistorySnapshot({ governanceSnapshot, roster, proposalRecords, fetchedAt = new Date().toISOString(), sources }) {
  assert(governanceSnapshot?.schemaVersion === 2, "governance snapshot schema is unsupported");
  assert(Array.isArray(governanceSnapshot.proposals) && governanceSnapshot.proposals.length > 0, "governance snapshot has no proposals");
  const members = validateRoster(roster);

  assert(Array.isArray(proposalRecords), "proposal records are not an array");
  assert(
    proposalRecords.length === governanceSnapshot.proposals.length,
    `council history must cover every proposal in the governance snapshot (expected ${governanceSnapshot.proposals.length}, got ${proposalRecords.length})`,
  );

  const proposalNumbers = new Set(governanceSnapshot.proposals.map((proposal) => proposal.number));
  const recordByNumber = new Map();
  for (const record of proposalRecords) {
    assert(Number.isInteger(record.number) && proposalNumbers.has(record.number), `council history references unknown proposal #${record.number}`);
    assert(!recordByNumber.has(record.number), `duplicate council history record for proposal #${record.number}`);
    assert(Number.isInteger(record.blockHeight) && record.blockHeight >= 0, `proposal #${record.number} has an invalid block height`);
    assert(!Number.isNaN(Date.parse(record.blockTimeUtc)), `proposal #${record.number} has an invalid block timestamp`);
    assert(/^0x[0-9a-f]{64}$/i.test(record.stateRoot), `proposal #${record.number} has an invalid state root`);
    assert(Array.isArray(record.sources) && record.sources.length >= 2, `proposal #${record.number} must record at least two corroborating sources`);
    const committee = validateCommittee(record.committee);
    recordByNumber.set(record.number, { ...record, committee });
  }
  for (const number of proposalNumbers) assert(recordByNumber.has(number), `council history is missing proposal #${number}`);

  const eligibleSetByNumber = new Map(
    [...recordByNumber.entries()].map(([number, record]) => [number, new Set(record.committee.map((entry) => entry.publicKey))]),
  );

  // Every recorded vote is checked against the historical committee-at-open — including votes
  // from a public key no longer in the current roster (e.g. Nash.io). governance.json's own
  // `excludedVotes`/`currentCouncilMember` flag is about *today's* roster, not about whether the
  // voter actually held a seat *at the time of that proposal*; those are different questions, and
  // conflating them would let a genuinely ineligible historical vote pass unnoticed. Only the
  // displayed participation percentages (below) are limited to the current roster.
  const conflicts = [];
  const eligibleVotesByMember = new Map(members.map((member) => [member.publicKey, []]));
  for (const proposal of governanceSnapshot.proposals) {
    const eligibleSet = eligibleSetByNumber.get(proposal.number);
    for (const vote of proposal.votes ?? []) {
      if (!eligibleSet.has(vote.publicKey)) {
        conflicts.push({
          proposalNumber: proposal.number,
          publicKey: vote.publicKey,
          organizationName: vote.organizationName,
          currentCouncilMember: Boolean(vote.currentCouncilMember),
          reason: "recorded-vote-from-a-public-key-not-in-the-committee-at-proposal-open",
          eligibleCommitteeAtOpen: [...eligibleSet].sort(),
        });
        continue;
      }
      // Only a current-roster member's eligible votes feed the participation calculation below.
      const bucket = eligibleVotesByMember.get(vote.publicKey);
      if (bucket) bucket.push(proposal.number);
    }
  }

  if (conflicts.length > 0) {
    const error = new Error(
      `Council history validation failed: ${conflicts.length} recorded vote(s) attributed to a public key that was not eligible for that proposal`,
    );
    error.conflicts = conflicts;
    throw error;
  }

  const sortedProposalNumbers = [...proposalNumbers].sort((a, b) => a - b);
  const participation = members
    .map((member) => {
      const eligibleProposalNumbers = sortedProposalNumbers.filter((number) => eligibleSetByNumber.get(number).has(member.publicKey));
      const recordedEligibleVoteNumbers = eligibleVotesByMember.get(member.publicKey).sort((a, b) => a - b);
      const eligibleProposalCount = eligibleProposalNumbers.length;
      const recordedEligibleVoteCount = recordedEligibleVoteNumbers.length;
      const fraction = eligibleProposalCount > 0 ? (recordedEligibleVoteCount / eligibleProposalCount) * 100 : null;
      const participationPercent = fraction === null ? null : Math.round(fraction);
      return {
        publicKey: member.publicKey,
        name: member.name,
        rank: member.rank,
        eligibleProposalCount,
        eligibleProposalNumbers,
        recordedEligibleVoteCount,
        recordedEligibleVoteNumbers,
        participationPercent,
        participationBand: bandForPercent(eligibleProposalCount, participationPercent),
      };
    })
    .sort((a, b) => a.rank - b.rank);

  return {
    schemaVersion: 1,
    fetchedAt,
    method: "neotoken-storage-cross-node-corroboration",
    eligibilityRule:
      "A member is eligible for a proposal only if their candidate public key was present in the Council committee (top 21) at the last block at or before the proposal's UTC creation time. Eligibility and recorded votes are matched only by stable candidate public key.",
    sources,
    proposals: [...recordByNumber.values()].sort((a, b) => a.number - b.number),
    participation,
  };
}

// ---------------------------------------------------------------------------
// Live RPC orchestration
// ---------------------------------------------------------------------------

async function rpc(rpcUrl, method, params = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  assert(response.ok, `RPC ${method} failed with HTTP ${response.status} against ${rpcUrl}`);
  const payload = await response.json();
  assert(!payload.error, `RPC ${method} against ${rpcUrl} returned ${payload.error?.message ?? "an error"}`);
  return payload.result;
}

function makeBlockTimeGetter(rpcUrl, cache) {
  return async (height) => {
    const key = `${rpcUrl}:${height}`;
    if (cache.has(key)) return cache.get(key);
    const header = await rpc(rpcUrl, "getblockheader", [height, true]);
    assert(Number.isFinite(header?.time), `RPC getblockheader(${height}) against ${rpcUrl} returned an invalid time`);
    cache.set(key, header.time);
    return header.time;
  };
}

async function resolveProposalRecord(proposal, { rpcUrls, currentHeight, timeCache }) {
  const [primaryUrl, secondaryUrl] = rpcUrls;
  const targetMs = parseCreatedAtUtc(proposal.createdAt);

  const getPrimaryTime = makeBlockTimeGetter(primaryUrl, timeCache);
  const boundaryHeight = await findBoundaryHeight(targetMs, { minHeight: 0, maxHeight: currentHeight, getBlockTime: getPrimaryTime });

  const getSecondaryTime = makeBlockTimeGetter(secondaryUrl, timeCache);
  await assertBoundaryAgreement(boundaryHeight, targetMs, getSecondaryTime);

  const boundaryTimeMs = await getPrimaryTime(boundaryHeight);

  const [rootA, rootB] = await Promise.all([
    rpc(primaryUrl, "getstateroot", [boundaryHeight]),
    rpc(secondaryUrl, "getstateroot", [boundaryHeight]),
  ]);
  assertStateRootAgreement(rootA, rootB, `proposal #${proposal.number} at height ${boundaryHeight}`);

  const [rawA, rawB] = await Promise.all([
    rpc(primaryUrl, "getstate", [rootA.roothash, NEO_TOKEN_HASH, COMMITTEE_STORAGE_KEY_BASE64]),
    rpc(secondaryUrl, "getstate", [rootB.roothash, NEO_TOKEN_HASH, COMMITTEE_STORAGE_KEY_BASE64]),
  ]);
  assertRawCommitteeAgreement(rawA, rawB, `proposal #${proposal.number} at height ${boundaryHeight}`);

  const committee = validateCommittee(decodeCommitteeValue(rawA));

  return {
    number: proposal.number,
    proposalId: proposal.id,
    createdAt: proposal.createdAt,
    createdAtUtc: new Date(targetMs).toISOString(),
    blockHeight: boundaryHeight,
    blockTimeUtc: new Date(boundaryTimeMs).toISOString(),
    stateRoot: rootA.roothash.toLowerCase(),
    sources: [primaryUrl, secondaryUrl],
    rawValueBase64: rawA,
    committee,
  };
}

export async function fetchCouncilHistory({
  rpcUrls = (process.env.QUORUM_WATCH_STATE_RPC_URLS?.split(",").map((url) => url.trim()).filter(Boolean) ?? DEFAULT_RPC_URLS),
  governancePath = DEFAULT_GOVERNANCE_INPUT,
  rosterPath = DEFAULT_ROSTER,
} = {}) {
  assert(Array.isArray(rpcUrls) && rpcUrls.length === 2, "exactly two corroborating StateService RPC sources are required");
  const governanceSnapshot = JSON.parse(await readFile(governancePath, "utf8"));
  const roster = JSON.parse(await readFile(rosterPath, "utf8"));

  const currentHeight = (await rpc(rpcUrls[0], "getblockcount")) - 1;
  assert(Number.isInteger(currentHeight) && currentHeight > 0, `RPC block count is invalid for ${rpcUrls[0]}`);

  const timeCache = new Map();
  const proposalRecords = [];
  for (const proposal of governanceSnapshot.proposals) {
    // Sequential, not Promise.all: each proposal's binary search reuses the shared time
    // cache, and sequencing keeps RPC load on the two public archival nodes predictable.
    proposalRecords.push(await resolveProposalRecord(proposal, { rpcUrls, currentHeight, timeCache }));
  }

  return buildCouncilHistorySnapshot({
    governanceSnapshot,
    roster,
    proposalRecords,
    sources: {
      rpcUrls,
      corroborationRule:
        "Both RPC sources must be running StateService with FullState:true and must return byte-identical raw committee storage bytes (NeoToken storage key 0x0E) at the same state root; any HTTP/RPC error or disagreement fails the run closed without replacing the previous snapshot.",
      neoTokenContractHash: NEO_TOKEN_HASH,
      committeeStorageKeyBase64: COMMITTEE_STORAGE_KEY_BASE64,
      stateRootMethod: "getstateroot",
      stateReadMethod: "getstate",
      boundaryMethod: "getblockheader(height, true).time, binary-searched against the proposal's UTC createdAt",
      methodology: "docs/COUNCIL-HISTORY-RECONSTRUCTION.md",
    },
  });
}

export async function writeCouncilHistorySnapshot(snapshot, outputPath = process.env.QUORUM_WATCH_COUNCIL_HISTORY_OUTPUT ?? DEFAULT_OUTPUT) {
  assert(snapshot, "no council history snapshot to write");
  const target = resolve(outputPath);
  const temporary = `${target}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporary, target);
  return target;
}

async function main() {
  const snapshot = await fetchCouncilHistory();
  const output = await writeCouncilHistorySnapshot(snapshot);
  console.log(`Wrote historical eligibility for ${snapshot.proposals.length} proposals and ${snapshot.participation.length} members to ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    if (error.conflicts) console.error("Conflicting evidence:", JSON.stringify(error.conflicts, null, 2));
    if (error.cause) console.error("Caused by:", error.cause);
    process.exitCode = 1;
  });
}
