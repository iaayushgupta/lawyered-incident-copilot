# Implementation Plan — AI Legal Incident Copilot

A concise, honest plan mapping the Figma reference to the built prototype, with decisions and status.

## Figma reference → implementation

The Figma file (`AI Incident Copilot Prototype`) has 6 frames. Each maps to implemented screens:

| Figma frame | Implemented as | Notes |
|---|---|---|
| 00 — Product Thesis | Summarised in README + product framing | Not a runtime screen |
| 01 — Fleet Operations Dashboard | `/` Command Center | Accent-bar stat cards, priority queue, secondary stat row, full list on `/incidents` |
| 02 — Incident Intake & AI Triage | `/incidents/[id]` → **Intake & Triage** tab | Driver conversation (original preserved), AI transcript/translation, extracted fields + per-field confidence, triage panel |
| 03 — Evidence + Grounded Action Plan | Detail → **Documents**, **Evidence**, **Action Plan** tabs | Side-by-side original vs extracted, findings, DRAFT·NOT LEGAL ADVICE, sources per step, approval gate |
| 04 — Lawyer Handoff & Resolution | Detail → **Lawyer Handoff**, **Resolution** tabs | Auto brief, transparent routing score, resolution + timeline |
| 05 — System Design Overview | `docs/system-design.md` (Mermaid) | Full architecture doc |

Design language reproduced from the Figma: dark navy sidebar (`LAWYERED` / `AI LEGAL OPS`), light canvas, white
cards with colored left accent bars, severity pills (CRITICAL/HIGH/MEDIUM), teal/blue accents, confidence pills.
Usability improvements added: role switcher, richer filtering, evaluation + failure explorer, demo mode, audit &
observability, and explicit provenance/uncertainty everywhere.

## Architecture decisions

1. **Next.js 15 App Router + TypeScript + Tailwind 3**, Lucide icons, Recharts for the calibration chart.
2. **Client Zustand store** hydrates the whole synthetic world in-memory (`src/lib/store.ts`). Rationale: zero-setup,
   fully interactive, deterministic, no DB/network. The store boundary is the Prisma+Postgres swap point.
3. **Deterministic mock providers behind interfaces** (`src/lib/providers/`) with a 14-fault error-injection layer.
   The dataset's `simulatedSystemOutput` is authoritative for "what the AI produced" (sometimes deliberately wrong),
   letting evaluation expose genuine gaps.
4. **Safety-first gates**: high-risk actions always require lawyer approval; the system can abstain; low-confidence
   extraction is never silently promoted to verified; originals are preserved separately from AI derivations.

## Build phases (as executed)

- **Phase 1 — Foundation:** domain types, RBAC, PII, utils, providers + faults, state machine, triage, routing, audit.
- **Phase 2 — Data:** master data (fleets/vehicles/drivers/lawyers/users), 18 synthetic legal sources, 109 synthetic
  incidents (46 hand-authored signatures + 58 generated + 5 dangerous-failure guarantees), world hydration.
- **Phase 3 — Evaluation:** per-case engine + aggregate metrics + calibration + slices + dangerous-failure flags.
- **Phase 4 — UI shell + core screens:** sidebar, role switcher, toasts; dashboard, incident list, incident detail
  with 7 workflow tabs.
- **Phase 5 — Secondary screens:** lawyer network + routing simulator, evaluation dashboard, failure explorer, demo
  mode, audit & observability.
- **Phase 6 — Tests + docs + verification:** Vitest unit/integration tests, Playwright E2E config, docs, README,
  `.env.example`; lint/typecheck/tests run; UI verified against Figma.

## What is real vs simulated

- **Real logic:** state machine + transition validation, triage gating, contradiction/fraud surfacing, routing score,
  audit hash-chaining + integrity check, RBAC + tenant isolation, PII masking, evaluation metrics + calibration,
  fault injection, provenance separation.
- **Simulated (deterministic mocks):** language detection, translation, OCR/extraction, legal retrieval, and the
  recommendation text — all behind swappable interfaces. Provider latency/error rates in Observability are illustrative.
- **Ground-truth-driven:** each synthetic case carries explicit `expected` outcomes; evaluation compares system output
  to those.

## Verification

- `npm run typecheck` — clean.
- `npm test` — Vitest unit + integration suites (state machine, triage, providers/faults, evaluation, dataset invariants).
- `npx tsx scripts/verify-dataset.ts` — dataset size (≥100), adversarial share (≥40%), grounding, and headline metrics.
- `npm run test:e2e` — Playwright flow (requires `npx playwright install` for browsers).
- Manual UI pass against the Figma frames.
