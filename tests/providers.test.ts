import { describe, it, expect } from "vitest";
import { MockUnderstandingProvider, MockDocumentProvider, MockRetrievalProvider, MockRecommendationProvider } from "@/lib/providers/mock";
import { ProviderTimeoutError } from "@/lib/providers/interfaces";
import { getSyntheticById, SYNTHETIC_INCIDENTS } from "@/lib/data/incidents";
import { LEGAL_SOURCES } from "@/lib/data/sources";
import { hydrateIncident } from "@/lib/data/hydrate";
import { runTriage } from "@/lib/workflow/triage";
import { hydrateUnderstanding, hydrateDocuments } from "@/lib/data/hydrate";

const data = {
  getSynthetic: getSyntheticById,
  sources: LEGAL_SOURCES,
};

describe("mock providers + error injection", () => {
  it("understanding provider preserves original input separately (never overwrites raw)", async () => {
    const s = getSyntheticById("SIG-A-01")!;
    const p = new MockUnderstandingProvider(data);
    const u = await p.analyse({ channel: s.channel, rawInput: s.rawInput, originalLanguage: s.originalLanguage, syntheticId: s.id });
    // translated text is a derived artifact, distinct from the raw input
    expect(u.translatedText).not.toBe(s.rawInput);
    expect(u.fields.every((f) => f.provenance === "extracted_fields")).toBe(true);
    expect(u.fields.every((f) => f.reviewStatus === "unreviewed")).toBe(true);
  });

  it("ocr_digit_swap fault corrupts vehicle number but stays confident", async () => {
    const s = SYNTHETIC_INCIDENTS.find((x) => x.documents.some((d) => d.fields.vehicle_number))!;
    const doc = s.documents.find((d) => d.fields.vehicle_number)!;
    const clean = new MockDocumentProvider(new Set());
    const faulty = new MockDocumentProvider(new Set(["ocr_digit_swap"]));
    const cleanDoc = await clean.extract(sd(doc), s.id);
    const faultyDoc = await faulty.extract(sd(doc), s.id);
    const cleanVN = cleanDoc.extractedFields.find((f) => f.key === "vehicle_number")?.value;
    const faultyVN = faultyDoc.extractedFields.find((f) => f.key === "vehicle_number")?.value;
    expect(faultyVN).not.toBe(cleanVN);
    // confident-but-wrong
    expect(faultyDoc.extractedFields.find((f) => f.key === "vehicle_number")?.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("provider_timeout fault throws a timeout error", async () => {
    const s = getSyntheticById("SIG-A-01")!;
    const p = new MockUnderstandingProvider(data, new Set(["provider_timeout"]));
    await expect(p.analyse({ channel: s.channel, rawInput: s.rawInput, originalLanguage: s.originalLanguage, syntheticId: s.id })).rejects.toBeInstanceOf(ProviderTimeoutError);
  });

  it("hallucinated_citation injects a fabricated source flagged isFabricated", async () => {
    const p = new MockRetrievalProvider(data, new Set(["hallucinated_citation"]));
    const results = await p.retrieve({ incidentType: "permit_issue", jurisdiction: "Rajasthan", keywords: [] });
    expect(results.some((r) => r.isFabricated)).toBe(true);
  });

  it("recommendation provider always requires human approval and abstains when told", async () => {
    const abstainCase = SYNTHETIC_INCIDENTS.find((x) => x.simulatedSystemOutput.shouldAbstain)!;
    const { incident } = hydrateIncident(abstainCase);
    const p = new MockRecommendationProvider(data);
    const plan = await p.generate({ incident, documents: incident.documents, sources: LEGAL_SOURCES });
    expect(plan.requiresHumanApproval).toBe(true);
    expect(plan.abstained).toBe(true);
    expect(plan.steps.length).toBe(0);
  });

  it("missing_citations fault yields unsupported steps (no silent grounding)", async () => {
    const normal = SYNTHETIC_INCIDENTS.find((x) => !x.simulatedSystemOutput.shouldAbstain && x.simulatedSystemOutput.sourceIds.length > 0)!;
    const { incident } = hydrateIncident(normal);
    const p = new MockRecommendationProvider(data, new Set(["missing_citations"]));
    const plan = await p.generate({ incident, documents: incident.documents, sources: [] });
    expect(plan.sourceIds.length).toBe(0);
    expect(plan.steps.every((st) => st.markedUnsupported)).toBe(true);
  });
});

// helper: rebuild a SyntheticDocument-shaped object from a doc spec
function sd(d: (typeof SYNTHETIC_INCIDENTS)[number]["documents"][number]) {
  return {
    id: d.id,
    filename: d.filename,
    claimedType: d.claimedType,
    actualType: d.actualType,
    groundTruthFields: d.fields,
    groundTruthFindings: d.findings,
    requiresHumanValidation: d.requiresHumanValidation,
    originalPreview: d.originalPreview,
    embeddedInstruction: d.embeddedInstruction,
  };
}

// keep imports used
void runTriage; void hydrateUnderstanding; void hydrateDocuments;
