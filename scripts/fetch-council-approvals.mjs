import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_API_BASE = "https://www.neo3scan.com/api/multisig";
const DEFAULT_OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), "../data/council-approvals.json");
const DEFAULT_ROSTER = resolve(dirname(fileURLToPath(import.meta.url)), "../data/council-roster.json");

const APPROVED_REQUESTS = new Map([[12, {
  transactionHash: "0x50f683f5db177d2e23d11882c411e5cec37c446213d9cea3174d9ad30db836f1",
  signatureFingerprint: "ebb7a7f1bf76bfe5fdd2dcaa0acd9c7b4d0d1802a3eeac5abdcc05d921e76b0c",
  requiredSignatures: 11,
}]]);

function assert(condition, message) {
  if (!condition) throw new Error(`Council approval validation failed: ${message}`);
}

function validPublicKey(value) {
  return typeof value === "string" && /^(02|03)[0-9a-f]{64}$/i.test(value);
}

function validateRoster(roster) {
  assert(roster?.schemaVersion === 1, "Council roster schema is unsupported");
  assert(Array.isArray(roster.members) && roster.members.length === 21, "Council roster must contain 21 members");
  const keys = new Set();
  for (const member of roster.members) {
    assert(validPublicKey(member.publicKey), `invalid roster public key for ${member.name}`);
    const key = member.publicKey.toLowerCase();
    assert(!keys.has(key), `duplicate roster public key ${key}`);
    keys.add(key);
  }
  return roster.members.map(member => ({ ...member, publicKey: member.publicKey.toLowerCase() }));
}

function signatureFingerprint(signatures) {
  const canonical = signatures
    .map(signature => `${signature.public_key.toLowerCase()}:${signature.signature.toLowerCase()}`)
    .sort()
    .join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

export function buildSnapshot(requestList, requestDetails, roster, fetchedAt = new Date().toISOString(), approvedRequests = APPROVED_REQUESTS) {
  assert(Array.isArray(requestList), "request list is not an array");
  assert(Array.isArray(requestDetails), "request details are not an array");
  const rosterMembers = validateRoster(roster);
  const rosterByKey = new Map(rosterMembers.map(member => [member.publicKey, member]));
  const listedIds = new Set();
  for (const request of requestList) {
    assert(Number.isInteger(request.id), "listed request has no numeric ID");
    assert(!listedIds.has(request.id), `duplicate request ID ${request.id}`);
    listedIds.add(request.id);
  }

  const detailsById = new Map(requestDetails.map(detail => [detail.id, detail]));
  const participation = new Map(rosterMembers.map(member => [member.publicKey, {
    publicKey: member.publicKey,
    includedInExecutedWitness: 0,
    additionalSignatures: 0,
    documentedApprovals: 0,
    evidence: [],
  }]));
  const historicalOnlyEvidence = [];

  const decisions = [...approvedRequests.entries()].map(([id, approved]) => {
    assert(listedIds.has(id), `approved request #${id} disappeared from the list`);
    const detail = detailsById.get(id);
    assert(detail, `approved request #${id} has no detail record`);
    assert(detail.network === "mainnet", `request #${id} is not mainnet`);
    assert(detail.status === "EXECUTED", `request #${id} is not executed`);
    assert(detail.broadcast_tx_hash?.toLowerCase() === approved.transactionHash, `request #${id} transaction hash changed`);
    assert(detail.params?.hash?.toLowerCase() === approved.transactionHash, `request #${id} unsigned transaction hash changed`);
    assert(detail.signers_required === approved.requiredSignatures, `request #${id} signature threshold changed`);
    assert(Array.isArray(detail.params?.committee_pubkeys) && detail.params.committee_pubkeys.length === 21, `request #${id} committee must have 21 keys`);
    assert(Array.isArray(detail.params?.eligible_signers) && detail.params.eligible_signers.length === 21, `request #${id} must have 21 eligible signer addresses`);
    assert(Array.isArray(detail.signatures), `request #${id} has no signatures array`);
    assert(typeof detail.params?.broadcast_witness?.invocationScript === "string", `request #${id} has no broadcast witness`);

    const committeeKeys = detail.params.committee_pubkeys.map(key => {
      assert(validPublicKey(key), `request #${id} has an invalid committee public key`);
      return key.toLowerCase();
    });
    assert(new Set(committeeKeys).size === 21, `request #${id} has duplicate committee keys`);
    assert(new Set(detail.params.eligible_signers).size === 21, `request #${id} has duplicate eligible signer addresses`);

    const signatureKeys = new Set();
    for (const signature of detail.signatures) {
      assert(validPublicKey(signature.public_key), `request #${id} signature has an invalid public key`);
      assert(/^[0-9a-f]{128}$/i.test(signature.signature), `request #${id} signature has invalid bytes`);
      const key = signature.public_key.toLowerCase();
      assert(committeeKeys.includes(key), `request #${id} signature key is outside its committee`);
      assert(!signatureKeys.has(key), `request #${id} has duplicate signatures for ${key}`);
      signatureKeys.add(key);
    }
    assert(signatureFingerprint(detail.signatures) === approved.signatureFingerprint, `request #${id} verified signature set changed; review required`);

    const broadcastInvocation = Buffer.from(detail.params.broadcast_witness.invocationScript, "base64");
    const evidence = committeeKeys.map(publicKey => {
      const signature = detail.signatures.find(item => item.public_key.toLowerCase() === publicKey);
      let state = "no-verifiable-signature";
      if (signature) {
        state = broadcastInvocation.includes(Buffer.from(signature.signature, "hex"))
          ? "included-in-executed-witness"
          : "additional-signature-recorded-off-chain";
      }
      const item = {
        publicKey,
        state,
        signedAt: signature?.created_at ?? null,
      };
      const current = rosterByKey.get(publicKey);
      if (current) {
        const member = participation.get(publicKey);
        if (state === "included-in-executed-witness") member.includedInExecutedWitness += 1;
        if (state === "additional-signature-recorded-off-chain") member.additionalSignatures += 1;
        if (signature) member.documentedApprovals += 1;
        member.evidence.push({ decisionId: `neo3scan:${id}`, state, signedAt: item.signedAt });
      } else {
        historicalOnlyEvidence.push({ decisionId: `neo3scan:${id}`, ...item });
      }
      return item;
    });

    const includedCount = evidence.filter(item => item.state === "included-in-executed-witness").length;
    const additionalCount = evidence.filter(item => item.state === "additional-signature-recorded-off-chain").length;
    assert(includedCount === approved.requiredSignatures, `request #${id} witness contains ${includedCount}, expected ${approved.requiredSignatures}`);

    return {
      id: `neo3scan:${id}`,
      source: "neo3scan",
      sourceRecordId: id,
      title: detail.title,
      description: detail.description,
      createdAt: detail.created_at,
      executedAt: detail.broadcast_at,
      transactionHash: approved.transactionHash,
      status: "executed",
      requiredSignatures: approved.requiredSignatures,
      includedSignatureCount: includedCount,
      additionalSignatureCount: additionalCount,
      sourceUrl: `https://www.neo3scan.com/tools/governance/${id}`,
      evidence,
    };
  });

  const unreviewedRequests = requestList
    .filter(request => !approvedRequests.has(request.id))
    .map(request => ({
      sourceRecordId: request.id,
      title: request.title ?? null,
      status: request.status ?? null,
      sourceUrl: `https://www.neo3scan.com/tools/governance/${request.id}`,
      publicationState: "review-required",
    }));

  return {
    schemaVersion: 1,
    fetchedAt,
    scope: "Reviewed Neo3Scan Council-approval records; not a complete catalogue of Council decisions.",
    combinedPercentageAvailable: false,
    sources: {
      list: `${DEFAULT_API_BASE}/requests?network=mainnet`,
      details: `${DEFAULT_API_BASE}/requests/{id}?network=mainnet`,
      currentCouncil: roster.sourceUrl,
    },
    decisionCount: decisions.length,
    decisions,
    participation: [...participation.values()],
    historicalOnlyEvidence,
    unreviewedRequests,
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return response.json();
}

export async function fetchCouncilApprovals(apiBase = process.env.QUORUM_WATCH_APPROVALS_API_BASE ?? DEFAULT_API_BASE, rosterPath = DEFAULT_ROSTER) {
  const base = apiBase.replace(/\/$/, "");
  const list = await fetchJson(`${base}/requests?network=mainnet`);
  const details = await Promise.all([...APPROVED_REQUESTS.keys()].map(id => fetchJson(`${base}/requests/${id}?network=mainnet`)));
  const roster = JSON.parse(await readFile(rosterPath, "utf8"));
  const snapshot = buildSnapshot(list, details, roster);
  snapshot.sources.list = `${base}/requests?network=mainnet`;
  snapshot.sources.details = `${base}/requests/{id}?network=mainnet`;
  return snapshot;
}

export async function writeSnapshot(snapshot, outputPath = process.env.QUORUM_WATCH_APPROVALS_OUTPUT ?? DEFAULT_OUTPUT) {
  const target = resolve(outputPath);
  const temporary = `${target}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporary, target);
  return target;
}

async function main() {
  const snapshot = await fetchCouncilApprovals();
  const output = await writeSnapshot(snapshot);
  console.log(`Wrote ${snapshot.decisionCount} reviewed Council approval to ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
