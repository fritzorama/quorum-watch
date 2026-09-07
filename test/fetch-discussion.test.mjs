import test from "node:test";
import assert from "node:assert/strict";
import { buildDiscussionSnapshot, collectDiscussionItems, writeDiscussionSnapshot } from "../scripts/fetch-discussion.mjs";

const key = (number) => `${number % 2 ? "03" : "02"}${number.toString(16).padStart(64, "0")}`;
const members = Array.from({ length: 21 }, (_, index) => ({
  rank: index + 1,
  name: `Member ${index + 1}`,
  location: "Test",
  publicKey: key(index + 1),
}));
const roster = {
  schemaVersion: 1,
  observedAt: "2026-09-03T00:00:00.000Z",
  sourceUrl: "https://neo.community/candidates",
  members,
};
const organizations = [
  { organization_id: "org1", name: "Member 1", public_key: key(1) },
  { organization_id: "org2", name: "Member 2", public_key: key(2) },
];
const proposals = [
  {
    proposal_id: "p1",
    proposal_number: 1,
    title: "Real proposal",
    created_at: "2026-01-01T00:00:00.000000",
    proposer_org_id: "org1",
    proposer_username: "one",
    message_count: 1,
    messages: [{
      message_id: "m1",
      created_at: "2026-01-02T00:00:00.000000",
      organization_id: "org1",
      username: "one",
      content: "Recorded public comment",
      thumbs_up: [],
      thumbs_down: [],
    }],
  },
  {
    proposal_id: "p2",
    proposal_number: 2,
    title: "Pending proposal",
    created_at: "2026-02-01T00:00:00.000000",
    proposer_org_id: "org2",
    proposer_username: "two",
    message_count: 1,
    messages: [{
      message_id: "m2",
      created_at: "2026-02-02T00:00:00.000000",
      organization_id: "org2",
      username: "two",
      content: "Pending comment",
      thumbs_up: [],
      thumbs_down: [],
    }],
  },
];
const classifications = {
  schemaVersion: 1,
  proposals: [
    { number: 1, id: "p1", status: "real", reason: "fixture" },
    { number: 2, id: "p2", status: "unreviewed", reason: "fixture" },
  ],
};

function eligibility(eligibleKeys) {
  return {
    checkedAtUtc: "2026-01-01T00:00:00.000Z",
    blockHeight: 1,
    blockTimeUtc: "2026-01-01T00:00:00.000Z",
    stateRoot: `0x${"ab".repeat(32)}`,
    sources: ["https://one.example", "https://two.example"],
    committee: eligibleKeys.map((publicKey) => ({ publicKey })),
  };
}

function makeEligibility(items, overrides = {}) {
  return new Map(items.filter((item) => !item.identityConflict).map((item) => [
    item.itemId,
    overrides[item.itemId] ?? eligibility([key(1), key(2)]),
  ]));
}

function build(options = {}) {
  const proposalDetails = options.proposalDetails ?? proposals;
  const currentClassifications = options.classifications ?? classifications;
  const items = collectDiscussionItems(proposalDetails, organizations, currentClassifications);
  return buildDiscussionSnapshot({
    proposalDetails,
    organizations,
    roster,
    classifications: currentClassifications,
    eligibilityByItemId: options.eligibilityByItemId ?? makeEligibility(items, options.eligibilityOverrides),
    previousSnapshot: options.previousSnapshot,
    fetchedAt: "2026-09-07T00:00:00.000Z",
  });
}

test("counts objective eligible evidence on real proposals only", () => {
  const snapshot = build();
  assert.equal(snapshot.collectionStatus, "ok");
  assert.equal(snapshot.perMember[0].proposalsAuthoredWhileEligible, 1);
  assert.equal(snapshot.perMember[0].recordedCommentsWhileEligible, 1);
  assert.equal(snapshot.perMember[0].distinctRealProposalsCommentedOnWhileEligible, 1);
  assert.equal(snapshot.perMember[1].recordedCommentsWhileEligible, 0);
  assert.deepEqual(snapshot.reviewRequired.map((item) => item.number), [2]);
  assert.equal("participationPercent" in snapshot.perMember[0], false);
});

test("an unreviewed proposal remains preserved but inert", () => {
  const snapshot = build();
  assert.equal(snapshot.items.filter((item) => item.proposalNumber === 2).length, 2);
  assert.equal(snapshot.perMember[1].proposalsAuthoredWhileEligible, 0);
  assert.equal(snapshot.perMember[1].recordedCommentsWhileEligible, 0);
});

test("an empty-content reaction is not counted as a comment", () => {
  const changed = structuredClone(proposals);
  changed[0].messages[0].content = "";
  changed[0].messages[0].thumbs_up = ["user"];
  const snapshot = build({ proposalDetails: changed });
  assert.equal(snapshot.perMember[0].recordedCommentsWhileEligible, 0);
  assert.equal(snapshot.items.find((item) => item.itemId === "m1").reactionCounts.thumbsUp, 1);
});

test("a former member comment is preserved as ineligible, not quarantined", () => {
  const snapshot = build({ eligibilityOverrides: { m1: eligibility([key(2)]) } });
  const item = snapshot.items.find((record) => record.itemId === "m1");
  assert.equal(item.eligibilityResult, "ineligible");
  assert.equal(snapshot.perMember[0].recordedCommentsWhileEligible, 0);
  assert.deepEqual(snapshot.quarantine, []);
});

test("a new member comment on an older proposal is decided at the comment timestamp", () => {
  const changed = structuredClone(proposals);
  changed[0].messages.push({ ...changed[0].messages[0], message_id: "m-new", organization_id: "org2", username: "two" });
  changed[0].message_count = 2;
  const items = collectDiscussionItems(changed, organizations, classifications);
  const eligibilityByItemId = makeEligibility(items, {
    "authorship-p1": eligibility([key(1)]),
    m1: eligibility([key(1)]),
    "m-new": eligibility([key(2)]),
  });
  const snapshot = build({ proposalDetails: changed, eligibilityByItemId });
  assert.equal(snapshot.perMember[1].recordedCommentsWhileEligible, 1);
  assert.deepEqual(snapshot.perMember[1].commentedProposalNumbers, [1]);
});

test("a new unreviewed proposal does not block a real-proposal update", () => {
  const initial = build();
  const changed = structuredClone(proposals);
  changed[0].messages.push({ ...changed[0].messages[0], message_id: "m3" });
  changed[0].message_count = 2;
  const items = collectDiscussionItems(changed, organizations, classifications);
  const snapshot = build({ proposalDetails: changed, previousSnapshot: initial, eligibilityByItemId: makeEligibility(items) });
  assert.equal(snapshot.collectionStatus, "ok");
  assert.equal(snapshot.perMember[0].recordedCommentsWhileEligible, 2);
  assert.deepEqual(snapshot.reviewRequired.map((item) => item.number), [2]);
});

test("mutated or disappeared evidence quarantines the candidate snapshot", () => {
  const initial = build();
  const changed = structuredClone(proposals);
  changed[0].messages = [];
  changed[0].message_count = 0;
  const items = collectDiscussionItems(changed, organizations, classifications);
  const snapshot = build({ proposalDetails: changed, previousSnapshot: initial, eligibilityByItemId: makeEligibility(items) });
  assert.equal(snapshot.collectionStatus, "quarantined");
  assert.ok(snapshot.quarantine.some((entry) => entry.itemId === "m1" && entry.mutation === "item-disappeared"));
});

test("an unknown organization creates an identity-conflict quarantine", () => {
  const changed = structuredClone(proposals);
  changed[0].messages[0].organization_id = "missing";
  const snapshot = build({ proposalDetails: changed });
  assert.equal(snapshot.collectionStatus, "quarantined");
  assert.equal(snapshot.items.find((item) => item.itemId === "m1").eligibilityResult, "identity-conflict");
});

test("a newly discovered proposal defaults to unreviewed and remains inert", () => {
  const partial = { schemaVersion: 1, proposals: classifications.proposals.slice(0, 1) };
  const snapshot = build({ classifications: partial });
  assert.equal(snapshot.proposalClassifications.find((proposal) => proposal.id === "p2").status, "unreviewed");
  assert.equal(snapshot.perMember[1].recordedCommentsWhileEligible, 0);
  assert.equal(snapshot.collectionStatus, "ok");
});

test("fails closed when the API aggregate message count omits a record", () => {
  const changed = structuredClone(proposals);
  changed[0].message_count = 2;
  assert.throws(
    () => collectDiscussionItems(changed, organizations, classifications),
    /reports 2 messages but exposes 1/,
  );
});

test("a quarantined candidate cannot replace the approved snapshot", async () => {
  const snapshot = build();
  snapshot.collectionStatus = "quarantined";
  snapshot.quarantine.push({ reason: "source-mutation" });
  await assert.rejects(() => writeDiscussionSnapshot(snapshot, "ignored.json"), /candidate snapshot is quarantined/);
});
