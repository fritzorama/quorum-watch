import { ECDH, createHash, createPublicKey, verify } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TRACKER_BASE = "https://staging-council-vote-tracker.ndapp.org";
const RPC_URLS = ["https://mainnet2.neo.coz.io:443", "https://n3seed1.ngd.network:10332"];
const NETWORK_MAGIC = 860833102;
const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), "../data/council-decisions.json");
const ROSTER = resolve(dirname(fileURLToPath(import.meta.url)), "../data/council-roster.json");

function assert(condition, message) {
  if (!condition) throw new Error(`Council decision validation failed: ${message}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest();
}

function readPushes(scriptBase64, expectedSize) {
  const script = Buffer.from(scriptBase64, "base64");
  const values = [];
  for (let offset = 0; offset + 2 <= script.length;) {
    if (script[offset] !== 0x0c || script[offset + 1] !== expectedSize) {
      offset += 1;
      continue;
    }
    const start = offset + 2;
    assert(start + expectedSize <= script.length, "truncated pushed value");
    values.push(script.subarray(start, start + expectedSize));
    offset = start + expectedSize;
  }
  return values;
}

export function extractCommitteeKeys(verificationBase64) {
  const keys = readPushes(verificationBase64, 33).filter(value => value[0] === 0x02 || value[0] === 0x03);
  assert(keys.length === 21, `committee witness contains ${keys.length} public keys, expected 21`);
  assert(new Set(keys.map(key => key.toString("hex"))).size === 21, "committee witness contains duplicate public keys");
  return keys;
}

export function extractSignatures(invocationBase64) {
  const signatures = readPushes(invocationBase64, 64);
  assert(signatures.length > 0, "committee witness contains no signatures");
  return signatures;
}

export function extractRequiredSignatures(verificationBase64) {
  const script = Buffer.from(verificationBase64, "base64");
  assert(script.length > 0, "empty verification script");
  if (script[0] >= 0x10 && script[0] <= 0x20) return script[0] - 0x10;
  if (script[0] === 0x00 && script.length >= 2) return script.readInt8(1);
  throw new Error("Council decision validation failed: unsupported committee threshold encoding");
}

function publicKeyObject(compressedKey) {
  const uncompressed = ECDH.convertKey(compressedKey, "prime256v1", undefined, undefined, "uncompressed");
  const prefix = Buffer.from("3059301306072a8648ce3d020106082a8648ce3d030107034200", "hex");
  return createPublicKey({ key: Buffer.concat([prefix, uncompressed]), format: "der", type: "spki" });
}

export function transactionSignData(txHash, networkMagic = NETWORK_MAGIC) {
  assert(/^0x[0-9a-f]{64}$/i.test(txHash), "invalid transaction hash");
  const magic = Buffer.alloc(4);
  magic.writeUInt32LE(networkMagic);
  const hashLittleEndian = Buffer.from(txHash.slice(2), "hex").reverse();
  return Buffer.concat([magic, hashLittleEndian]);
}

export function attributeSignatures(txHash, publicKeys, signatures, networkMagic = NETWORK_MAGIC) {
  const signData = transactionSignData(txHash, networkMagic);
  const matches = [];
  let keyIndex = 0;
  for (const signature of signatures) {
    let matched = false;
    while (keyIndex < publicKeys.length) {
      const publicKey = publicKeys[keyIndex++];
      if (verify("sha256", signData, { key: publicKeyObject(publicKey), dsaEncoding: "ieee-p1363" }, signature)) {
        matches.push({ publicKey: publicKey.toString("hex"), signature: signature.toString("hex") });
        matched = true;
        break;
      }
    }
    assert(matched, "an invocation signature does not match the remaining committee keys");
  }
  return matches;
}

function base58Encode(bytes) {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let value = BigInt(`0x${bytes.toString("hex")}`);
  let result = "";
  while (value > 0n) {
    result = alphabet[Number(value % 58n)] + result;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    result = `1${result}`;
  }
  return result;
}

export function verificationScriptAddress(verificationBase64) {
  const script = Buffer.from(verificationBase64, "base64");
  const scriptHash = createHash("ripemd160").update(sha256(script)).digest();
  const payload = Buffer.concat([Buffer.from([0x35]), scriptHash]);
  return base58Encode(Buffer.concat([payload, sha256(sha256(payload)).subarray(0, 4)]));
}

function verifyActionClaim(scriptBase64, action) {
  assert(typeof action.method === "string" && action.method.length > 0, "source action has no method");
  assert(/^0x[0-9a-f]{40}$/i.test(action.contract), `invalid contract hash for ${action.method}`);
  const script = Buffer.from(scriptBase64, "base64");
  assert(script.includes(Buffer.from(action.method, "utf8")), `script does not contain claimed method ${action.method}`);
  const contractLittleEndian = Buffer.from(action.contract.slice(2), "hex").reverse();
  assert(script.includes(contractLittleEndian), `script does not contain claimed contract for ${action.method}`);
}

export function verifyCandidate(candidate, detail, rawHex, transaction) {
  assert(candidate.txHash?.toLowerCase() === transaction.hash?.toLowerCase(), "transaction hash disagrees with source candidate");
  assert(transaction.vmstate === "HALT", `${candidate.txHash} did not execute successfully`);
  assert(candidate.vmState === transaction.vmstate && candidate.applied === true, "source execution state disagrees with chain");
  assert(candidate.blockIndex === transaction.blockindex, "source block height disagrees with chain");
  assert(candidate.timestampMs === transaction.blocktime, "source timestamp disagrees with chain");
  assert(detail.txHash?.toLowerCase() === candidate.txHash.toLowerCase(), "source detail hash disagrees with list");
  assert(Array.isArray(detail.actions) && detail.actions.length > 0, "source detail has no actions");
  for (const action of detail.actions) verifyActionClaim(transaction.script, action);

  const witnesses = transaction.witnesses.map((witness, index) => ({
    index,
    witness,
    keys: readPushes(witness.verification, 33).filter(value => value[0] === 0x02 || value[0] === 0x03),
  }));
  const committee = witnesses.find(item => item.keys.length === 21);
  assert(committee, "no 21-key committee witness found after scanning every witness");
  const publicKeys = extractCommitteeKeys(committee.witness.verification);
  const signatures = extractSignatures(committee.witness.invocation);
  const requiredSignatures = extractRequiredSignatures(committee.witness.verification);
  const attributed = attributeSignatures(candidate.txHash, publicKeys, signatures);
  const address = verificationScriptAddress(committee.witness.verification);
  assert(address === candidate.committeeAddress, "derived committee address disagrees with source");
  assert(publicKeys.length === candidate.eligibleSigs, "eligible-key count disagrees with source");
  assert(requiredSignatures === candidate.requiredSigs, "committee threshold disagrees with source");
  assert(attributed.length === candidate.signedSigs, "signature count disagrees with source");

  const sourceRoster = new Map(detail.roster.map(item => [item.pubkey.toLowerCase(), item]));
  assert(sourceRoster.size === publicKeys.length, "source roster size disagrees with witness");
  const signedKeys = new Set(attributed.map(item => item.publicKey));
  for (const key of publicKeys.map(value => value.toString("hex"))) {
    assert(sourceRoster.has(key), `source roster omits committee key ${key}`);
    assert(Boolean(sourceRoster.get(key).signed) === signedKeys.has(key), `source signer attribution disagrees for ${key}`);
  }

  return {
    txHash: candidate.txHash.toLowerCase(),
    blockIndex: candidate.blockIndex,
    timestampUtc: new Date(candidate.timestampMs).toISOString(),
    vmState: transaction.vmstate,
    rawTransactionSha256: sha256(Buffer.from(rawHex, "hex")).toString("hex"),
    committeeWitnessIndex: committee.index,
    committeeAddress: address,
    requiredSignatures,
    eligiblePublicKeys: publicKeys.map(value => value.toString("hex")),
    includedSignatures: attributed,
    actions: detail.actions.map(action => ({
      callIndex: action.callIndex,
      contract: action.contract.toLowerCase(),
      contractName: action.contractName,
      method: action.method,
      category: action.category,
      title: action.title,
      summary: action.summary,
      args: action.args,
      argsComplete: action.argsComplete,
      verification: "contract-and-method-bytes-present-in-chain-script",
    })),
    sourceUrl: `${TRACKER_BASE}/api/votes/${candidate.txHash}`,
    explorerUrl: `https://neo3scan.com/transaction/${candidate.txHash}`,
    verification: "independently-fetched-and-cryptographically-verified",
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${url}`);
  return response.json();
}

async function rpc(url, method, params) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`RPC request failed (${response.status}) for ${url}`);
  const body = await response.json();
  if (body.error) throw new Error(`RPC ${method} failed for ${url}: ${body.error.message}`);
  return body.result;
}

async function fetchChainEvidence(url, txHash) {
  const [raw, transaction, applicationLog] = await Promise.all([
    rpc(url, "getrawtransaction", [txHash, false]),
    rpc(url, "getrawtransaction", [txHash, true]),
    rpc(url, "getapplicationlog", [txHash]),
  ]);
  const header = await rpc(url, "getblockheader", [transaction.blockhash, true]);
  assert(applicationLog.executions?.length === 1, `${url} returned an unexpected application-log shape for ${txHash}`);
  return {
    raw,
    transaction: {
      ...transaction,
      blockindex: header.index,
      blocktime: header.time,
      vmstate: applicationLog.executions[0].vmstate,
    },
  };
}

export async function collectCouncilDecisions({ trackerBase = TRACKER_BASE, rpcUrls = RPC_URLS, rosterPath = ROSTER } = {}) {
  const listing = await fetchJson(`${trackerBase}/api/votes?limit=100&offset=0`);
  assert(Array.isArray(listing.items) && listing.items.length === listing.total, "tracker list is incomplete or paginated");
  assert(new Set(listing.items.map(item => item.txHash.toLowerCase())).size === listing.items.length, "tracker returned duplicate transaction hashes");
  const roster = JSON.parse(await readFile(rosterPath, "utf8"));
  assert(roster.schemaVersion === 1 && roster.members?.length === 21, "local Council roster is unsupported or incomplete");
  const currentIdentity = new Map(roster.members.map(member => [member.publicKey.toLowerCase(), member.name]));

  const decisions = [];
  for (const candidate of listing.items) {
    const [detail, ...chainResults] = await Promise.all([
      fetchJson(`${trackerBase}/api/votes/${candidate.txHash}`),
      ...rpcUrls.map(url => fetchChainEvidence(url, candidate.txHash)),
    ]);
    const rawTransactions = chainResults.map(result => result.raw);
    const verboseTransactions = chainResults.map(result => result.transaction);
    assert(new Set(rawTransactions).size === 1, `RPC sources disagree on raw transaction ${candidate.txHash}`);
    const chainClaims = verboseTransactions.map(tx => JSON.stringify({ hash: tx.hash, blockhash: tx.blockhash, blocktime: tx.blocktime, vmstate: tx.vmstate, script: tx.script, witnesses: tx.witnesses }));
    assert(new Set(chainClaims).size === 1, `RPC sources disagree on transaction evidence ${candidate.txHash}`);
    const verified = verifyCandidate(candidate, detail, rawTransactions[0], verboseTransactions[0]);
    verified.eligibleIdentities = verified.eligiblePublicKeys.map(publicKey => ({
      publicKey,
      currentMemberName: currentIdentity.get(publicKey) ?? null,
      identityState: currentIdentity.has(publicKey) ? "matched-current-roster" : "historical-identity-unresolved",
    }));
    verified.includedSignatures = verified.includedSignatures.map(item => ({
      ...item,
      currentMemberName: currentIdentity.get(item.publicKey) ?? null,
      identityState: currentIdentity.has(item.publicKey) ? "matched-current-roster" : "historical-identity-unresolved",
    }));
    decisions.push(verified);
  }

  return {
    schemaVersion: 1,
    collectedAtUtc: new Date().toISOString(),
    publicationState: "local-review-only",
    scope: "Independently verified executed Council witnesses discovered via the ndapp.org staging tracker; catalogue completeness is not established.",
    percentageAvailable: false,
    historicalIdentityCoverageComplete: false,
    source: { type: "discovery-only", url: `${trackerBase}/api/votes`, candidateCount: listing.total },
    rpcSources: rpcUrls,
    decisionCount: decisions.length,
    actionCount: decisions.reduce((sum, item) => sum + item.actions.length, 0),
    decisions,
    quarantine: [],
  };
}

export async function writeSnapshot(snapshot, outputPath = process.env.QUORUM_WATCH_COUNCIL_DECISIONS_OUTPUT ?? OUTPUT) {
  const target = resolve(outputPath);
  const temporary = `${target}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporary, target);
  return target;
}

async function main() {
  const snapshot = await collectCouncilDecisions();
  const output = await writeSnapshot(snapshot);
  console.log(`Verified ${snapshot.decisionCount} Council transactions (${snapshot.actionCount} actions) into ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
