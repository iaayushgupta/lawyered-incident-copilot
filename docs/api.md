# API Documentation

The prototype is primarily a **client-side interactive app** (all mutations happen in the in-memory Zustand store, so
the demo runs with zero backend). For inspection and integration, a set of **read-only JSON route handlers** expose
the seeded world and evaluation results server-side. In production these become the full read/write REST surface
backed by Postgres (see [system-design.md](system-design.md) §11).

Base URL (dev): `http://localhost:3000`

## Read-only endpoints (implemented)

| Method | Path | Description |
|---|---|---|
| GET | `/api/dataset` | Dataset statistics: total, adversarial count/%, tag counts, difficulty breakdown. |
| GET | `/api/incidents` | Incident summaries (id, case, vehicle, type, urgency, state, confidence, SLA, downtime). |
| GET | `/api/incidents/:id` | Full hydrated incident + workflow events + audit log + ground truth + per-case evaluation. |
| GET | `/api/evaluation` | Aggregate evaluation metrics. Add `?failures=1` to include the failing-case list. |
| GET | `/api/lawyers` | Mock lawyer directory (simulated success/quality scores). |

### Examples

```bash
curl -s localhost:3000/api/dataset | jq
curl -s localhost:3000/api/incidents | jq '.count'
curl -s localhost:3000/api/incidents/SIG-A-01 | jq '.evaluation.passed, .groundTruth'
curl -s "localhost:3000/api/evaluation?failures=1" | jq '.metrics.dangerousFailureCounts, (.failures|length)'
curl -s localhost:3000/api/lawyers | jq '.lawyers[0]'
```

## Internal "action API" (client store)

Mutations in the prototype are store actions (`src/lib/store.ts`), not HTTP endpoints. They are the exact operations a
production write-API would expose:

| Store action | Production endpoint (target) | Notes |
|---|---|---|
| `advance(id)` | `POST /incidents/:id/transition` | Validated by the state machine; rejects invalid transitions. |
| `lawyerDecision(id, decision, note, patch)` | `POST /incidents/:id/reviews` | approve/edit/reject/request-docs/reclassify/mark-unsupported/urgency-change. |
| `assignLawyer(id, lawyerId, manual)` | `POST /incidents/:id/assign` | Manual override flagged in audit. |
| `verifyField(id, docId, fieldKey)` | `POST /incidents/:id/documents/:docId/verify` | Explicit human validation; never automatic. |
| `resolveIncident(id, accepted, note)` | `POST /incidents/:id/resolution` | Captures outcome for evaluation. |
| `toggleFault(faultId)` | `POST /observability/faults` | Error-injection toggles (admin/legal-ops). |

Every mutation appends to the **append-only hash-chained audit log**; there is deliberately no delete endpoint.

## Provider interfaces (integration points)

Real providers plug in behind these (`src/lib/providers/interfaces.ts`):

```ts
IncidentUnderstandingProvider.analyse(input): Promise<IncidentUnderstanding>
DocumentExtractionProvider.extract(doc, incidentId): Promise<IncidentDocument>
LegalRetrievalProvider.retrieve(query): Promise<LegalSource[]>
RecommendationProvider.generate(context): Promise<ActionPlan>
```

Selection is via `.env` (`UNDERSTANDING_PROVIDER`, `DOCUMENT_PROVIDER`, `RETRIEVAL_PROVIDER`,
`RECOMMENDATION_PROVIDER` = `mock` | `real`). See [.env.example](../.env.example).
```
