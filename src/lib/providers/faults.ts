// ─────────────────────────────────────────────────────────────────────────────
// Error-injection layer.
//
// Every mock provider consults this config to optionally degrade its output in
// a deterministic, inspectable way. Faults are toggled from the Observability
// panel (or via INJECT_FAULTS env at boot). This lets the prototype demonstrate
// how the system behaves under realistic AI/pipeline failures.
// ─────────────────────────────────────────────────────────────────────────────

export type FaultId =
  | "ocr_digit_swap"
  | "missing_fields"
  | "incorrect_classification"
  | "overconfidence"
  | "missing_citations"
  | "hallucinated_citation"
  | "wrong_jurisdiction"
  | "delayed_response"
  | "provider_timeout"
  | "malformed_json"
  | "duplicate_event"
  | "out_of_order_event"
  | "stale_data"
  | "database_failure";

export interface FaultMeta {
  id: FaultId;
  label: string;
  layer: "document" | "understanding" | "retrieval" | "recommendation" | "workflow" | "infra";
  description: string;
}

export const FAULTS: FaultMeta[] = [
  { id: "ocr_digit_swap", label: "OCR digit swap", layer: "document", description: "Swaps two digits in extracted vehicle numbers, simulating an OCR error that produces a confident but wrong value." },
  { id: "missing_fields", label: "Missing fields", layer: "understanding", description: "Drops a required extracted field so the missing-information detector must catch it." },
  { id: "incorrect_classification", label: "Incorrect classification", layer: "understanding", description: "Forces the incident classifier to the second-most-likely category." },
  { id: "overconfidence", label: "Overconfidence", layer: "understanding", description: "Inflates confidence to >0.9 regardless of actual signal — stresses calibration." },
  { id: "missing_citations", label: "Missing citations", layer: "recommendation", description: "Strips source ids from action steps, which the source-grounding gate must reject." },
  { id: "hallucinated_citation", label: "Hallucinated citation", layer: "retrieval", description: "Injects a fabricated legal source id that does not exist in the corpus." },
  { id: "wrong_jurisdiction", label: "Wrong jurisdiction", layer: "retrieval", description: "Retrieves sources for the wrong state." },
  { id: "delayed_response", label: "Delayed response", layer: "infra", description: "Adds simulated latency to provider calls." },
  { id: "provider_timeout", label: "Provider timeout", layer: "infra", description: "Makes the provider throw a timeout error." },
  { id: "malformed_json", label: "Malformed JSON", layer: "infra", description: "Provider returns unparseable output; the workflow must handle it gracefully." },
  { id: "duplicate_event", label: "Duplicate event", layer: "workflow", description: "Emits a workflow event twice to test idempotency." },
  { id: "out_of_order_event", label: "Out-of-order event", layer: "workflow", description: "Delivers a workflow transition out of sequence; the state machine must reject it." },
  { id: "stale_data", label: "Stale data", layer: "infra", description: "Serves an outdated snapshot of the incident." },
  { id: "database_failure", label: "Database failure", layer: "infra", description: "Simulates a store write failure." },
];

export type FaultConfig = Set<FaultId>;

export function parseFaultsEnv(env: string | undefined): FaultConfig {
  const set = new Set<FaultId>();
  if (!env) return set;
  const valid = new Set(FAULTS.map((f) => f.id));
  for (const raw of env.split(",")) {
    const id = raw.trim() as FaultId;
    if (valid.has(id)) set.add(id);
  }
  return set;
}

export const NO_FAULTS: FaultConfig = new Set();
