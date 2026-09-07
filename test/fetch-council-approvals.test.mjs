import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildSnapshot } from "../scripts/fetch-council-approvals.mjs";

const keys = Array.from({ length: 21 }, (_, index) => `02${(index + 1).toString(16).padStart(64, "0")}`);
const signatures = keys.slice(0, 13).map((public_key, index) => ({
  public_key,
  signature: (index + 1).toString(16).padStart(128, "0"),
  created_at: "2026-04-17T00:00:00Z",
}));
const fingerprint = createHash("sha256").update(
  signatures.map(item => `${item.public_key}:${item.signature}`).sort().join("|"),
).digest("hex");

// The production allowlist is deliberately strict. Fixtures substitute its verified record by
// cloning the real expected shape and signature fingerprint through a live-record-shaped object.
const list = [{ id: 12, title: "Decision", status: "EXECUTED" }];
const detail = {
  id: 12,
  network: "mainnet",
  title: "Decision",
  description: "Description",
  status: "EXECUTED",
  broadcast_tx_hash: "0x50f683f5db177d2e23d11882c411e5cec37c446213d9cea3174d9ad30db836f1",
  signers_required: 11,
  created_at: "2026-04-14T00:00:00Z",
  broadcast_at: "2026-04-23T00:00:00Z",
  signatures,
  params: {
    hash: "0x50f683f5db177d2e23d11882c411e5cec37c446213d9cea3174d9ad30db836f1",
    committee_pubkeys: keys,
    eligible_signers: keys.map((_, index) => `address-${index}`),
    broadcast_witness: {
      invocationScript: Buffer.concat(signatures.slice(0, 11).map(item => Buffer.from(item.signature, "hex"))).toString("base64"),
    },
  },
};
const roster = {
  schemaVersion: 1,
  sourceUrl: "https://neo.community/candidates",
  members: keys.map((publicKey, index) => ({ rank: index + 1, name: `Member ${index + 1}`, location: "Test", publicKey })),
};
const approved = new Map([[12, {
  transactionHash: detail.broadcast_tx_hash,
  signatureFingerprint: fingerprint,
  requiredSignatures: 11,
}]]);

test("builds separate executed-witness and additional-signature evidence", () => {
  const snapshot = buildSnapshot(list, [detail], roster, "2026-09-08T00:00:00Z", approved);
  assert.equal(snapshot.decisionCount, 1);
  assert.equal(snapshot.decisions[0].includedSignatureCount, 11);
  assert.equal(snapshot.decisions[0].additionalSignatureCount, 2);
  assert.equal(snapshot.participation[0].documentedApprovals, 1);
  assert.equal(snapshot.participation[0].includedInExecutedWitness, 1);
  assert.equal(snapshot.participation[11].additionalSignatures, 1);
  assert.equal(snapshot.participation[13].documentedApprovals, 0);
});

test("fails closed when the approved transaction hash changes", () => {
  assert.throws(() => buildSnapshot(list, [{ ...detail, broadcast_tx_hash: `0x${"ff".repeat(32)}` }], roster, undefined, approved), /transaction hash changed/);
});

test("fails closed when a signature comes from outside the committee", () => {
  const bad = { ...signatures[0], public_key: `03${"ff".repeat(32)}` };
  assert.throws(() => buildSnapshot(list, [{ ...detail, signatures: [bad, ...signatures.slice(1)] }], roster, undefined, approved), /outside its committee/);
});

test("fails closed when the verified signature set changes", () => {
  const changed = structuredClone(detail);
  changed.signatures[0].signature = "fe".repeat(64);
  assert.throws(() => buildSnapshot(list, [changed], roster, undefined, approved), /verified signature set changed/);
});

test("fails closed on a duplicate signer", () => {
  const changed = structuredClone(detail);
  changed.signatures[1].public_key = changed.signatures[0].public_key;
  assert.throws(() => buildSnapshot(list, [changed], roster, undefined, approved), /duplicate signatures/);
});

test("fails closed when an approved record disappears", () => {
  assert.throws(() => buildSnapshot([], [detail], roster, undefined, approved), /disappeared from the list/);
});

test("fails closed when the executed witness does not contain quorum", () => {
  const changed = structuredClone(detail);
  changed.params.broadcast_witness.invocationScript = Buffer.concat(
    signatures.slice(0, 10).map(item => Buffer.from(item.signature, "hex")),
  ).toString("base64");
  assert.throws(() => buildSnapshot(list, [changed], roster, undefined, approved), /witness contains 10, expected 11/);
});

test("preserves new records as review required", () => {
  const snapshot = buildSnapshot([...list, { id: 13, title: "New", status: "DRAFT" }], [detail], roster, undefined, approved);
  assert.deepEqual(snapshot.unreviewedRequests, [{
    sourceRecordId: 13,
    title: "New",
    status: "DRAFT",
    sourceUrl: "https://www.neo3scan.com/tools/governance/13",
    publicationState: "review-required",
  }]);
});
