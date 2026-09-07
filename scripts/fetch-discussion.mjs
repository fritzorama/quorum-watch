import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DEFAULT_STATE_RPC_URLS,
  getCurrentChainHeight,
  resolveHistoricalCommitteeAtTimestamp,
} from "./fetch-council-history.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_API_BASE = "https://neo-governance-api.flamingo.finance";
const DEFAULT_ROSTER = resolve(HERE, "../data/council-roster.json");
const DEFAULT_CLASSIFICATIONS = resolve(HERE, "../data/proposal-classifications.json");
const DEFAULT_OUTPUT = resolve(HERE, "../data/discussion.json");
const VALID_STATUSES = new Set(["real", "test", "unreviewed"]);

function assert(condition, message) {
  if (!condition) throw new Error(`Discussion data validation failed: ${message}`);
}

function normalizeKey(value, context) {
  assert(typeof value === "string" && /^(02|03)[0-9a-f]{64}$/i.test(value), `${context} has an invalid public key`);
  return value.toLowerCase();
}

function normalizeTimestamp(value, context) {
  assert(typeof value === "string" && value.trim(), `${context} has no timestamp`);
  const withUtc = /Z$/i.test(value) ? value : `${value}Z`;
  const parsed = Date.parse(withUtc);
  assert(Number.isFinite(parsed), `${context} has an invalid timestamp`);
  return new Date(parsed).toISOString();
}

function hashContent(content) {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

function validateRoster(roster) {
  assert(roster?.schemaVersion === 1, "Council roster schema is unsupported");
  assert(Array.isArray(roster.members) && roster.members.length === 21, "Council roster must contain exactly 21 members");
  const members = roster.members.map((member) => ({ ...member, publicKey: normalizeKey(member.publicKey, `Council member ${member.name}`) }));
  assert(new Set(members.map((member) => member.publicKey)).size === 21, "Council roster contains duplicate public keys");
  return members;
}

function resolveClassifications(classifications, proposalDetails) {
  assert(classifications?.schemaVersion === 1, "proposal classification schema is unsupported");
  assert(Array.isArray(classifications.proposals), "proposal classifications are missing");
  const proposalById = new Map(proposalDetails.map((proposal) => [proposal.proposal_id, proposal]));
  const byId = new Map();
  for (const record of classifications.proposals) {
    assert(Number.isInteger(record.number), "proposal classification has no numeric number");
    assert(typeof record.id === "string" && record.id, `proposal #${record.number} classification has no ID`);
    assert(VALID_STATUSES.has(record.status), `proposal #${record.number} has invalid classification ${record.status}`);
    assert(typeof record.reason === "string" && record.reason.trim(), `proposal #${record.number} classification has no reason`);
    assert(!byId.has(record.id), `duplicate classification for proposal ${record.id}`);
    const proposal = proposalById.get(record.id);
    assert(proposal, `classified proposal ${record.id} is absent from the fetched proposal list`);
    assert(record.number === proposal.proposal_number, `proposal ${record.id} classification number does not match the source`);
    byId.set(record.id, record);
  }
  for (const proposal of proposalDetails) {
    if (!byId.has(proposal.proposal_id)) {
      byId.set(proposal.proposal_id, {
        number: proposal.proposal_number,
        id: proposal.proposal_id,
        status: "unreviewed",
        reason: "Newly discovered proposal; human classification required before it can affect published figures.",
      });
    }
  }
  return byId;
}

function buildOrganizationMap(organizations) {
  assert(Array.isArray(organizations) && organizations.length > 0, "organization list is empty");
  const byId = new Map();
  for (const organization of organizations) {
    assert(typeof organization.organization_id === "string" && organization.organization_id, "organization has no ID");
    assert(!byId.has(organization.organization_id), `duplicate organization ID ${organization.organization_id}`);
    byId.set(organization.organization_id, {
      id: organization.organization_id,
      name: organization.name,
      publicKey: normalizeKey(organization.public_key, `organization ${organization.organization_id}`),
    });
  }
  return byId;
}

export function collectDiscussionItems(proposalDetails, organizations, classifications) {
  assert(Array.isArray(proposalDetails) && proposalDetails.length > 0, "proposal details are empty");
  const organizationById = buildOrganizationMap(organizations);
  const classificationById = resolveClassifications(classifications, proposalDetails);
  const items = [];
  const seenItemIds = new Set();

  const addItem = (item) => {
    assert(!seenItemIds.has(item.itemId), `duplicate discussion item ${item.itemId}`);
    seenItemIds.add(item.itemId);
    items.push(item);
  };

  for (const proposal of [...proposalDetails].sort((a, b) => a.proposal_number - b.proposal_number)) {
    assert(Number.isInteger(proposal.proposal_number), `proposal ${proposal.proposal_id} has no numeric number`);
    assert(Array.isArray(proposal.messages), `proposal #${proposal.proposal_number} has no messages array`);
    assert(Number.isInteger(proposal.message_count) && proposal.message_count === proposal.messages.length,
      `proposal #${proposal.proposal_number} reports ${proposal.message_count} messages but exposes ${proposal.messages.length}`);
    const classification = classificationById.get(proposal.proposal_id);
    const sourceUrl = `https://neo.community/proposals/${proposal.proposal_id}`;

    const proposer = organizationById.get(proposal.proposer_org_id);
    addItem({
      itemId: `authorship-${proposal.proposal_id}`,
      evidenceType: "authorship",
      proposalNumber: proposal.proposal_number,
      proposalId: proposal.proposal_id,
      proposalTitle: proposal.title,
      proposalStatus: classification.status,
      organizationIdRaw: proposal.proposer_org_id,
      organizationName: proposer?.name ?? null,
      publicKey: proposer?.publicKey ?? null,
      authorUsername: proposal.proposer_username ?? null,
      createdAtUtc: normalizeTimestamp(proposal.created_at, `proposal #${proposal.proposal_number}`),
      contentHash: null,
      contentLength: null,
      countsAsRecordedComment: false,
      sourceUrl,
      identityConflict: proposer ? null : "organization-id-not-found",
    });

    for (const message of proposal.messages) {
      assert(typeof message.message_id === "string" && message.message_id, `proposal #${proposal.proposal_number} contains a message without an ID`);
      const organization = organizationById.get(message.organization_id);
      const content = typeof message.content === "string" ? message.content : "";
      addItem({
        itemId: message.message_id,
        evidenceType: "comment",
        proposalNumber: proposal.proposal_number,
        proposalId: proposal.proposal_id,
        proposalTitle: proposal.title,
        proposalStatus: classification.status,
        organizationIdRaw: message.organization_id,
        organizationName: organization?.name ?? null,
        publicKey: organization?.publicKey ?? null,
        authorUsername: message.username ?? null,
        createdAtUtc: normalizeTimestamp(message.created_at, `message ${message.message_id}`),
        contentHash: hashContent(content),
        contentLength: [...content].length,
        countsAsRecordedComment: content.trim().length > 0,
        reactionCounts: {
          thumbsUp: Array.isArray(message.thumbs_up) ? message.thumbs_up.length : 0,
          thumbsDown: Array.isArray(message.thumbs_down) ? message.thumbs_down.length : 0,
        },
        sourceUrl,
        identityConflict: organization ? null : "organization-id-not-found",
      });
    }
  }
  return items;
}

function detectMutations(previousSnapshot, items) {
  if (!previousSnapshot) return [];
  assert(previousSnapshot.schemaVersion === 1 && Array.isArray(previousSnapshot.items), "previous discussion snapshot schema is unsupported");
  const currentById = new Map(items.map((item) => [item.itemId, item]));
  const quarantine = [];
  for (const previous of previousSnapshot.items) {
    const current = currentById.get(previous.itemId);
    if (!current) {
      quarantine.push({ reason: "source-mutation", mutation: "item-disappeared", itemId: previous.itemId, previous });
      continue;
    }
    for (const [field, mutation] of [
      ["contentHash", "content-changed"],
      ["organizationIdRaw", "organization-changed"],
      ["publicKey", "public-key-changed"],
      ["createdAtUtc", "timestamp-changed"],
    ]) {
      if (previous[field] !== current[field]) {
        quarantine.push({
          reason: field === "organizationIdRaw" || field === "publicKey" ? "identity-conflict" : "source-mutation",
          mutation,
          itemId: previous.itemId,
          previousValue: previous[field],
          currentValue: current[field],
        });
      }
    }
  }
  return quarantine;
}

export function buildDiscussionSnapshot({
  proposalDetails,
  organizations,
  roster,
  classifications,
  eligibilityByItemId,
  previousSnapshot = null,
  fetchedAt = new Date().toISOString(),
  sources = {},
}) {
  const rosterMembers = validateRoster(roster);
  const effectiveClassifications = [...resolveClassifications(classifications, proposalDetails).values()]
    .sort((a, b) => a.number - b.number);
  const rawItems = collectDiscussionItems(proposalDetails, organizations, classifications);
  assert(eligibilityByItemId instanceof Map, "eligibility records must be supplied by item ID");

  const items = rawItems.map((item) => {
    if (item.identityConflict) {
      return { ...item, eligibilityResult: "identity-conflict", eligibilityEvidence: null, collectedAtUtc: fetchedAt };
    }
    const evidence = eligibilityByItemId.get(item.itemId);
    assert(evidence && Array.isArray(evidence.committee), `discussion item ${item.itemId} has no historical eligibility evidence`);
    const committeeKeys = new Set(evidence.committee.map((entry) => normalizeKey(entry.publicKey, `eligibility record ${item.itemId}`)));
    return {
      ...item,
      eligibilityResult: committeeKeys.has(item.publicKey) ? "eligible" : "ineligible",
      eligibilityEvidence: {
        checkedAtUtc: evidence.checkedAtUtc,
        blockHeight: evidence.blockHeight,
        blockTimeUtc: evidence.blockTimeUtc,
        stateRoot: evidence.stateRoot,
        sources: evidence.sources,
        method: "NeoToken committee storage corroborated across two full-state RPC sources at the item's timestamp",
      },
      collectedAtUtc: fetchedAt,
    };
  });

  const quarantine = [
    ...items.filter((item) => item.eligibilityResult === "identity-conflict").map((item) => ({
      reason: "identity-conflict",
      mutation: item.identityConflict,
      itemId: item.itemId,
      organizationIdRaw: item.organizationIdRaw,
    })),
    ...detectMutations(previousSnapshot, items),
  ];

  const memberByKey = new Map(rosterMembers.map((member) => [member.publicKey, member]));
  const memberItems = new Map(rosterMembers.map((member) => [member.publicKey, []]));
  for (const item of items) {
    if (item.proposalStatus !== "real" || item.eligibilityResult !== "eligible" || !memberByKey.has(item.publicKey)) continue;
    memberItems.get(item.publicKey).push(item);
  }
  const perMember = rosterMembers.map((member) => {
    const evidence = memberItems.get(member.publicKey);
    const authorship = evidence.filter((item) => item.evidenceType === "authorship");
    const comments = evidence.filter((item) => item.evidenceType === "comment" && item.countsAsRecordedComment);
    return {
      publicKey: member.publicKey,
      name: member.name,
      rank: member.rank,
      proposalsAuthoredWhileEligible: authorship.length,
      authoredProposalNumbers: [...new Set(authorship.map((item) => item.proposalNumber))].sort((a, b) => a - b),
      recordedCommentsWhileEligible: comments.length,
      recordedCommentItemIds: comments.map((item) => item.itemId).sort(),
      distinctRealProposalsCommentedOnWhileEligible: new Set(comments.map((item) => item.proposalNumber)).size,
      commentedProposalNumbers: [...new Set(comments.map((item) => item.proposalNumber))].sort((a, b) => a - b),
    };
  }).sort((a, b) => a.rank - b.rank);

  return {
    schemaVersion: 1,
    fetchedAt,
    method: "neo-community-proposal-messages-with-item-timestamp-eligibility",
    collectionStatus: quarantine.length === 0 ? "ok" : "quarantined",
    publicationRule: "Only eligible authorship and non-empty comments on human-classified real proposals contribute to displayed raw counts. No percentage or combined score is computed.",
    sources,
    proposalClassifications: effectiveClassifications,
    reviewRequired: effectiveClassifications.filter((proposal) => proposal.status === "unreviewed"),
    items,
    quarantine,
    perMember,
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  assert(response.ok, `request failed (${response.status}) for ${url}`);
  return response.json();
}

export async function fetchDiscussion({
  apiBase = process.env.QUORUM_WATCH_API_BASE ?? DEFAULT_API_BASE,
  rpcUrls = process.env.QUORUM_WATCH_STATE_RPC_URLS?.split(",").map((url) => url.trim()).filter(Boolean) ?? DEFAULT_STATE_RPC_URLS,
  rosterPath = DEFAULT_ROSTER,
  classificationsPath = DEFAULT_CLASSIFICATIONS,
  previousPath = DEFAULT_OUTPUT,
} = {}) {
  const base = apiBase.replace(/\/$/, "");
  const [summaries, organizations, rosterRaw, classificationsRaw] = await Promise.all([
    fetchJson(`${base}/proposal/get/all`),
    fetchJson(`${base}/organization/get/all`),
    readFile(rosterPath, "utf8"),
    readFile(classificationsPath, "utf8"),
  ]);
  assert(Array.isArray(summaries) && summaries.length > 0, "proposal list is empty");
  const proposalDetails = await Promise.all(summaries.map((proposal) =>
    fetchJson(`${base}/proposal/get?proposal_id=${encodeURIComponent(proposal.proposal_id)}`)));
  const roster = JSON.parse(rosterRaw);
  const classifications = JSON.parse(classificationsRaw);
  const rawItems = collectDiscussionItems(proposalDetails, organizations, classifications);
  const currentHeight = await getCurrentChainHeight(rpcUrls[0]);
  const timeCache = new Map();
  const eligibilityByItemId = new Map();
  for (const item of rawItems) {
    if (item.identityConflict) continue;
    eligibilityByItemId.set(item.itemId, await resolveHistoricalCommitteeAtTimestamp(item.createdAtUtc, {
      rpcUrls,
      currentHeight,
      timeCache,
      context: `discussion item ${item.itemId}`,
    }));
  }
  let previousSnapshot = null;
  try { previousSnapshot = JSON.parse(await readFile(previousPath, "utf8")); } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return buildDiscussionSnapshot({
    proposalDetails,
    organizations,
    roster,
    classifications,
    eligibilityByItemId,
    previousSnapshot,
    sources: {
      proposals: `${base}/proposal/get/all`,
      proposalDetails: `${base}/proposal/get?proposal_id={id}`,
      organizations: `${base}/organization/get/all`,
      historicalCommitteeRpcUrls: rpcUrls,
      classifications: "data/proposal-classifications.json",
      methodology: "docs/DISCUSSION-ENGAGEMENT-RESEARCH.md",
    },
  });
}

export async function writeDiscussionSnapshot(snapshot, outputPath = process.env.QUORUM_WATCH_DISCUSSION_OUTPUT ?? DEFAULT_OUTPUT) {
  assert(snapshot?.schemaVersion === 1, "no valid discussion snapshot to write");
  assert(snapshot.collectionStatus === "ok" && snapshot.quarantine.length === 0, "candidate snapshot is quarantined; previous approved snapshot was preserved");
  const target = resolve(outputPath);
  const temporary = `${target}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporary, target);
  return target;
}

async function main() {
  const snapshot = await fetchDiscussion();
  const output = await writeDiscussionSnapshot(snapshot);
  console.log(`Wrote ${snapshot.items.length} discussion evidence items for ${snapshot.perMember.length} current Council members to ${output}`);
  if (snapshot.reviewRequired.length > 0) console.log(`Review required for proposal(s): ${snapshot.reviewRequired.map((item) => `#${item.number}`).join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
