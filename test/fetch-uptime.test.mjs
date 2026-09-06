import test from "node:test";
import assert from "node:assert/strict";
import { buildUptimeSnapshot } from "../scripts/fetch-uptime.mjs";

const keys = Array.from({ length: 21 }, (_, index) => `${index % 2 ? "03" : "02"}${(index + 1).toString(16).padStart(64, "0")}`);
const roster = {
  schemaVersion: 1,
  members: keys.map((publicKey, index) => ({ rank: index + 1, name: `Member ${index + 1}`, location: "Test", publicKey })),
};
const rawValidators = keys.slice(0, 7).map((publickey) => ({ publickey, votes: 1 }));
const block = (index, primary = index % 7, time = Date.UTC(2026, 8, 5) + index * 15_000) => ({
  index,
  primary,
  time,
  hash: `0x${index.toString(16).padStart(64, "0")}`,
  nextconsensus: "NXZSaAQyqS8aF9t9MPJSUffiK15f1eiwWc",
});

test("starts a fail-closed seven-day observation without publishing a percentage", () => {
  const snapshot = buildUptimeSnapshot({ roster, rawValidators, rawBlocks: [block(100)], observedAt: "2026-09-05T00:00:00.000Z" });
  assert.equal(snapshot.status, "collecting");
  assert.equal(snapshot.metric.category, "consensus-performance");
  assert.equal(snapshot.metric.label, "Primary duty success");
  assert.equal(snapshot.metric.nonValidatorPolicy, "not-applicable");
  assert.match(snapshot.metric.councilNodeHealthPolicy, /not-tracked/);
  assert.equal(snapshot.window.complete, false);
  assert.equal(snapshot.validators[2].assignedPrimaryDuties, 1);
  assert.equal(snapshot.validators[2].completedPrimaryDuties, 1);
  assert.equal(snapshot.validators[2].dutySuccessPercent, null);
});

test("records a missed scheduled primary duty when the block advances view", () => {
  const snapshot = buildUptimeSnapshot({ roster, rawValidators, rawBlocks: [block(100, 1)] });
  assert.equal(snapshot.validators[2].missedPrimaryDuties, 1);
  assert.deepEqual(snapshot.missedDutyEvidence[0], {
    height: 100,
    hash: `0x${(100).toString(16).padStart(64, "0")}`,
    timestamp: new Date(block(100).time).toISOString(),
    expectedPrimary: 2,
    actualPrimary: 1,
  });
});

test("publishes percentages only after the full observation window", () => {
  const start = Date.UTC(2026, 8, 5);
  const blocks = Array.from({ length: 8 }, (_, index) => block(index, index % 7, start + index * 24 * 60 * 60 * 1000));
  const snapshot = buildUptimeSnapshot({ roster, rawValidators, rawBlocks: blocks });
  assert.equal(snapshot.status, "complete");
  assert.equal(snapshot.validators[0].dutySuccessPercent, 100);
  assert.equal(snapshot.validators[6].dutySuccessPercent, 100);
});

test("fails closed if the validator set changes during an observation window", () => {
  const existing = buildUptimeSnapshot({ roster, rawValidators, rawBlocks: [block(100)] });
  const changed = [...rawValidators];
  changed[0] = { publickey: keys[7], votes: 1 };
  assert.throws(
    () => buildUptimeSnapshot({ existing, roster, rawValidators: changed, rawBlocks: [block(101)] }),
    /validator set or ordering changed/,
  );
});

test("fails closed on a non-consecutive block range", () => {
  assert.throws(
    () => buildUptimeSnapshot({ roster, rawValidators, rawBlocks: [block(100), block(102)] }),
    /not consecutive/,
  );
});

test("fails closed when a validator is not a current Council member", () => {
  const unknown = [...rawValidators];
  unknown[0] = { publickey: `02${"f".repeat(64)}`, votes: 1 };
  assert.throws(
    () => buildUptimeSnapshot({ roster, rawValidators: unknown, rawBlocks: [block(100)] }),
    /not in the current Council roster/,
  );
});

test("fails closed when the consensus contract changes inside the window", () => {
  const changedBlock = { ...block(101), nextconsensus: "NQRLhZFu7tq1vxWjmJspuy3VUL5apNLw7A" };
  assert.throws(
    () => buildUptimeSnapshot({ roster, rawValidators, rawBlocks: [block(100), changedBlock] }),
    /next-consensus address changed/,
  );
});
