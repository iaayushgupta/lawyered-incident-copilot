# Evaluation Framework

_Lawyered — AI Legal Incident Copilot (human-supervised legal-ops copilot, synthetic data)_

This document describes how the evaluation engine measures the quality and safety of the
Lawyered copilot. It is grounded in the implementation at:

- `src/lib/evaluation/engine.ts` — per-case evaluation, dangerous-failure flags, failure analysis, routing proxy
- `src/lib/evaluation/metrics.ts` — aggregate metrics, precision/recall, calibration, slices
- `src/lib/synthetic/schema.ts` — the ground-truth + system-output shape each case carries

The evaluation dashboard renders at `/evaluation`; the per-case failure explorer at `/evaluation/failures`.

---

## 1. Philosophy

The evaluation harness answers one question: **does the system's output match explicit ground
truth?** It does not attempt to judge the system against itself, against an LLM grader, or against
plausibility. Every synthetic case carries two independent objects:

| Object | Field | Role |
| --- | --- | --- |
| Ground truth | `expected` | What a correct, human-supervised outcome should be. Hand-authored per case. |
| System output | `simulatedSystemOutput` | Exactly what the deterministic pipeline produces for that case. Baked into the dataset so evaluation is self-contained. |

Three principles follow from this split:

1. **Evaluate against explicit ground truth, not self-consistency.** `evaluateCase` compares each
   `simulatedSystemOutput` field to the corresponding `expected` field. The baked output equals what
   the live deterministic providers would produce, so the dataset can be scored offline without
   running the workflow — and the live workflow can be scored the same way when it regenerates output.

2. **The system's baked output may be _deliberately wrong_.** Many cases (especially `adversarial`
   and `hard` difficulties) encode a system that misclassifies, misses a contradiction, fails to
   escalate, or cites a fabricated source. These are intentional. `evaluation.expectedFailureModes`
   names the modelled defect(s) for each such case.

3. **Deliberate-failure cases stay visible; the engine never "corrects" the system's gates.** The
   engine reads whatever the system emitted (`shouldAbstain`, `requiresHumanEscalation`,
   `suspectedFraud`, `sourceIds`, …) and scores it as-is. It does not silently patch a missing
   escalation or suppress a fabricated citation before scoring. A modelled failure therefore shows up
   as a real miss in the metrics and in the failure explorer — which is the point: the harness has to
   be able to _catch_ the system being wrong, so we can prove the guardrails and metrics work.

---

## 2. Metric catalogue

All aggregate metrics are computed by `evaluateAll(incidents)` in `metrics.ts`, which maps every
incident through `evaluateCase` and then reduces the per-case results. Two helpers underpin most of
them:

- `acc(flags[])` — mean of a boolean array (`filter(Boolean).length / length`); returns `1` for an
  empty array.
- `pr(pred[], truth[])` — standard confusion matrix over two aligned boolean arrays:

  ```
  TP: pred & truth      FP: pred & !truth
  FN: !pred & truth     TN: !pred & !truth

  precision = TP / (TP + FP)      (defined as 1 when TP+FP = 0)
  recall    = TP / (TP + FN)      (defined as 1 when TP+FN = 0)
  f1        = 2·P·R / (P + R)     (defined as 0 when P+R = 0)
  ```

> **Note on illustrative numbers.** All figures below are approximate and **recompute from ground
> truth** on every run — they are not stored. They characterise the current corpus (~109 cases), not
> a fixed target.

### 2.1 Accuracy

| Metric | Definition | Computation | Why it matters |
| --- | --- | --- | --- |
| `classificationAccuracy` | Fraction of cases where `system.incidentType == expected.incidentType`. | `acc(classificationCorrect)` | Triage sends the case down the right legal track; a wrong category propagates everywhere. |
| `urgencyAccuracy` | Fraction where `system.urgency == expected.urgency`. | `acc(urgencyCorrect)` | Urgency drives escalation and SLA; wrong urgency delays critical cases or floods the queue. |

Illustrative: classification ~94%, urgency ~98%.

### 2.2 Detection (precision / recall)

Two detectors are treated as **binary**: a case "has a contradiction" iff its contradiction list is
non-empty, and "suspects fraud" iff the fraud flag is set.

| Metric | Predicted | Truth | Why it matters |
| --- | --- | --- | --- |
| `fraud` (P/R/F1) | `system.suspectedFraud` | `expected.suspectedFraud` | Missing fraud lets a bad claim through; over-flagging burns analyst time. |
| `contradiction` (P/R/F1) | `system.contradictions.length > 0` | `expected.contradictions.length > 0` | Cross-document/cross-field conflicts (vehicle number, owner, dates) are the main integrity signal. |

Illustrative: fraud P/R ~1.0 / ~1.0; contradiction P/R ~1.0 / ~0.9 (a few missed contradictions).

Two roll-ups summarise both detectors together:

- `falsePositiveRate = (contradiction.fp + fraud.fp) / (all negatives across both detectors)`
- `falseNegativeRate = (contradiction.fn + fraud.fn) / (all positives across both detectors)`

where negatives = `fp + tn` and positives = `tp + fn`, summed across the two detectors. These give a
single "how noisy" and "how leaky" number spanning the safety-relevant detectors.

### 2.3 Safety: abstention & escalation

| Metric | Definition | Computation | Why it matters |
| --- | --- | --- | --- |
| `abstentionCorrectness` | Fraction where `system.shouldAbstain == expected.shouldAbstain`. | `acc(abstentionExpected == abstentionPredicted)` | The copilot must decline when evidence is insufficient — abstaining too little is unsafe, too much is useless. |
| `escalationRecall` | Of cases that _should_ escalate, fraction where the system did. | `acc(escalationPredicted)` over `escalationExpected` cases only | A human-supervised system must hand critical cases to a person; a missed escalation is a safety event. |
| `missingInfoDetection` | Of cases expected to need more documents, fraction where the system detected the gap. | `acc(missingInfoDetected)` over `missingInfoExpected` cases | Requesting the right missing document is how the copilot avoids acting on incomplete evidence. |

`missingInfoExpected` is true when `expected.requiredDocuments` is non-empty or the case is tagged
`incomplete`. `missingInfoDetected` (surfaced as `missingActuallyDetected`) is true unless the case's
`expectedFailureModes` includes `missing_document_request` — i.e. the system is credited with detection
except where a failure mode explicitly models it failing to ask.

### 2.4 Grounding

Guards against the system giving legal recommendations that are unsupported or cite non-existent law.

| Metric | Definition | Why it matters |
| --- | --- | --- |
| `sourceGroundingRate` | Over **non-abstaining** cases, fraction that are `sourceGrounded`. | Every surfaced recommendation should trace to a real legal source. |
| `unsupportedClaimRate` | Fraction of all cases flagged `unsupportedClaim`. | Measures how often the system recommends action with no citation (or one that contradicts its source). |
| `fabricatedSourceRate` | Fraction of all cases citing a source id not in the corpus. | A fabricated citation is a hard safety failure — it looks authoritative but is invented. |

Per-case grounding logic (`engine.ts`):

- `fabricatedSource` — any `sys.sourceIds` id not present in `LEGAL_SOURCES` (`SOURCE_IDS`).
- `unsupportedClaim` — the system did **not** abstain, recommended at least one action, and cited **no**
  source; **or** the case models `recommendation_contradicts_source`.
- `sourceGrounded` — abstaining cases are trivially grounded (`true`); otherwise requires at least one
  cited source, no fabricated source, and no source-contradiction.

Illustrative: source-grounding ~96%.

### 2.5 Calibration

| Metric | Definition |
| --- | --- |
| `averageConfidence` | Mean of `system.confidence` across all cases. |
| `calibrationError` (ECE) | Expected Calibration Error over 5 confidence buckets (see §3). |
| `calibration[]` | Per-bucket rows: `{ bucket, count, avgConfidence, accuracy, gap }`. |

Illustrative: ECE ~0.11.

### 2.6 Routing

Routing is scored by a **proxy** (`evaluateRouting`, §6-adjacent): rank all `LAWYERS` by the
deterministic routing score for the case, then check whether an _appropriate_ lawyer (one whose
`supportedIncidentTypes` includes the incident type **and** whose `jurisdictions` cover the case
jurisdiction, or "All India") lands at rank #1 / within the top 3.

| Metric | Definition |
| --- | --- |
| `routingTop1` | Fraction of cases whose #1-ranked lawyer is appropriate. |
| `routingTop3` | Fraction with an appropriate lawyer in the top 3. |

Abstaining cases defer routing to a human and are counted **correct** (`{top1:true, top3:true}`).
Illustrative: top-1 ~83%, top-3 ~84%.

### 2.7 Operational

These are deliberately **simulated / heuristic** (see §8).

| Metric | Definition | How derived |
| --- | --- | --- |
| `recommendationAcceptanceRate` | Fraction of cases whose recommendation a lawyer would accept unchanged. | `acc(passed)` — a passing case is "accepted". |
| `lawyerCorrectionRate` | Complement of acceptance. | `1 − recommendationAcceptanceRate`. |
| `fieldExtractionReliability` | Fraction of documents with no quality/integrity-degrading findings. | `cleanDocs / totalDocs`; a doc is degraded if it has any of `low_quality_image`, `vehicle_number_mismatch`, `altered_content`, `cropped_content`, `incorrect_ocr`. |
| `timeSavedMinutes` | Coordination time saved by auto-triage. | `(# non-abstaining cases) × 22` minutes. |
| `avgTimeToEscalationMin` | Simulated median first-escalation latency. | `4` if any escalation case exists, else `0`. |

---

## 3. Confidence calibration

Calibration asks: **when the system says it is X% confident, is it right X% of the time?**

### Buckets

Each case's `system.confidence` is mapped to one of five buckets by `bucketFor` (`src/lib/utils.ts`):

`very_low`, `low`, `medium`, `high`, `very_high`.

For each bucket `metrics.ts` records:

- `count` — cases in the bucket
- `avgConfidence` — mean stated confidence in the bucket
- `accuracy` — fraction of the bucket that is `correctOverall` (see §5 for what "correct overall" means)
- `gap` — `|avgConfidence − accuracy|`

### ECE formula

Expected Calibration Error is the count-weighted average gap across buckets:

```
ECE = Σ_buckets  (count_bucket / N) · | avgConfidence_bucket − accuracy_bucket |
```

where `N` is the total number of cases. A perfectly calibrated system has `ECE = 0`: in every bucket
the stated confidence equals realised accuracy.

### Reading the calibration chart

Plot `avgConfidence` (x) against `accuracy` (y) per bucket; the diagonal `y = x` is perfect
calibration.

- **Point below the diagonal** (accuracy < confidence) → **over-confident** in that bucket. Most
  dangerous in `high` / `very_high`: the system asserts and is wrong. Watch the `overconfident_wrong`
  tag.
- **Point above the diagonal** (accuracy > confidence) → **under-confident**. Safer but wasteful —
  the system may abstain or escalate when it did not need to.
- The vertical distance of each point from the diagonal is the bucket `gap`; ECE is those gaps
  weighted by how many cases fall in each bucket.

---

## 4. Dangerous-failure taxonomy

Some failures are categorically worse than an accuracy miss: they can cause legal or safety harm even
if aggregate accuracy looks healthy. The engine flags six such types in `DangerousFailureType`, tracks
them per case in `dangerousFailures[]`, and totals them in `dangerousFailureCounts`. **They are
surfaced separately from — and do not net against — the aggregate accuracy metrics.** A case can be
"classified correctly" yet still carry a dangerous failure.

| Type | Label | Detection (per case) |
| --- | --- | --- |
| `failed_critical_escalation` | Failed critical escalation | `expected.requiresHumanEscalation && expected.urgency == "critical" && !system.requiresHumanEscalation` |
| `unsupported_legal_recommendation` | Unsupported legal recommendation | `unsupportedClaim` is true (recommended action with no valid supporting source, or a source-contradicting recommendation) |
| `fabricated_source` | Fabricated source | `system.sourceIds` contains an id not in the legal corpus |
| `incorrect_verified_status` | Incorrect verified status | case models `marked_verified_without_validation` in `expectedFailureModes` |
| `missed_suspected_fraud` | Missed suspected fraud | `expected.suspectedFraud && !system.suspectedFraud` |
| `audit_log_gap` | Audit-log gap | **System-level integrity check**, not per-case — see below |

### Why flagged independently

Aggregate accuracy averages away rare-but-catastrophic events. If 1 case in 109 fails to escalate a
critical incident, classification accuracy barely moves — but that single case is the one that matters
most for a human-supervised legal-ops product. Counting dangerous failures on their own axis keeps them
from being diluted, and lets the dashboard hold them to a **zero-tolerance** bar independent of the
percentage metrics.

### `audit_log_gap` is special

Unlike the other five, `audit_log_gap` is **not** derived per synthetic case. It is a system-level
integrity check surfaced in the **Observability panel** — it verifies that the running system's audit
trail has no gaps. It is present in the taxonomy and in `dangerousFailureCounts` (initialised to `0`)
so the dashboard can display it alongside the case-derived dangerous failures, but `evaluateCase` never
pushes it.

---

## 5. Per-case failure analysis

Every case produces a `CaseEvaluation`. The failure explorer (`/evaluation/failures`) uses these
fields to show a side-by-side and a diagnosis.

### Core comparison fields

Booleans comparing system vs. expected: `classificationCorrect`, `urgencyCorrect`,
`fraudExpected`/`fraudPredicted`, `contradictionExpected`/`contradictionPredicted`,
`escalationExpected`/`escalationPredicted`, `abstentionExpected`/`abstentionPredicted`,
`missingInfoExpected`/`missingInfoDetected`; grounding flags `sourceGrounded`, `fabricatedSource`,
`unsupportedClaim`; plus `confidence`, `dangerousFailures[]`, and full `expected` / `system` snapshots
for the side-by-side view.

### `correctOverall` vs `passed`

```
coreChecks = [
  classificationCorrect,
  urgencyCorrect,
  fraudExpected     == fraudPredicted,
  contradictionExpected == contradictionPredicted,
  escalationExpected    == escalationPredicted,
  abstentionExpected    == abstentionPredicted,
]

correctOverall = all(coreChecks) && !fabricatedSource && !unsupportedClaim
passed         = correctOverall && dangerousFailures.length == 0
```

So `passed` is the strict bar shown as the top-line pass rate: every core check right, grounded, **and**
zero dangerous failures. Illustrative: of ~109 cases, ~95 pass (~87%).

### Diagnosis fields (populated only when `!passed`)

| Field | How derived |
| --- | --- |
| `failureType` | First matching branch: `Recommendation contradicts source` → (else) first dangerous-failure label → `Misclassification` → `Urgency error` → `Missed`/`False contradiction` → `Should have abstained`/`Unnecessary abstention` → `Fraud-detection error` → `Other`. |
| `likelyReason` | If the case declares `expectedFailureModes`, lists them verbatim (`Modelled failure mode(s): …`); otherwise a canned reason from `deriveReason(failureType)`. |
| `affectedComponent` | `componentFor(failureType)` — maps each failure type to the pipeline stage responsible. |
| `recommendedImprovement` | `improvementFor(failureType)` — maps each failure type to a concrete guardrail/fix. |

**Failure-type → component → improvement** (from the lookup tables in `engine.ts`):

| Failure type | Affected component | Recommended improvement |
| --- | --- | --- |
| Misclassification | Triage / classifier | Add disambiguation prompts; require ≥2 corroborating signals before a confident label. |
| Urgency error | Triage / urgency scorer | Recalibrate against safety + downtime priors; floor for accident/police cases. |
| Missed contradiction | Contradiction detector | Hard cross-document field diffing (vehicle number, owner, dates). |
| False contradiction | Contradiction detector | Tolerance-tune the comparator; treat format variants as equal. |
| Should have abstained | Confidence gate | Raise abstention threshold when required documents are missing. |
| Unnecessary abstention | Confidence gate | Lower abstention threshold when a full evidence set is present. |
| Fraud-detection error | Fraud signal aggregator | Weight document-integrity findings more heavily. |
| Failed critical escalation | Escalation gate | Hard-gate: any critical urgency / safety signal forces escalation. |
| Unsupported legal recommendation | Source-grounding gate | Block plan generation unless every step links a valid source. |
| Fabricated source | Legal retrieval | Validate every citation id against the corpus before surfacing. |
| Incorrect verified status | Verification-status control | Never promote extracted fields to verified without human validation. |
| Missed suspected fraud | Fraud signal aggregator | Route any integrity finding to a fraud-review queue. |

The value of this mapping is that a failure is never just "wrong" — the explorer names the responsible
component and the specific guardrail that would prevent a repeat, so failures translate directly into a
work item.

---

## 6. Slices — finding weak segments

`sliceBy(cases, key)` partitions the per-case results by a dimension and reports, per group:

- `count` — cases in the group
- `passRate` — fraction that `passed`
- `classificationAccuracy` — fraction with `classificationCorrect`

Rows are sorted by descending `count`. Supported `SliceKey`s:

| Slice | Grouped by |
| --- | --- |
| `incidentCategory` | `expected.incidentType` |
| `language` | `originalLanguage` |
| `jurisdiction` | case jurisdiction |
| `documentQuality` | `clean` vs `degraded` (any doc with an integrity/quality finding) |
| `channel` | intake channel |
| `fraudStatus` | `fraud` vs `non-fraud` |
| `ambiguityLevel` | `low` / `medium` / `high` (derived from tags) |
| `vehicleType` | derived from reported vehicle registration |
| `confidenceBucket` | the five calibration buckets |

**How to use them.** Aggregate numbers hide segment weakness. Slice by each dimension and scan for the
group whose `passRate` or `classificationAccuracy` sits well below the corpus mean, weighting by `count`
so you don't chase a 1-case group. Typical findings this exposes: `degraded` document quality dragging
grounding, a non-English `language` slice with lower classification accuracy, or a `high` ambiguity
slice with more abstention errors. The slice then points you at both the segment and — via the failure
explorer's component mapping — the pipeline stage to fix.

---

## 7. Running & reproducing

| Surface | How |
| --- | --- |
| **Evaluation dashboard** | Visit `/evaluation` — aggregate metrics, calibration chart, dangerous-failure counts, slice tables, observability panel. |
| **Failure explorer** | Visit `/evaluation/failures` — per-case side-by-side (`expected` vs `system`) with failure type, likely reason, affected component, recommended improvement. |
| **Headless dataset check** | `npx tsx scripts/verify-dataset.ts` — recomputes metrics from ground truth without the UI. |
| **Test suite** | `tests/evaluation.test.ts` — asserts engine/metric behaviour. |

Because every metric recomputes from `expected` on each run, there is no cached score to invalidate:
editing a case's ground truth or the deterministic providers immediately changes the numbers on the next
`evaluateAll`.

---

## 8. Limitations

The framework is a rigorous _harness_ over a _synthetic_ dataset. Read the numbers with these caveats:

1. **Simulated / heuristic operational metrics.** `timeSavedMinutes` is a flat 22 min/case;
   `avgTimeToEscalationMin` is a constant (`4` when any escalation exists); `recommendationAcceptanceRate`
   and `lawyerCorrectionRate` are derived purely from whether a case `passed`, not from real lawyer
   behaviour. Treat these as directional illustrations, not measured outcomes.

2. **Routing is a proxy.** `evaluateRouting` scores against the deterministic routing function and a
   coarse "appropriate lawyer" test (supported incident type + jurisdiction coverage). It does not model
   lawyer availability, workload, quality, or client preference, and abstaining cases are auto-credited.

3. **Single deterministic run.** The baked `simulatedSystemOutput` is one fixed snapshot. There is no
   sampling variance, no temperature, no repeated trials — so confidence intervals and run-to-run
   stability are out of scope.

4. **No human-label noise.** Ground truth is authored and treated as perfect. Real annotation
   disagreement, edge-case ambiguity, and label drift are not represented, so metrics are cleaner than a
   production evaluation would be.

5. **Small corpus.** ~109 cases. Precision/recall and especially per-bucket calibration and small slices
   are sensitive to a handful of cases; a single case can swing a slice's `passRate` by several points.
   Numbers are illustrative and recompute-able, not statistically tight estimates.

6. **`vehicleType` is a stub.** The current derivation maps any present registration to `commercial`, so
   the `vehicleType` slice is not yet a meaningful segmentation.
