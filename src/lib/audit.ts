// ─────────────────────────────────────────────────────────────────────────────
// Append-only audit log with hash chaining.
//
// Each entry hashes its own content + the previous entry's hash, so any gap or
// tamper is detectable (see verifyChain). The store exposes an append-only API;
// there is deliberately no delete — a "request to delete audit history" is a
// modelled adversarial case that the system refuses.
// ─────────────────────────────────────────────────────────────────────────────

import type { AuditEntry, Role } from "./types";
import { fnv1a } from "./utils";

export const GENESIS_HASH = "genesis";

export interface AuditInput {
  incidentId: string;
  actor: string;
  actorRole: Role;
  action: string;
  before?: unknown;
  after?: unknown;
  source?: string;
  reason?: string;
  providerVersion?: string;
  confidence?: number;
}

let counter = 0;
export function nextRequestId(): string {
  counter += 1;
  return `req-${counter.toString(36).padStart(5, "0")}`;
}

export function hashEntry(entry: Omit<AuditEntry, "hash">): string {
  const payload = JSON.stringify({
    at: entry.at,
    incidentId: entry.incidentId,
    actor: entry.actor,
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
    requestId: entry.requestId,
    prevHash: entry.prevHash,
  });
  return fnv1a(payload) + fnv1a("chain:" + payload);
}

export function appendAudit(log: AuditEntry[], input: AuditInput, at: string, requestId?: string): AuditEntry {
  const prevHash = log.length ? log[log.length - 1].hash : GENESIS_HASH;
  const base: Omit<AuditEntry, "hash"> = {
    id: `audit-${log.length + 1}`,
    at,
    incidentId: input.incidentId,
    actor: input.actor,
    actorRole: input.actorRole,
    action: input.action,
    before: input.before,
    after: input.after,
    source: input.source,
    reason: input.reason,
    providerVersion: input.providerVersion,
    confidence: input.confidence,
    requestId: requestId ?? nextRequestId(),
    prevHash,
  };
  const entry: AuditEntry = { ...base, hash: hashEntry(base) };
  log.push(entry);
  return entry;
}

export interface ChainIssue {
  index: number;
  entryId: string;
  problem: "hash_mismatch" | "broken_link";
}

// Verify integrity of the append-only chain. Returns any detected issues.
export function verifyChain(log: AuditEntry[]): ChainIssue[] {
  const issues: ChainIssue[] = [];
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e.prevHash !== prevHash) issues.push({ index: i, entryId: e.id, problem: "broken_link" });
    const expected = hashEntry({ ...e });
    if (expected !== e.hash) issues.push({ index: i, entryId: e.id, problem: "hash_mismatch" });
    prevHash = e.hash;
  }
  return issues;
}
