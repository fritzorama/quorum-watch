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

test("builds a traceable participation snapshot", () => {
  const snapshot = buildSnapshot([summary], [detail], [organization], "2026-09-02T00:00:00.000Z");
  assert.equal(snapshot.proposalCount, 1);
  assert.deepEqual(snapshot.participation, [{
    organizationId: "org1",
    organizationName: "Example Council member",
    proposalsVoted: 1,
    proposalNumbers: [1],
  }]);
  assert.equal(snapshot.proposals[0].sourceUrl, "https://neo.community/proposals/p1");
});

test("fails closed when aggregate counts and voter records disagree", () => {
  const inconsistent = { ...detail, council_vote_counts: { for: 2, against: 0, neutral: 0 } };
  assert.throws(
    () => buildSnapshot([summary], [inconsistent], [organization]),
    /reports 2 votes but exposes 1 voter records/,
  );
});

test("fails closed when a voter cannot be mapped to an organization", () => {
  assert.throws(
    () => buildSnapshot([summary], [detail], [{ organization_id: "org2", name: "Someone else" }]),
    /references unknown organization org1/,
  );
});
