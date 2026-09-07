// Pure, dependency-free check that a council-history.json snapshot lines up exactly with the
// governance.json snapshot it's meant to annotate, before the frontend is allowed to display any
// eligible-proposal percentage derived from it.
//
// This same algorithm is inlined (kept deliberately in sync, see the comment there) inside
// web/index.html's own <script>, because the frontend is a dependency-free single file with no
// build step — it cannot `import` this module at runtime without assuming the deployment pipeline
// publishes files outside `web/index.html` and `data/*.json`, which AGENTS.md does not promise.
// This file exists so the algorithm itself has a real, isolated, unit-tested home; node:test
// exercises it directly.
//
// Checks, in order: both snapshots expose a `proposals` array; no duplicate proposal numbers in
// either one; identical proposal counts; and for every governance proposal, a council-history
// record with the same number, the same proposal ID, and the same createdAt string. Any violation
// returns `{ ok: false, reason }` rather than throwing, so the frontend can fail closed to
// "Eligibility data unavailable" instead of crashing the page.

export function checkCouncilHistoryMatchesGovernance(governanceSnapshot, eligibilitySnapshot) {
  if (!governanceSnapshot || !Array.isArray(governanceSnapshot.proposals)) {
    return { ok: false, reason: "governance snapshot has no proposals array" };
  }
  if (!eligibilitySnapshot || !Array.isArray(eligibilitySnapshot.proposals)) {
    return { ok: false, reason: "council history has no proposals array" };
  }

  const governanceByNumber = new Map();
  for (const proposal of governanceSnapshot.proposals) {
    if (!Number.isInteger(proposal?.number)) return { ok: false, reason: "governance proposal is missing a numeric number" };
    if (governanceByNumber.has(proposal.number)) return { ok: false, reason: `duplicate governance proposal #${proposal.number}` };
    governanceByNumber.set(proposal.number, proposal);
  }

  const eligibilityByNumber = new Map();
  for (const record of eligibilitySnapshot.proposals) {
    if (!Number.isInteger(record?.number)) return { ok: false, reason: "council history record is missing a numeric number" };
    if (eligibilityByNumber.has(record.number)) return { ok: false, reason: `duplicate council history proposal #${record.number}` };
    eligibilityByNumber.set(record.number, record);
  }

  if (governanceByNumber.size !== eligibilityByNumber.size) {
    return { ok: false, reason: `proposal count mismatch (${governanceByNumber.size} governance vs ${eligibilityByNumber.size} council history)` };
  }

  for (const [number, proposal] of governanceByNumber) {
    const record = eligibilityByNumber.get(number);
    if (!record) return { ok: false, reason: `council history is missing proposal #${number}` };
    if (record.proposalId !== proposal.id) return { ok: false, reason: `proposal #${number} ID mismatch` };
    if (record.createdAt !== proposal.createdAt) return { ok: false, reason: `proposal #${number} createdAt mismatch` };
  }

  for (const number of eligibilityByNumber.keys()) {
    if (!governanceByNumber.has(number)) return { ok: false, reason: `council history has an extra proposal #${number} not in governance` };
  }

  return { ok: true };
}
