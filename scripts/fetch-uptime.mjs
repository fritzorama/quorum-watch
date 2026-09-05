import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_RPC_URLS = [
  "https://mainnet2.neo.coz.io:443",
  "https://rpc1.n3.nspcc.ru:10331",
  "https://n3seed1.ngd.network:10332",
];
const DEFAULT_OUTPUT = resolve(HERE, "../data/uptime.json");
const DEFAULT_ROSTER = resolve(HERE, "../data/council-roster.json");
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CONSENSUS_NODE_COUNT = 7;
const MAX_TIP_AGE_MS = 5 * 60 * 1000;
const MAX_HEIGHT_SPREAD = 3;

function assert(condition, message) {
  if (!condition) throw new Error(`Uptime data validation failed: ${message}`);
}

function normalizeKey(value) {
  assert(typeof value === "string" && /^(02|03)[0-9a-f]{64}$/i.test(value), `invalid public key ${value}`);
  return value.toLowerCase();
}

function validateRoster(roster) {
  assert(roster?.schemaVersion === 1, "Council roster schema is unsupported");
  assert(Array.isArray(roster.members) && roster.members.length === 21, "Council roster must contain 21 members");
  const members = roster.members.map((member) => ({ ...member, publicKey: normalizeKey(member.publicKey) }));
  assert(new Set(members.map((member) => member.publicKey)).size === 21, "Council roster contains duplicate keys");
  return members;
}

function validateValidators(rawValidators, members) {
  assert(Array.isArray(rawValidators) && rawValidators.length === CONSENSUS_NODE_COUNT, "RPC must return exactly seven validators");
  const memberByKey = new Map(members.map((member) => [member.publicKey, member]));
  const validators = rawValidators.map((validator, index) => {
    const publicKey = normalizeKey(validator.publickey);
    const member = memberByKey.get(publicKey);
    assert(member, `validator ${publicKey} is not in the current Council roster`);
    return { index, publicKey, name: member.name, rank: member.rank };
  });
  assert(new Set(validators.map((validator) => validator.publicKey)).size === CONSENSUS_NODE_COUNT, "validator list contains duplicate keys");
  return validators;
}

function validateBlock(block) {
  assert(block && typeof block === "object", "block is missing");
  assert(Number.isInteger(block.index) && block.index >= 0, "block index is invalid");
  assert(Number.isInteger(block.primary) && block.primary >= 0 && block.primary < CONSENSUS_NODE_COUNT, `block ${block.index} primary index is invalid`);
  assert(Number.isFinite(block.time) && block.time > 0, `block ${block.index} timestamp is invalid`);
  assert(/^0x[0-9a-f]{64}$/i.test(block.hash), `block ${block.index} hash is invalid`);
  assert(typeof block.nextconsensus === "string" && /^N[1-9A-HJ-NP-Za-km-z]{33}$/.test(block.nextconsensus), `block ${block.index} next-consensus address is invalid`);
  return { index: block.index, hash: block.hash.toLowerCase(), time: block.time, primary: block.primary, nextConsensus: block.nextconsensus };
}

function freshTotals(validators) {
  return validators.map((validator) => ({
    ...validator,
    assignedPrimaryDuties: 0,
    completedPrimaryDuties: 0,
    missedPrimaryDuties: 0,
    dutySuccessPercent: null,
  }));
}

export function buildUptimeSnapshot({ existing = null, rawValidators, rawBlocks, roster, observedAt = new Date().toISOString(), rpcUrls = DEFAULT_RPC_URLS }) {
  const members = validateRoster(roster);
  const validators = validateValidators(rawValidators, members);
  assert(Array.isArray(rawBlocks) && rawBlocks.length > 0, "no finalized blocks were supplied");
  const blocks = rawBlocks.map(validateBlock).sort((a, b) => a.index - b.index);
  for (let index = 1; index < blocks.length; index += 1) {
    assert(blocks[index].index === blocks[index - 1].index + 1, "block range is not consecutive");
  }

  let startedAt = new Date(blocks[0].time).toISOString();
  let startHeight = blocks[0].index;
  let totals = freshTotals(validators);
  let missedDutyEvidence = [];
  let consensusAddress = blocks[0].nextConsensus;

  for (const block of blocks) assert(block.nextConsensus === consensusAddress, "next-consensus address changed inside the observation window");

  if (existing) {
    assert(existing.schemaVersion === 1, "existing uptime snapshot schema is unsupported");
    assert(existing.status === "collecting" || existing.status === "complete", "existing snapshot status is invalid");
    assert(existing.window?.targetMilliseconds === WINDOW_MS, "existing observation window differs from the configured window");
    assert(Array.isArray(existing.validators) && existing.validators.length === CONSENSUS_NODE_COUNT, "existing validator set is invalid");
    for (let index = 0; index < validators.length; index += 1) {
      assert(existing.validators[index].publicKey === validators[index].publicKey, "validator set or ordering changed; start a new effective-dated observation window");
    }
    assert(blocks[0].index === existing.window.endHeight + 1, "new block range does not continue the existing snapshot");
    startedAt = existing.window.startedAt;
    startHeight = existing.window.startHeight;
    totals = existing.validators.map((record) => ({ ...record, dutySuccessPercent: null }));
    missedDutyEvidence = [...existing.missedDutyEvidence];
    assert(existing.consensusAddress === consensusAddress, "consensus contract changed; start a new effective-dated observation window");
  }

  for (const block of blocks) {
    const expectedPrimary = block.index % CONSENSUS_NODE_COUNT;
    const record = totals[expectedPrimary];
    record.assignedPrimaryDuties += 1;
    if (block.primary === expectedPrimary) {
      record.completedPrimaryDuties += 1;
    } else {
      record.missedPrimaryDuties += 1;
      missedDutyEvidence.push({
        height: block.index,
        hash: block.hash,
        timestamp: new Date(block.time).toISOString(),
        expectedPrimary,
        actualPrimary: block.primary,
      });
    }
  }

  for (const record of totals) {
    assert(record.completedPrimaryDuties + record.missedPrimaryDuties === record.assignedPrimaryDuties, `duty totals disagree for ${record.name}`);
  }

  const lastBlock = blocks.at(-1);
  const elapsedMilliseconds = lastBlock.time - Date.parse(startedAt);
  assert(elapsedMilliseconds >= 0, "observation timestamps run backwards");
  const complete = elapsedMilliseconds >= WINDOW_MS && totals.every((record) => record.assignedPrimaryDuties > 0);
  if (complete) {
    for (const record of totals) {
      record.dutySuccessPercent = Number((record.completedPrimaryDuties / record.assignedPrimaryDuties * 100).toFixed(2));
    }
  }

  return {
    schemaVersion: 1,
    fetchedAt: observedAt,
    status: complete ? "complete" : "collecting",
    metric: {
      label: "Consensus primary-duty success",
      limitation: "This is on-chain evidence of scheduled speaker duties for the seven consensus nodes, not direct host or RPC availability for all 21 Council members.",
      nonValidatorPolicy: "not-observable",
    },
    sources: {
      rpcUrls,
      corroborationRule: "Three independent RPC responses must agree on validator ordering and the selected boundary block hash; their reported heights may differ by at most three blocks.",
      validatorMethod: "getnextblockvalidators",
      blockMethod: "getblock(height, 1)",
      methodology: "https://developers.neo.org/docs/n3/foundation/consensus/consensus_algorithm",
      blockSchema: "https://developers.neo.org/docs/n3/foundation/Blocks",
    },
    window: {
      targetMilliseconds: WINDOW_MS,
      startedAt,
      startHeight,
      endedAt: new Date(lastBlock.time).toISOString(),
      endHeight: lastBlock.index,
      elapsedMilliseconds,
      blockCount: lastBlock.index - startHeight + 1,
      complete,
    },
    validators: totals,
    consensusAddress,
    missedDutyEvidence,
    boundaryEvidence: {
      first: existing?.boundaryEvidence?.first ?? { height: blocks[0].index, hash: blocks[0].hash },
      last: { height: lastBlock.index, hash: lastBlock.hash },
    },
  };
}

async function rpc(rpcUrl, method, params = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  assert(response.ok, `RPC ${method} failed with HTTP ${response.status}`);
  const payload = await response.json();
  assert(!payload.error, `RPC ${method} returned ${payload.error?.message ?? "an error"}`);
  return payload.result;
}

async function fetchBlocks(rpcUrl, fromHeight, toHeight) {
  const blocks = [];
  const batchSize = 50;
  for (let batchStart = fromHeight; batchStart <= toHeight; batchStart += batchSize) {
    const heights = Array.from({ length: Math.min(batchSize, toHeight - batchStart + 1) }, (_, offset) => batchStart + offset);
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(heights.map((height) => ({ jsonrpc: "2.0", method: "getblock", params: [height, 1], id: height }))),
    });
    assert(response.ok, `RPC block batch failed with HTTP ${response.status}`);
    const payload = await response.json();
    assert(Array.isArray(payload) && payload.length === heights.length, "RPC block batch response is incomplete");
    const byId = new Map(payload.map((item) => [item.id, item]));
    for (const height of heights) {
      const item = byId.get(height);
      assert(item && !item.error && item.result, `RPC block batch is missing height ${height}`);
      blocks.push(item.result);
    }
  }
  return blocks;
}

export async function fetchUptime({ rpcUrls = (process.env.QUORUM_WATCH_RPC_URLS?.split(",").map((url) => url.trim()).filter(Boolean) ?? DEFAULT_RPC_URLS), rosterPath = DEFAULT_ROSTER, outputPath = DEFAULT_OUTPUT } = {}) {
  assert(Array.isArray(rpcUrls) && rpcUrls.length >= 3, "at least three RPC sources are required");
  const rosterText = await readFile(rosterPath, "utf8");
  const sourceStates = await Promise.all(rpcUrls.map(async (rpcUrl) => ({
    rpcUrl,
    rawValidators: await rpc(rpcUrl, "getnextblockvalidators"),
    blockCount: await rpc(rpcUrl, "getblockcount"),
  })));
  for (const state of sourceStates) assert(Number.isInteger(state.blockCount) && state.blockCount > 0, `RPC block count is invalid for ${state.rpcUrl}`);
  const heights = sourceStates.map((state) => state.blockCount - 1);
  assert(Math.max(...heights) - Math.min(...heights) <= MAX_HEIGHT_SPREAD, `RPC chain tips disagree by more than ${MAX_HEIGHT_SPREAD} blocks`);
  const toHeight = Math.min(...heights);
  const boundaryBlocks = await Promise.all(rpcUrls.map((rpcUrl) => rpc(rpcUrl, "getblock", [toHeight, 1])));
  const boundary = validateBlock(boundaryBlocks[0]);
  assert(Date.now() - boundary.time <= MAX_TIP_AGE_MS, "corroborated chain tip is stale");
  assert(Date.now() >= boundary.time, "corroborated chain tip timestamp is in the future");
  for (const candidate of boundaryBlocks.slice(1).map(validateBlock)) {
    assert(candidate.index === boundary.index && candidate.hash === boundary.hash, "RPC sources disagree on the boundary block");
  }
  const validatorKeyOrder = sourceStates[0].rawValidators.map((validator) => normalizeKey(validator.publickey)).join(",");
  for (const state of sourceStates.slice(1)) {
    assert(state.rawValidators.map((validator) => normalizeKey(validator.publickey)).join(",") === validatorKeyOrder, "RPC sources disagree on validator ordering");
  }
  let existing = null;
  try {
    existing = JSON.parse(await readFile(outputPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const fromHeight = existing ? existing.window.endHeight + 1 : toHeight;
  if (fromHeight > toHeight) return existing;
  const rawBlocks = await fetchBlocks(rpcUrls[0], fromHeight, toHeight);
  return buildUptimeSnapshot({ existing, rawValidators: sourceStates[0].rawValidators, rawBlocks, roster: JSON.parse(rosterText), rpcUrls });
}

export async function writeUptimeSnapshot(snapshot, outputPath = process.env.QUORUM_WATCH_UPTIME_OUTPUT ?? DEFAULT_OUTPUT) {
  assert(snapshot, "no uptime snapshot to write");
  const target = resolve(outputPath);
  const temporary = `${target}.tmp`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(temporary, target);
  return target;
}

async function main() {
  const snapshot = await fetchUptime();
  const output = await writeUptimeSnapshot(snapshot);
  console.log(`Uptime observation ${snapshot.status}: blocks ${snapshot.window.startHeight}-${snapshot.window.endHeight}; wrote ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
