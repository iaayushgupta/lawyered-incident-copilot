import { describe, it, expect } from "vitest";
import { evaluateAll } from "@/lib/evaluation/metrics";
import { evaluateCase } from "@/lib/evaluation/engine";
import { getSyntheticById } from "@/lib/data/incidents";
import { datasetStats, SYNTHETIC_INCIDENTS } from "@/lib/data/incidents";

describe("dataset", () => {
  it("has at least 100 incidents", () => {
    expect(SYNTHETIC_INCIDENTS.length).toBeGreaterThanOrEqual(100);
  });
  it("has at least 40% adversarial/negative cases", () => {
    expect(datasetStats().adversarialPct).toBeGreaterThanOrEqual(40);
  });
  it("has unique incident ids", () => {
    const ids = new Set(SYNTHETIC_INCIDENTS.map((s) => s.id));
    expect(ids.size).toBe(SYNTHETIC_INCIDENTS.length);
  });
});

describe("evaluation engine", () => {
  it("marks a correct case as passed", () => {
    const s = getSyntheticById("SIG-A-01")!;
    const c = evaluateCase(s);
    // SIG-A-01 is a correctly-handled contradictory case
    expect(c.classificationCorrect).toBe(true);
  });

  it("detects a fabricated source as a dangerous failure", () => {
    const s = getSyntheticById("SIG-B-23")!;
    const c = evaluateCase(s);
    expect(c.fabricatedSource).toBe(true);
    expect(c.dangerousFailures).toContain("fabricated_source");
    expect(c.passed).toBe(false);
  });

  it("flags a missed critical escalation", () => {
    const s = getSyntheticById("SIG-C-01")!;
    const c = evaluateCase(s);
    expect(c.escalationExpected).toBe(true);
    expect(c.escalationPredicted).toBe(false);
    expect(c.dangerousFailures).toContain("failed_critical_escalation");
  });

  it("flags a missed suspected fraud", () => {
    const s = getSyntheticById("SIG-C-05")!;
    const c = evaluateCase(s);
    expect(c.dangerousFailures).toContain("missed_suspected_fraud");
  });

  it("flags an unsupported recommendation (no source)", () => {
    const s = getSyntheticById("SIG-C-02")!;
    const c = evaluateCase(s);
    expect(c.unsupportedClaim).toBe(true);
    expect(c.dangerousFailures).toContain("unsupported_legal_recommendation");
  });

  it("computes coherent aggregate metrics", () => {
    const { metrics } = evaluateAll();
    expect(metrics.total).toBe(SYNTHETIC_INCIDENTS.length);
    expect(metrics.classificationAccuracy).toBeGreaterThan(0.8);
    expect(metrics.fraud.recall).toBeGreaterThan(0.5);
    expect(metrics.calibrationError).toBeGreaterThanOrEqual(0);
    expect(metrics.calibrationError).toBeLessThan(1);
    // every dangerous failure type except audit_log_gap should have an example
    expect(metrics.dangerousFailureCounts.failed_critical_escalation).toBeGreaterThan(0);
    expect(metrics.dangerousFailureCounts.fabricated_source).toBeGreaterThan(0);
    expect(metrics.dangerousFailureCounts.missed_suspected_fraud).toBeGreaterThan(0);
  });

  it("calibration buckets partition all cases", () => {
    const { cases, metrics } = evaluateAll();
    const sum = metrics.calibration.reduce((a, b) => a + b.count, 0);
    expect(sum).toBe(cases.length);
  });
});
