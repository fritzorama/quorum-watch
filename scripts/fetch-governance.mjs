import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_API_BASE = "https://neo-governance-api.flamingo.finance";
const DEFAULT_OUTPUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../data/governance.json",
);
const DEFAULT_ROSTER = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../data/council-roster.json",
);

function assert(condition, message) {
  if (!condition) throw new Error(`Governance data validation failed: ${message}`);
}

function voteCount(proposal) {
  const counts = proposal.council_vote_counts;
  assert(counts && typeof counts === "object", `proposal #${proposal.proposal_number} has no council_vote_counts`);
  for (const choice of ["for", "against", "neutral"]) {
    assert(Number.isInteger(counts[choice]) && counts[choice] >= 0, `proposal #${proposal.proposal_number} has an invalid ${choice} count`);
  }
  return counts.for + counts.against + counts.neutral;
}

function validateRoster(roster) {
  assert(roster && typeof roster === "object", "Council roster is missing");
  assert(roster.schemaVersion === 1, "Council roster schema is unsupported");
  assert(!Number.isNaN(Date.parse(roster.observedAt)), "Council roster observedAt is invalid");
  assert(typeof roster.sourceUrl === "string" && roster.sourceUrl.startsWith("https://"), "Council roster source URL is invalid");
  assert(Array.isArray(roster.members) && roster.members.length === 21, "Council roster must contain exactly 21 members");

  const keys = new Set();
  const ranks = new Set();
  for (const member of roster.members) {
    assert(Number.isInteger(member.rank) && member.rank >= 1 && member.rank <= 21, `Council member ${member.name} has an invalid rank`);
    assert(!ranks.has(member.rank), `duplicate Council rank ${member.rank}`);
    assert(typeof member.name === "string" && member.name.trim(), "Council member has no name");
    assert(typeof member.location === "string" && member.location.trim(), `Council member ${member.name} has no location`);
    assert(/^(02|03)[0-9a-f]{64}$/i.test(member.publicKey), `Council member ${member.name} has an invalid public key`);
    assert(!keys.has(member.publicKey.toLowerCase()), `duplicate Council public key ${member.publicKey}`);
    ranks.add(member.rank);
    keys.add(member.publicKey.toLowerCase());
  }
  return roster.members.map((member) => ({ ...member, publicKey: member.publicKey.toLowerCase() }));
}

export function buildSnapshot(proposalSummaries, proposalDetails, organizations, roster, fetchedAt = new Date().toISOString()) {
  assert(Array.isArray(proposalSummaries), "proposal list is not an array");
  assert(proposalSummaries.length > 0, "proposal list is empty");
  assert(Array.isArray(proposalDetails), "proposal details are not an array");
  assert(proposalDetails.length === proposalSummaries.length, "proposal detail count does not match the proposal list");
  assert(Array.isArray(organizations), "organization list is not an array");
  assert(organizations.length > 0, "organization list is empty");

  const rosterMembers = validateRoster(roster);
  const rosterByPublicKey = new Map(rosterMembers.map((member) => [member.publicKey, member]));

  const organizationById = new Map();
  for (const organization of organizations) {
    assert(typeof organization.organization_id === "string" && organization.organization_id, "organization has no ID");
    assert(typeof organization.name === "string" && organization.name.trim(), `organization ${organization.organization_id} has no name`);
    assert(/^(02|03)[0-9a-f]{64}$/i.test(organization.public_key), `organization ${organization.organization_id} has an invalid public key`);
    assert(!organizationById.has(organization.organization_id), `duplicate organization ID ${organization.organization_id}`);
    organizationById.set(organization.organization_id, { ...organization, public_key: organization.public_key.toLowerCase() });
  }

  const detailById = new Map(proposalDetails.map((proposal) => [proposal.proposal_id, proposal]));
  const proposalNumbers = new Set();
  const participation = new Map(rosterMembers.map((member) => [member.publicKey, {
    publicKey: member.publicKey,
    name: member.name,
    location: member.location,
    rank: member.rank,
    recordedVotes: 0,
    proposalNumbers: [],
  }]));
  const excludedVotes = [];

  const proposals = proposalSummaries
    .map((summary) => {
      const detail = detailById.get(summary.proposal_id);
      assert(detail, `proposal ${summary.proposal_id} has no detail record`);
      assert(Number.isInteger(detail.proposal_number), `proposal ${detail.proposal_id} has no numeric proposal_number`);
      assert(!proposalNumbers.has(detail.proposal_number), `duplicate proposal number ${detail.proposal_number}`);
      proposalNumbers.add(detail.proposal_number);

      const rawVotes = detail.council_votes;
      assert(rawVotes && typeof rawVotes === "object" && !Array.isArray(rawVotes), `proposal #${detail.proposal_number} has no council_votes map`);
      const totalVotes = voteCount(detail);
      assert(Object.keys(rawVotes).length === totalVotes, `proposal #${detail.proposal_number} reports ${totalVotes} votes but exposes ${Object.keys(rawVotes).length} voter records`);

      const votes = Object.entries(rawVotes).map(([organizationId, choice]) => {
        const organization = organizationById.get(organizationId);
        assert(organization, `proposal #${detail.proposal_number} references unknown organization ${organizationId}`);
        assert(["for", "against", "neutral"].includes(choice), `proposal #${detail.proposal_number} has invalid vote ${choice}`);
        const member = rosterByPublicKey.get(organization.public_key);
        if (member) {
          const record = participation.get(member.publicKey);
          record.recordedVotes += 1;
          record.proposalNumbers.push(detail.proposal_number);
        } else {
          excludedVotes.push({
            proposalNumber: detail.proposal_number,
            organizationId,
            organizationName: organization.name,
            publicKey: organization.public_key,
            reason: "not-in-current-council-roster",
          });
        }
        return {
          organizationId,
          organizationName: organization.name,
          publicKey: organization.public_key,
          choice,
          currentCouncilMember: Boolean(member),
        };
      });

      return {
        id: detail.proposal_id,
        number: detail.proposal_number,
        title: detail.title,
        createdAt: detail.created_at,
        endsAt: detail.end_time,
        status: detail.status,
        councilVoteCounts: detail.council_vote_counts,
        votes,
        sourceUrl: `https://neo.community/proposals/${detail.proposal_id}`,
      };
    })
    .sort((a, b) => a.number - b.number);

  const latestProposal = proposals.at(-1);
  const majorityThreshold = 11;

  return {
    schemaVersion: 2,
    fetchedAt,
    sources: {
      proposals: `${DEFAULT_API_BASE}/proposal/get/all`,
      proposalDetails: `${DEFAULT_API_BASE}/proposal/get?proposal_id={id}`,
      organizations: `${DEFAULT_API_BASE}/organization/get/all`,
      currentCouncil: roster.sourceUrl,
    },
    councilRoster: {
      observedAt: roster.observedAt,
      memberCount: rosterMembers.length,
      identityKey: "Neo N3 candidate public key",
    },
    attribution: {
      rule: "A recorded vote is assigned to a current member only when the vote organization and current roster share the same candidate public key.",
      historicalAbsencePolicy: "No historical non-vote or participation rate is inferred without a dated seat interval covering that proposal.",
    },
    proposalCount: proposals.length,
    majorityThreshold,
    proposalsReachingMajority: proposals.filter((proposal) => voteCount({ proposal_number: proposal.number, council_vote_counts: proposal.councilVoteCounts }) >= majorityThreshold).length,
    latestProposal: latestProposal ? {
      number: latestProposal.number,
      voterCount: latestProposal.votes.length,
      sourceUrl: latestProposal.sourceUrl,
    } : null,
    proposals,
    participation: [...participation.values()]
      .map((record) => ({ ...record, proposalNumbers: record.proposalNumbers.sort((a, b) => a - b) }))
      .sort((a, b) => a.rank - b.rank),
    excludedVotes: excludedVotes.sort((a, b) => a.proposalNumber - b.proposalNumber || a.organizationName.localeCompare(b.organizationName)),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return response.json();
}

export async function fetchGovernance(apiBase = process.env.QUORUM_WATCH_API_BASE ?? DEFAULT_API_BASE, rosterPath = DEFAULT_ROSTER) {
  const base = apiBase.replace(/\/$/, "");
  const [proposalSummaries, organizations] = await Promise.all([
    fetchJson(`${base}/proposal/get/all`),
    fetchJson(`${base}/organization/get/all`),
  ]);
  assert(Array.isArray(proposalSummaries), "proposal list is not an array");
  const proposalDetails = await Promise.all(
    proposalSummaries.map((proposal) => fetchJson(`${base}/proposal/get?proposal_id=${encodeURIComponent(proposal.proposal_id)}`)),
  );
  const roster = JSON.parse(await readFile(rosterPath, "utf8"));
  const snapshot = buildSnapshot(proposalSummaries, proposalDetails, organizations, roster);
  snapshot.sources = {
    proposals: `${base}/proposal/get/all`,
    proposalDetails: `${base}/proposal/get?proposal_id={id}`,
    organizations: `${base}/organization/get/all`,
    currentCouncil: roster.sourceUrl,
  };
  return snapshot;
}

export async function writeSnapshot(snapshot, outputPath = process.env.QUORUM_WATCH_OUTPUT ?? DEFAULT_OUTPUT) {
  const target = resolve(outputPath);
  const temporary = `${target}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporary, target);
  return target;
}

async function main() {
  const snapshot = await fetchGovernance();
  const output = await writeSnapshot(snapshot);
  console.log(`Wrote ${snapshot.proposalCount} validated proposals to ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    if (error.cause) console.error("Caused by:", error.cause);
    process.exitCode = 1;
  });
}
