import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCreatedAtUtc,
  decodeCommitteeValue,
  validateCommittee,
  findBoundaryHeight,
  assertBoundaryAgreement,
  assertStateRootAgreement,
  assertRawCommitteeAgreement,
  buildCouncilHistorySnapshot,
  bandForPercent,
} from "../scripts/fetch-council-history.mjs";

// ---------------------------------------------------------------------------
// Test fixture helpers
// ---------------------------------------------------------------------------

function encodeCompactLength(length) {
  assert.ok(length < 0xfd, "test fixtures only need single-byte lengths");
  return Buffer.from([length]);
}

function encodeByteString(bytes) {
  return Buffer.concat([Buffer.from([0x28]), encodeCompactLength(bytes.length), bytes]);
}

function encodeInteger(value) {
  // Minimal little-endian two's complement encoding; 0 encodes as a zero-length integer.
  let n = BigInt(value);
  if (n === 0n) return Buffer.concat([Buffer.from([0x21]), encodeCompactLength(0)]);
  const bytes = [];
  const negative = n < 0n;
  if (negative) n = -n - 1n;
  while (n > 0n || bytes.length === 0) {
    bytes.push(Number(n & 0xffn));
    n >>= 8n;
  }
  if (negative) {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = 0xff - bytes[i];
  }
  const high = bytes[bytes.length - 1];
  if (negative ? (high & 0x80) === 0 : (high & 0x80) !== 0) bytes.push(negative ? 0xff : 0x00);
  const buf = Buffer.from(bytes);
  return Buffer.concat([Buffer.from([0x21]), encodeCompactLength(buf.length), buf]);
}

function encodeStruct(fields) {
  return Buffer.concat([Buffer.from([0x41]), encodeCompactLength(fields.length), ...fields]);
}

function encodeArray(items) {
  return Buffer.concat([Buffer.from([0x40]), encodeCompactLength(items.length), ...items]);
}

function fakePublicKey(seed) {
  const prefix = seed % 2 === 0 ? "02" : "03";
  return `${prefix}${seed.toString(16).padStart(64, "0")}`;
}

function encodeCommitteeFixture(publicKeys, votesByKey = () => 100) {
  const structs = publicKeys.map((key, index) =>
    encodeStruct([encodeByteString(Buffer.from(key, "hex")), encodeInteger(votesByKey(key, index))]),
  );
  return encodeArray(structs).toString("base64");
}

const KEYS = Array.from({ length: 25 }, (_, index) => fakePublicKey(index + 1));
const COMMITTEE_21 = KEYS.slice(0, 21);

// ---------------------------------------------------------------------------
// UTC parsing
// ---------------------------------------------------------------------------

test("parseCreatedAtUtc treats a timestamp with no offset as UTC", () => {
  const ms = parseCreatedAtUtc("2025-11-24T12:54:16.479000");
  assert.equal(new Date(ms).toISOString(), "2025-11-24T12:54:16.479Z");
});

test("parseCreatedAtUtc accepts a trailing Z", () => {
  const ms = parseCreatedAtUtc("2026-01-01T00:00:00Z");
  assert.equal(new Date(ms).toISOString(), "2026-01-01T00:00:00.000Z");
});

test("parseCreatedAtUtc fails closed on an unrecognized format", () => {
  assert.throws(() => parseCreatedAtUtc("11/24/2025 12:54pm"), /not a recognized UTC-explicit timestamp/);
});

test("parseCreatedAtUtc fails closed on an explicit non-UTC offset", () => {
  assert.throws(() => parseCreatedAtUtc("2025-11-24T12:54:16+02:00"), /not a recognized UTC-explicit timestamp/);
});

// ---------------------------------------------------------------------------
// Timestamp-to-height boundary selection
// ---------------------------------------------------------------------------

function chainFromTimes(times) {
  return async (height) => {
    assert.ok(height >= 0 && height < times.length, `height ${height} out of range`);
    return times[height];
  };
}

test("findBoundaryHeight picks the last block at or before the target", async () => {
  const times = [0, 10, 20, 30, 40, 50];
  const height = await findBoundaryHeight(35, { maxHeight: times.length - 1, getBlockTime: chainFromTimes(times) });
  assert.equal(height, 3); // time 30 <= 35 < time 40
});

test("findBoundaryHeight handles an exact match on a block's own timestamp", async () => {
  const times = [0, 10, 20, 30, 40, 50];
  const height = await findBoundaryHeight(30, { maxHeight: times.length - 1, getBlockTime: chainFromTimes(times) });
  assert.equal(height, 3);
});

test("findBoundaryHeight fails closed when the target predates the searched range", async () => {
  const times = [10, 20, 30];
  await assert.rejects(
    () => findBoundaryHeight(5, { maxHeight: times.length - 1, getBlockTime: chainFromTimes(times) }),
    /no block at or before the target timestamp/,
  );
});

test("assertBoundaryAgreement passes when a second source confirms the same boundary", async () => {
  const times = [0, 10, 20, 30, 40, 50];
  await assert.doesNotReject(() => assertBoundaryAgreement(3, 35, chainFromTimes(times)));
});

test("assertBoundaryAgreement fails closed when a second source disagrees on the boundary", async () => {
  const skewedTimes = [0, 10, 20, 50, 60, 70]; // block 3 is already after the target here
  await assert.rejects(() => assertBoundaryAgreement(3, 35, chainFromTimes(skewedTimes)), /boundary disagreement/);
});

// ---------------------------------------------------------------------------
// Committee decoding
// ---------------------------------------------------------------------------

test("decodeCommitteeValue decodes a well-formed committee in rank order", () => {
  const base64 = encodeCommitteeFixture(COMMITTEE_21, (_key, index) => 1000 - index);
  const decoded = decodeCommitteeValue(base64);
  assert.equal(decoded.length, 21);
  assert.equal(decoded[0].publicKey, COMMITTEE_21[0]);
  assert.equal(decoded[0].rankByVotes, 1);
  assert.equal(decoded[0].votes, "1000");
  assert.equal(decoded[20].publicKey, COMMITTEE_21[20]);
});

test("decodeCommitteeValue rejects trailing bytes after the outer Array", () => {
  const base64 = encodeCommitteeFixture(COMMITTEE_21);
  const withTrailingByte = Buffer.concat([Buffer.from(base64, "base64"), Buffer.from([0x00])]).toString("base64");
  assert.throws(() => decodeCommitteeValue(withTrailingByte), /trailing bytes/);
});

test("decodeCommitteeValue rejects a public key with an invalid prefix", () => {
  const badKey = `04${"11".repeat(32)}`; // 0x04 = uncompressed point, not accepted here
  const structs = [Buffer.concat([Buffer.from([0x41, 0x02]), Buffer.concat([Buffer.from([0x28, 33]), Buffer.from(badKey, "hex")]), Buffer.from([0x21, 0x00])])];
  const base64 = Buffer.concat([Buffer.from([0x40, 0x01]), ...structs]).toString("base64");
  assert.throws(() => decodeCommitteeValue(base64), /invalid compressed-point prefix/);
});

test("validateCommittee rejects a committee that is not exactly 21 members", () => {
  const decoded = decodeCommitteeValue(encodeCommitteeFixture(COMMITTEE_21.slice(0, 20)));
  assert.throws(() => validateCommittee(decoded), /exactly 21 members/);
});

test("validateCommittee rejects duplicate public keys", () => {
  const withDuplicate = [...COMMITTEE_21.slice(0, 20), COMMITTEE_21[0]];
  const decoded = decodeCommitteeValue(encodeCommitteeFixture(withDuplicate));
  assert.throws(() => validateCommittee(decoded), /duplicate committee public key/);
});

// ---------------------------------------------------------------------------
// Two-source agreement / disagreement
// ---------------------------------------------------------------------------

test("assertStateRootAgreement passes for matching roots (case-insensitive)", () => {
  assert.doesNotThrow(() =>
    assertStateRootAgreement({ roothash: "0xAB" + "00".repeat(31) }, { roothash: "0xab" + "00".repeat(31) }, "proposal #1"),
  );
});

test("assertStateRootAgreement fails closed when state roots disagree", () => {
  assert.throws(
    () => assertStateRootAgreement({ roothash: `0x${"aa".repeat(32)}` }, { roothash: `0x${"bb".repeat(32)}` }, "proposal #1"),
    /disagree on the state root/,
  );
});

test("assertRawCommitteeAgreement passes for byte-identical values", () => {
  const raw = encodeCommitteeFixture(COMMITTEE_21);
  assert.doesNotThrow(() => assertRawCommitteeAgreement(raw, raw, "proposal #1"));
});

test("assertRawCommitteeAgreement fails closed when sources disagree", () => {
  const rawA = encodeCommitteeFixture(COMMITTEE_21);
  const rawB = encodeCommitteeFixture([...COMMITTEE_21.slice(0, 20), KEYS[21]]);
  assert.throws(() => assertRawCommitteeAgreement(rawA, rawB, "proposal #1"), /different raw committee storage bytes/);
});

// ---------------------------------------------------------------------------
// Eligibility / participation snapshot
// ---------------------------------------------------------------------------

const roster = {
  schemaVersion: 1,
  observedAt: "2026-09-03T00:00:00.000Z",
  sourceUrl: "https://neo.community/candidates",
  members: KEYS.slice(0, 21).map((publicKey, index) => ({ rank: index + 1, name: `Member ${index + 1}`, location: "Test", publicKey })),
};

function proposalRecord(number, committeeKeys, { blockHeight = 1000 + number, stateRoot = `0x${number.toString(16).padStart(64, "0")}` } = {}) {
  const committee = decodeCommitteeValue(encodeCommitteeFixture(committeeKeys));
  return {
    number,
    proposalId: `p${number}`,
    createdAt: "2026-01-01T00:00:00",
    createdAtUtc: "2026-01-01T00:00:00.000Z",
    blockHeight,
    blockTimeUtc: "2026-01-01T00:00:00.000Z",
    stateRoot,
    sources: ["https://a.example", "https://b.example"],
    rawValueBase64: "unused-in-this-fixture",
    committee,
  };
}

function governanceSnapshot(proposals) {
  return { schemaVersion: 2, proposals };
}

function vote(publicKey, currentCouncilMember = true) {
  return { organizationId: "org", organizationName: "Org", publicKey, choice: "for", currentCouncilMember };
}

test("buildCouncilHistorySnapshot computes eligible-count and percentage per member", () => {
  const proposals = [
    { number: 1, votes: [vote(KEYS[0])] },
    { number: 2, votes: [] },
  ];
  const records = [proposalRecord(1, COMMITTEE_21), proposalRecord(2, COMMITTEE_21)];
  const snapshot = buildCouncilHistorySnapshot({ governanceSnapshot: governanceSnapshot(proposals), roster, proposalRecords: records });
  const member = snapshot.participation.find((entry) => entry.publicKey === KEYS[0]);
  assert.equal(member.eligibleProposalCount, 2);
  assert.deepEqual(member.eligibleProposalNumbers, [1, 2]);
  assert.equal(member.recordedEligibleVoteCount, 1);
  assert.equal(member.participationPercent, 50);
  assert.equal(member.participationBand, "yellow");
});

test("different eligibility denominators after a seat change", () => {
  // KEYS[0] holds the seat for proposal #1 only; KEYS[21] takes over that same seat for proposal #2.
  const committeeBefore = COMMITTEE_21;
  const committeeAfter = [KEYS[21], ...COMMITTEE_21.slice(1, 21)];
  const proposals = [
    { number: 1, votes: [vote(KEYS[0])] },
    { number: 2, votes: [] },
  ];
  const records = [proposalRecord(1, committeeBefore), proposalRecord(2, committeeAfter)];
  const snapshot = buildCouncilHistorySnapshot({ governanceSnapshot: governanceSnapshot(proposals), roster: {
    ...roster,
    members: roster.members.map((member, index) => (index === 20 ? { ...member, publicKey: KEYS[21] } : member)),
  }, proposalRecords: records });

  const outgoing = snapshot.participation.find((entry) => entry.publicKey === KEYS[0]);
  assert.equal(outgoing.eligibleProposalCount, 1);
  assert.deepEqual(outgoing.eligibleProposalNumbers, [1]);
  assert.equal(outgoing.recordedEligibleVoteCount, 1);
  assert.equal(outgoing.participationPercent, 100);

  const incoming = snapshot.participation.find((entry) => entry.publicKey === KEYS[21]);
  assert.equal(incoming.eligibleProposalCount, 1);
  assert.deepEqual(incoming.eligibleProposalNumbers, [2]);
  assert.equal(incoming.recordedEligibleVoteCount, 0);
  assert.equal(incoming.participationPercent, 0);
  assert.equal(incoming.participationBand, "empty");
});

test("fails closed and preserves evidence when a vote is attributed to an ineligible key", () => {
  const committeeWithoutKey0 = [...COMMITTEE_21.slice(1, 21), KEYS[21]];
  const proposals = [{ number: 1, votes: [vote(KEYS[0])] }];
  const records = [proposalRecord(1, committeeWithoutKey0)];
  try {
    buildCouncilHistorySnapshot({ governanceSnapshot: governanceSnapshot(proposals), roster, proposalRecords: records });
    assert.fail("expected buildCouncilHistorySnapshot to throw");
  } catch (error) {
    assert.match(error.message, /not eligible for that proposal/);
    assert.equal(error.conflicts.length, 1);
    assert.equal(error.conflicts[0].publicKey, KEYS[0]);
    assert.equal(error.conflicts[0].proposalNumber, 1);
    assert.ok(Array.isArray(error.conflicts[0].eligibleCommitteeAtOpen));
  }
});

test("fails closed on a non-current historical voter (e.g. Nash.io) who was never eligible, even though governance.json already excludes them from the current roster", () => {
  // KEYS[24] stands in for a former member like Nash.io: currentCouncilMember is already false
  // (governance.json's own excludedVotes handling), and — the point of this test — the key was
  // never present in the historical committee for this proposal either. Both facts are true at
  // once; the second one must still be checked, not skipped just because the first one is true.
  const formerMemberKey = KEYS[24];
  const proposals = [{ number: 1, votes: [vote(formerMemberKey, false)] }];
  const records = [proposalRecord(1, COMMITTEE_21)]; // formerMemberKey is not in this committee
  try {
    buildCouncilHistorySnapshot({ governanceSnapshot: governanceSnapshot(proposals), roster, proposalRecords: records });
    assert.fail("expected buildCouncilHistorySnapshot to throw for the ineligible historical voter");
  } catch (error) {
    assert.match(error.message, /not eligible for that proposal/);
    assert.equal(error.conflicts.length, 1);
    assert.equal(error.conflicts[0].publicKey, formerMemberKey);
    assert.equal(error.conflicts[0].currentCouncilMember, false);
  }
});

test("a non-current historical voter who WAS actually eligible at the time does not conflict", () => {
  // Same non-current-roster key, but this time it genuinely held the seat that opened proposal 1
  // (the Nash.io case in the real data: excluded from today's roster, but a legitimate historical
  // voter). This must not raise a conflict, and — since it's not a current member — it must not
  // appear in the participation output either.
  const formerMemberKey = KEYS[24];
  const committeeWithFormerMember = [...COMMITTEE_21.slice(0, 20), formerMemberKey];
  const proposals = [{ number: 1, votes: [vote(formerMemberKey, false)] }];
  const records = [proposalRecord(1, committeeWithFormerMember)];
  const snapshot = buildCouncilHistorySnapshot({ governanceSnapshot: governanceSnapshot(proposals), roster, proposalRecords: records });
  assert.equal(snapshot.participation.some((entry) => entry.publicKey === formerMemberKey), false);
});

test("fails closed when a proposal record is missing from council history", () => {
  const proposals = [{ number: 1, votes: [] }, { number: 2, votes: [] }];
  const records = [proposalRecord(1, COMMITTEE_21)];
  assert.throws(
    () => buildCouncilHistorySnapshot({ governanceSnapshot: governanceSnapshot(proposals), roster, proposalRecords: records }),
    /must cover every proposal/,
  );
});

// ---------------------------------------------------------------------------
// Percentage / colour thresholds
// ---------------------------------------------------------------------------

test("bandForPercent applies the documented thresholds", () => {
  assert.equal(bandForPercent(0, null), "not-eligible");
  assert.equal(bandForPercent(4, 0), "empty");
  assert.equal(bandForPercent(4, 25), "red");
  assert.equal(bandForPercent(4, 49), "red");
  assert.equal(bandForPercent(4, 50), "yellow");
  assert.equal(bandForPercent(4, 74), "yellow");
  assert.equal(bandForPercent(4, 75), "green");
  assert.equal(bandForPercent(4, 100), "green");
});
