import test from "node:test";
import assert from "node:assert/strict";
import { buildSnapshot } from "../scripts/fetch-governance.mjs";

const summary = { proposal_id: "p1" };
const detail = {
  proposal_id: "p1",
  proposal_number: 1,
  title: "Test proposal",
  created_at: "2026-01-01T00:00:00Z",
  end_time: "2026-02-01T00:00:00Z",
  status: "active",
  council_vote_counts: { for: 1, against: 0, neutral: 0 },
  council_votes: { org1: "for" },
};
const organization = { organization_id: "org1", name: "Example Council member" };
organization.public_key = "02" + "11".repeat(32);
const roster = {
  schemaVersion: 1,
  observedAt: "2026-09-03T00:00:00.000Z",
  sourceUrl: "https://neo.community/candidates",
  members: Array.from({ length: 21 }, (_, index) => ({
    rank: index + 1,
    name: index === 0 ? "Example Council member" : `Member ${index + 1}`,
    location: "Test",
    publicKey: index === 0 ? organization.public_key : `03${(index + 1).toString(16).padStart(64, "0")}`,
  })),
};

test("builds a traceable participation snapshot", () => {
  const snapshot = buildSnapshot([summary], [detail], [organization], roster, "2026-09-02T00:00:00.000Z");
  assert.equal(snapshot.proposalCount, 1);
  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.participation[0].recordedVotes, 1);
  assert.deepEqual(snapshot.participation[0].proposalNumbers, [1]);
  assert.equal(snapshot.latestProposal.voterCount, 1);
  assert.equal(snapshot.proposals[0].sourceUrl, "https://neo.community/proposals/p1");
});

test("fails closed when aggregate counts and voter records disagree", () => {
  const inconsistent = { ...detail, council_vote_counts: { for: 2, against: 0, neutral: 0 } };
  assert.throws(
    () => buildSnapshot([summary], [inconsistent], [organization], roster),
    /reports 2 votes but exposes 1 voter records/,
  );
});

test("fails closed when a voter cannot be mapped to an organization", () => {
  assert.throws(
    () => buildSnapshot([summary], [detail], [{ organization_id: "org2", name: "Someone else", public_key: "02" + "22".repeat(32) }], roster),
    /references unknown organization org1/,
  );
});

test("excludes a historical voter that is not in the current roster", () => {
  const formerOrganization = { ...organization, public_key: "02" + "ff".repeat(32), name: "Former member" };
  const snapshot = buildSnapshot([summary], [detail], [formerOrganization], roster);
  assert.equal(snapshot.participation[0].recordedVotes, 0);
  assert.deepEqual(snapshot.excludedVotes, [{
    proposalNumber: 1,
    organizationId: "org1",
    organizationName: "Former member",
    publicKey: formerOrganization.public_key,
    reason: "not-in-current-council-roster",
  }]);
});

test("fails closed when the current roster is not exactly 21 unique seats", () => {
  assert.throws(
    () => buildSnapshot([summary], [detail], [organization], { ...roster, members: roster.members.slice(0, 20) }),
    /must contain exactly 21 members/,
  );
});
