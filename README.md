# Lawyered — AI Legal Incident Copilot (Prototype)

A production-style **prototype** of a human-supervised legal-operations copilot for **mobility & fleet roadside
incidents** involving commercial vehicles. It turns unstructured incident reports (WhatsApp text, voice-note
transcripts, call transcripts, uploads, fleet events) into **structured, reviewable, evidence-grounded cases** with
simulated AI triage, document intelligence, grounded action plans, lawyer handoff, evaluation tooling, audit logs,
and human-review controls.

> ⚠️ **This prototype uses synthetic data and synthetic legal sources. It does not provide legal advice and must not
> be used for real legal decisions.**

It is **not an autonomous lawyer** — it is a legal-operations copilot. AI can draft, classify, retrieve and recommend;
**high-risk legal actions cross a confidence gate and require lawyer approval.**

---

## The business problem

Fleet operators lose money for every hour a commercial vehicle is immobilized at the roadside — permit disputes,
detentions, challans, accidents, document checks, alleged unofficial payment demands. Today this is handled by phone
calls and manual coordination between drivers, fleet ops, legal teams and lawyers. That is slow, hard to audit, and
easy to get wrong. This copilot removes the coordination overhead — intake, triage, evidence understanding, retrieval,
routing — while keeping lawyers in the loop for judgment and representation.

## What the prototype does

- **Command Center** — active/critical/immobilized counts, downtime at risk, awaiting-docs, awaiting-lawyer, SLA
  breaches, resolved, financial impact; a prioritized incident queue.
- **Incident intake & AI triage** — preserves the original input, detects language, shows AI transcript/translation
  (clearly labelled), extracts fields with **per-field confidence**, surfaces missing info, ambiguity and follow-ups.
- **Document intelligence** — classification, field extraction, findings (expired, mismatches, altered content, fake
  logo, embedded prompt-injection, low-quality OCR, etc.), expiry status, and a **human-validation** flag, with a
  side-by-side original-vs-extracted view.
- **Evidence & record preservation** — distinguishes original file / user statement / AI transcript / AI translation /
  AI summary / extracted fields / lawyer-reviewed record, with file hash, timestamp, source channel, device metadata,
  transformation history and chain-of-custody. Uploaded messages are labelled *"potentially relevant electronic
  record,"* never *"admissible evidence."*
- **Grounded action plan** — driver instructions, documents to collect, questions to verify, escalation level,
  suggested lawyer specialisation, **steps that each cite ≥1 synthetic source** (or are marked *unsupported*),
  confidence, assumptions, unresolved contradictions, prohibited actions, and a mandatory human-approval gate. The
  system can **abstain** (insufficient / conflicting evidence, unsupported jurisdiction, no reliable recommendation,
  immediate lawyer intervention required).
- **Lawyer handoff & routing** — auto-generated brief; a **transparent, deterministic routing score** with every
  factor shown and manual override always available. Lawyers can approve / edit / reject / request documents /
  reclassify / change urgency / add a note / mark an AI statement unsupported / select a resolution — all audited.
- **Resolution & feedback** — final classification, actions, timings, downtime, penalty/avoided cost, whether the AI
  recommendation was accepted, corrections, failure category — feeding the evaluation dashboard.
- **Evaluation & failure analysis** — accuracy, precision/recall, abstention/escalation, source grounding, calibration
  (ECE), routing, slices, and **dangerous failures flagged separately**; a failure explorer with expected-vs-system
  side-by-side and a recommended fix per case.
- **Demo mode** — six guided, resettable scenarios that step through the workflow and show pass/fail vs ground truth.
- **Audit & observability** — global append-only hash-chained audit log, provider health, error-injection toggles,
  and audit-chain integrity verification.
- **Role switcher** — 6 roles with different permissions and **tenant isolation** between fleets.

## What it does **not** do

- It does **not** give legal advice or make legal determinations. Every recommendation is a draft for lawyer review.
- It does **not** use real WhatsApp/telephony/STT/OCR/maps/LLM/court/police/government APIs — all are deterministic
  mocks behind swappable interfaces.
- It does **not** treat uploaded messages/audio as automatically admissible evidence.
- It does **not** auto-approve high-risk actions, and it does **not** silently promote low-confidence extractions to
  "verified."
- It does **not** use a real database in the prototype (seeded in-memory store; Prisma+Postgres is the production swap).

---

## Architecture (short)

Next.js 15 (App Router) + TypeScript + Tailwind. The full synthetic world is hydrated in-memory in a client
[Zustand](https://github.com/pmndrs/zustand) store; all interactions mutate that store and append to audit logs +
workflow events. AI is behind four provider interfaces with deterministic mock implementations and a 14-fault
error-injection layer. See **[docs/system-design.md](docs/system-design.md)** for context/component/data-flow/state
diagrams, sequence diagrams, the entity model, and production architecture.

```
src/
  app/                     # routes: dashboard, incidents, incident detail, lawyers, evaluation, failures, demo, audit
  components/              # layout (shell, sidebar, role switcher, toasts), ui primitives, incident panels
  lib/
    types.ts               # domain model (provenance, confidence, review status)
    store.ts               # in-memory world + all mutations (Zustand)
    rbac.ts  pii.ts        # role permissions + PII masking
    workflow/              # state machine, triage engine, routing
    providers/             # interfaces, deterministic mocks, faults (error injection)
    evaluation/            # per-case engine + aggregate metrics + calibration + slices
    audit.ts               # append-only hash-chained audit log + verifyChain
    data/                  # master data, legal sources, synthetic incidents, world hydration
    synthetic/schema.ts    # ground-truth schema
docs/                      # implementation-plan, system-design, synthetic-data-strategy, evaluation-framework
scripts/verify-dataset.ts  # headless dataset + metrics check
tests/                     # Vitest unit + integration
e2e/                       # Playwright end-to-end
```

---

## Setup

Requirements: Node ≥ 18 (built/tested on Node 22/26), npm.

```bash
npm install
npm run dev            # http://localhost:3000
```

That's it — no database, no API keys, no external services. Copy `.env.example` to `.env` only if you later wire real
providers; with no `.env` the app uses fully deterministic mocks.

Other commands:

```bash
npm run typecheck      # tsc --noEmit
npm test               # Vitest unit + integration
npm run lint           # next lint
npm run build          # production build
npx tsx scripts/verify-dataset.ts   # dataset size, adversarial %, headline metrics
npm run test:e2e       # Playwright (run `npx playwright install` once for browsers)
```

## Demo accounts / role switcher

There is no login (deliberately — see below). Use the **role switcher** in the top-right to switch identity and see
permission differences live:

| Role | Sees | Can do | Fleet scope |
|---|---|---|---|
| Driver | own incidents | upload documents | own fleet |
| Fleet Operator | dashboard, incidents | run workflow, assign lawyer | own fleet |
| Legal Ops Analyst | + evaluation, audit, PII | reclassify, override routing, toggle faults | own fleet |
| Lawyer | incident detail | **approve/edit/reject** plans, resolve, reclassify | all fleets |
| Administrator | everything | all actions incl. export | all fleets |
| Auditor | everything (read) | view audit/evaluation, export | all fleets |

**Tenant isolation:** non-privileged roles are scoped to one fleet; opening a cross-fleet incident shows an
*Access denied* view. Only Admin/Auditor have cross-tenant visibility.

Real authentication is intentionally omitted to keep the prototype runnable; the RBAC matrix (`src/lib/rbac.ts`) is the
enforcement point and is unit-tested.

## Synthetic data

**109 synthetic incidents**, **~62% adversarial/negative** (requirement: ≥40%), across valid, incomplete,
contradictory, multilingual/transliterated, fraudulent, document-manipulation, conflicting-evidence,
unsupported/ambiguous, AI/workflow-failure, and prompt-injection cases. Plus 3 fleets, 20 vehicles, 15 drivers, 10
lawyers, 13 users, and 18 synthetic legal sources. Every case carries **explicit ground truth** and a baked system
output (sometimes deliberately wrong) for evaluation. No real Aadhaar/phone/licence/owner/officer/lawyer/case data is
used; phone/licence values are stored already masked. See
**[docs/synthetic-data-strategy.md](docs/synthetic-data-strategy.md)**.

## Evaluation methodology

The evaluation engine compares the system's output against explicit ground truth for every case, producing
classification/urgency accuracy, fraud & contradiction precision/recall, abstention correctness, escalation recall,
source-grounding rate, field-extraction reliability, routing top-1/top-3, confidence calibration (ECE over 5 buckets),
recommendation acceptance / lawyer correction rates, and slice breakdowns. **Dangerous failures** (failed critical
escalation, unsupported legal recommendation, fabricated source, incorrect verified status, missed suspected fraud,
audit-log gap) are flagged **separately** from aggregate accuracy. See
**[docs/evaluation-framework.md](docs/evaluation-framework.md)** and the `/evaluation` + `/evaluation/failures` screens.

## Safety controls

- Never claims AI advice is legally authoritative; every recommendation shows source, confidence, assumptions, review
  status, and prohibited actions.
- Uploaded messages/audio labelled *potentially relevant electronic record*, not admissible evidence.
- Originals preserved separately from AI transcripts/translations/summaries/extractions (provenance tracking).
- High-risk actions require lawyer approval; the system can abstain; uncertainty is visible.
- Low-confidence extraction is never silently marked verified; verification is an explicit, audited human action.
- Prompt-injection / "approve this" / "delete the audit log" / "mark verified" / "fabricate a source" requests are
  modelled in the dataset, **surfaced, and refused** — document content is treated as data, never instructions.
- Append-only hash-chained audit log with integrity verification; PII masking; tenant isolation; export controls;
  recording-consent/legality warnings.

## Limitations (honest)

- Language detection, translation, OCR/extraction, retrieval, and recommendation text are **deterministic mocks**, not
  real ML. Provider latency/error rates shown in Observability are illustrative.
- The synthetic legal corpus is invented; citations are plausible but fictional.
- Some evaluation figures are heuristic/simulated (time saved, routing proxy, acceptance rate derived from failure
  modes). Metrics come from a single deterministic run over a small (109-case) corpus.
- No real auth/DB; the client store resets on reload.
- E2E tests require a one-time `npx playwright install` for browsers.

## Path to production & real-service replacements

Each mock sits behind an interface with a clear production swap:

| Prototype (mock) | Production replacement |
|---|---|
| WhatsApp/voice intake (fixtures) | WhatsApp Business Cloud API + telephony provider |
| AI transcript | Speech-to-text (e.g. self-hosted Whisper / cloud STT) |
| AI translation | Translation provider |
| Document extraction | OCR / document-intelligence provider |
| Legal retrieval (18 synthetic sources) | Versioned legal corpus embedded in a vector DB with metadata filters |
| Recommendation text | Real LLM behind guardrails (e.g. Anthropic) with mandatory human approval |
| Location strings | Maps / geocoding provider |
| Fleet events (fixtures) | Fleet-management system integration |
| In-memory store | Postgres + Prisma; object storage for originals |
| Lawyer directory (10 mocks) | Real lawyer network + case-management system |
| Role switcher | Real authN/authZ (OIDC/SSO) + row-level tenant security |
| Challan/court references (synthetic) | Government challan/court sources *where legally & technically permitted* |

`.env.example` documents provider-selection flags and (unused) credential placeholders. See
**[docs/system-design.md](docs/system-design.md) §11–16** for deployment, scaling, security, observability, and
production risks, and **[docs/implementation-plan.md](docs/implementation-plan.md)** for the Figma → build mapping.

---

*Prototype for demonstration only. Synthetic data. Not legal advice.*
