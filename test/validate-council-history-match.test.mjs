import test from "node:test";
import assert from "node:assert/strict";
import { checkCouncilHistoryMatchesGovernance } from "../scripts/validate-council-history-match.mjs";

function governance(proposals) {
  return { schemaVersion: 2, proposals };
}
function history(proposals) {
  return { schemaVersion: 1, proposals };
}
function gProp(number, id, createdAt) {
  return { number, id, createdAt };
}
function hProp(number, proposalId, createdAt) {
  return { number, proposalId, createdAt };
}

test("matches when proposals line up exactly by number, ID, and createdAt", () => {
  const g = governance([gProp(1, "p1", "2026-01-01T00:00:00"), gProp(2, "p2", "2026-01-02T00:00:00")]);
  const h = history([hProp(1, "p1", "2026-01-01T00:00:00"), hProp(2, "p2", "2026-01-02T00:00:00")]);
  assert.deepEqual(checkCouncilHistoryMatchesGovernance(g, h), { ok: true });
});

test("order does not matter", () => {
  const g = governance([gProp(1, "p1", "t1"), gProp(2, "p2", "t2")]);
  const h = history([hProp(2, "p2", "t2"), hProp(1, "p1", "t1")]);
  assert.equal(checkCouncilHistoryMatchesGovernance(g, h).ok, true);
});

test("fails closed when council history is missing a proposal", () => {
  const g = governance([gProp(1, "p1", "t1"), gProp(2, "p2", "t2")]);
  const h = history([hProp(1, "p1", "t1")]);
  const result = checkCouncilHistoryMatchesGovernance(g, h);
  assert.equal(result.ok, false);
  assert.match(result.reason, /count mismatch/);
});

test("fails closed when council history has an extra proposal not in governance", () => {
  const g = governance([gProp(1, "p1", "t1")]);
  const h = history([hProp(1, "p1", "t1"), hProp(2, "p2", "t2")]);
  const result = checkCouncilHistoryMatchesGovernance(g, h);
  assert.equal(result.ok, false);
  assert.match(result.reason, /count mismatch/);
});

test("fails closed on a proposal ID mismatch for the same number", () => {
  const g = governance([gProp(1, "p1", "t1")]);
  const h = history([hProp(1, "different-id", "t1")]);
  const result = checkCouncilHistoryMatchesGovernance(g, h);
  assert.equal(result.ok, false);
  assert.match(result.reason, /ID mismatch/);
});

test("fails closed on a createdAt mismatch for the same number", () => {
  const g = governance([gProp(1, "p1", "2026-01-01T00:00:00")]);
  const h = history([hProp(1, "p1", "2026-01-01T00:00:01")]);
  const result = checkCouncilHistoryMatchesGovernance(g, h);
  assert.equal(result.ok, false);
  assert.match(result.reason, /createdAt mismatch/);
});

test("fails closed on a duplicate proposal number within governance", () => {
  const g = governance([gProp(1, "p1", "t1"), gProp(1, "p1-dup", "t1")]);
  const h = history([hProp(1, "p1", "t1")]);
  const result = checkCouncilHistoryMatchesGovernance(g, h);
  assert.equal(result.ok, false);
  assert.match(result.reason, /duplicate governance proposal/);
});

test("fails closed on a duplicate proposal number within council history", () => {
  const g = governance([gProp(1, "p1", "t1")]);
  const h = history([hProp(1, "p1", "t1"), hProp(1, "p1-dup", "t1")]);
  const result = checkCouncilHistoryMatchesGovernance(g, h);
  assert.equal(result.ok, false);
  assert.match(result.reason, /duplicate council history proposal/);
});

test("fails closed when either snapshot has no proposals array", () => {
  assert.equal(checkCouncilHistoryMatchesGovernance(null, history([])).ok, false);
  assert.equal(checkCouncilHistoryMatchesGovernance(governance([]), null).ok, false);
  assert.equal(checkCouncilHistoryMatchesGovernance({ proposals: "nope" }, history([])).ok, false);
});
