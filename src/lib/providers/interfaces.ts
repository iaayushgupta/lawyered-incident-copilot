import type {
  ActionPlan,
  CaseContext,
  IncidentDocument,
  IncidentInput,
  IncidentUnderstanding,
  LegalQuery,
  LegalSource,
  SyntheticDocument,
} from "../types";

// ── Provider interfaces ──
// Real providers can be plugged in behind these interfaces (see .env.example).
// The prototype ships deterministic mock implementations in ./mock.

export interface IncidentUnderstandingProvider {
  readonly version: string;
  analyse(input: IncidentInput): Promise<IncidentUnderstanding>;
}

export interface DocumentExtractionProvider {
  readonly version: string;
  extract(document: SyntheticDocument, incidentId: string): Promise<IncidentDocument>;
}

export interface LegalRetrievalProvider {
  readonly version: string;
  retrieve(query: LegalQuery): Promise<LegalSource[]>;
}

export interface RecommendationProvider {
  readonly version: string;
  generate(context: CaseContext): Promise<ActionPlan>;
}

export class ProviderTimeoutError extends Error {
  constructor(provider: string) {
    super(`${provider} timed out`);
    this.name = "ProviderTimeoutError";
  }
}

export class ProviderMalformedOutputError extends Error {
  constructor(provider: string) {
    super(`${provider} returned malformed output`);
    this.name = "ProviderMalformedOutputError";
  }
}
