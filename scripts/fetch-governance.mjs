import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_API_BASE = "https://neo-governance-api.flamingo.finance";
const DEFAULT_OUTPUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../data/governance.json",
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

export function buildSnapshot(proposalSummaries, proposalDetails, organizations, fetchedAt = new Date().toISOString()) {
  assert(Array.isArray(proposalSummaries), "proposal list is not an array");
  assert(proposalSummaries.length > 0, "proposal list is empty");
  assert(Array.isArray(proposalDetails), "proposal details are not an array");
  assert(proposalDetails.length === proposalSummaries.length, "proposal detail count does not match the proposal list");
  assert(Array.isArray(organizations), "organization list is not an array");
  assert(organizations.length > 0, "organization list is empty");

  const organizationById = new Map();
  for (const organization of organizations) {
    assert(typeof organization.organization_id === "string" && organization.organization_id, "organization has no ID");
    assert(typeof organization.name === "string" && organization.name.trim(), `organization ${organization.organization_id} has no name`);
    assert(!organizationById.has(organization.organization_id), `duplicate organization ID ${organization.organization_id}`);
    organizationById.set(organization.organization_id, organization);
  }

  const detailById = new Map(proposalDetails.map((proposal) => [proposal.proposal_id, proposal]));
  const proposalNumbers = new Set();
  const participation = new Map();

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
        const record = participation.get(organizationId) ?? {
          organizationId,
          organizationName: organization.name,
          proposalsVoted: 0,
          proposalNumbers: [],
        };
        record.proposalsVoted += 1;
        record.proposalNumbers.push(detail.proposal_number);
        participation.set(organizationId, record);
        return { organizationId, organizationName: organization.name, choice };
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

  return {
    schemaVersion: 1,
    fetchedAt,
    sources: {
      proposals: `${DEFAULT_API_BASE}/proposal/get/all`,
      proposalDetails: `${DEFAULT_API_BASE}/proposal/get?proposal_id={id}`,
      organizations: `${DEFAULT_API_BASE}/organization/get/all`,
    },
    proposalCount: proposals.length,
    proposals,
    participation: [...participation.values()]
      .map((record) => ({ ...record, proposalNumbers: record.proposalNumbers.sort((a, b) => a - b) }))
      .sort((a, b) => b.proposalsVoted - a.proposalsVoted || a.organizationName.localeCompare(b.organizationName)),
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return response.json();
}

export async function fetchGovernance(apiBase = process.env.QUORUM_WATCH_API_BASE ?? DEFAULT_API_BASE) {
  const base = apiBase.replace(/\/$/, "");
  const [proposalSummaries, organizations] = await Promise.all([
    fetchJson(`${base}/proposal/get/all`),
    fetchJson(`${base}/organization/get/all`),
  ]);
  assert(Array.isArray(proposalSummaries), "proposal list is not an array");
  const proposalDetails = await Promise.all(
    proposalSummaries.map((proposal) => fetchJson(`${base}/proposal/get?proposal_id=${encodeURIComponent(proposal.proposal_id)}`)),
  );
  const snapshot = buildSnapshot(proposalSummaries, proposalDetails, organizations);
  snapshot.sources = {
    proposals: `${base}/proposal/get/all`,
    proposalDetails: `${base}/proposal/get?proposal_id={id}`,
    organizations: `${base}/organization/get/all`,
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
