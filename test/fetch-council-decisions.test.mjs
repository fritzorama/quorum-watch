import test from "node:test";
import assert from "node:assert/strict";
import { attributeSignatures, extractCommitteeKeys, extractRequiredSignatures, extractSignatures, transactionSignData } from "../scripts/fetch-council-decisions.mjs";

const keys = Array.from({ length: 21 }, (_, index) => Buffer.from(`02${(index + 1).toString(16).padStart(64, "0")}`, "hex"));

test("extracts all 21 stable public keys from a committee script", () => {
  const script = Buffer.concat(keys.map(key => Buffer.concat([Buffer.from([0x0c, 0x21]), key]))).toString("base64");
  assert.deepEqual(extractCommitteeKeys(script).map(key => key.toString("hex")), keys.map(key => key.toString("hex")));
});

test("rejects a committee script with fewer than 21 keys", () => {
  const script = Buffer.concat(keys.slice(0, 20).map(key => Buffer.concat([Buffer.from([0x0c, 0x21]), key]))).toString("base64");
  assert.throws(() => extractCommitteeKeys(script), /20 public keys/);
});

test("extracts pushed 64-byte signatures", () => {
  const signatures = [Buffer.alloc(64, 1), Buffer.alloc(64, 2)];
  const invocation = Buffer.concat(signatures.map(signature => Buffer.concat([Buffer.from([0x0c, 0x40]), signature]))).toString("base64");
  assert.deepEqual(extractSignatures(invocation), signatures);
});

test("extracts the 11-of-21 threshold from a standard committee script", () => {
  assert.equal(extractRequiredSignatures(Buffer.from([0x1b]).toString("base64")), 11);
});

test("cryptographically attributes a real executed-witness signature", () => {
  const publicKey = Buffer.from("031de8a766da668b2935351acd8f23c26dbedd54b8208b135f0a636b544c9e0dad", "hex");
  const signature = Buffer.from("5313c954fab7e51f5c5b42c86f03df12b1e6bd125a6197cdc27a55998d2a4c8d4dd2f0921b148c5eb0a1f05265148541a3d65a8e71081e483b9712386036e40b", "hex");
  assert.equal(attributeSignatures("0xf391f093082247c4c5f898e89f8ca0f0f5d18e146840f40c8c38994bb02593f7", [publicKey], [signature])[0].publicKey, publicKey.toString("hex"));
});

test("builds Neo mainnet sign data with little-endian magic and transaction hash", () => {
  const hash = `0x${Array.from({ length: 32 }, (_, index) => index.toString(16).padStart(2, "0")).join("")}`;
  const data = transactionSignData(hash);
  assert.equal(data.subarray(0, 4).toString("hex"), "4e454f33");
  assert.equal(data.subarray(4).toString("hex"), Buffer.from(hash.slice(2), "hex").reverse().toString("hex"));
});
