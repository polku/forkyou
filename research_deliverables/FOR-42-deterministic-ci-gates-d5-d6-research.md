# FOR-42 Research Deliverable: Deterministic CI Gates (D5/D6)

Date: 2026-04-30
Owner: Researcher
Related: FOR-19, FOR-36C, FOR-37, FOR-40

## 1) Question and Scope
Question:
What deterministic CI gate design for D5 (manifest format) and D6 (STC/LTC thresholds) is decision-ready now, given current repository state and documented dependencies?

Scope:
- D5 manifest requirements and reproducibility guarantees.
- D6 threshold policy and gate-tier usage (CI vs release).
- Alignment between documented policy and implemented gate logic.

Out of scope:
- Full CI workflow authoring.
- Engine strength tuning beyond pass/fail gate definitions.

## 2) Key Findings
1. D5 and D6 are explicitly defined in the dependency matrix with acceptance criteria and are now actionable as part of FOR-36C.
2. A concrete threshold policy already exists in `benchmarks/endgames/thresholds.json` with separate `ci_gate` and `release_gate` profiles, including latency, failure-rate, and correctness floors.
3. The benchmark report format includes deterministic audit fields (`manifestVersion`, `contractRef`, run metadata, aggregate metrics), supporting reproducibility evidence.
4. Current TypeScript gate runner (`run-benchmark.ts`) does not select a gate profile key (`ci_gate`/`release_gate`) and therefore is not aligned with the threshold schema; JavaScript runner (`run-benchmark.js`) does support `--gate` selection.
5. Contract-core v1 explicitly marks FOR-42 unblocked and establishes conformance scaffold linkage, so gate enforcement can be tied directly to `tests/conformance/v1/` and benchmark artifacts.

## 3) Evidence Table
| Claim | Source | Type | Date | Quality | Notes |
|---|---|---|---|---|---|
| D5/D6 definitions and acceptance criteria are explicit | `docs/adr/FOR-19-dependency-matrix-v1.md` | Internal primary | 2026-04-30 | High | Contains owner, severity, and DoD-level criteria for D5/D6. |
| STC/LTC requirement is formalized in hardening ADR | `docs/adr/FOR-15-adr-hardening-v2.md` | Internal primary | 2026-04-30 | High | Requires STC gate for merges, LTC gate for default-on/release. |
| Threshold values for CI and release are already codified | `benchmarks/endgames/thresholds.json` | Internal primary | 2026-04-30 | High | Contains `ci_gate` and `release_gate` numeric limits. |
| Gate implementation in TS runner is schema-misaligned | `benchmarks/endgames/run-benchmark.ts` | Internal primary (implementation) | 2026-04-30 | High | Loads full thresholds object and passes directly to checker with flat fields. |
| Gate-profile selection exists in JS runner | `benchmarks/endgames/run-benchmark.js` | Internal primary (implementation) | 2026-04-30 | High | Supports `--gate` and indexes thresholds by key. |
| FOR-42 unblock status and contract-test dependency are explicit | `docs/contracts/v1/contract-core-v1.md` | Internal primary | 2026-04-30 | High | Notes FOR-42 unblocked and references conformance tests. |
| STC->LTC staged testing pattern is externally validated | `research_deliverables/FOR-37-endgames-contract-freeze-and-test-matrix.md` (cites official Stockfish docs retrieved 2026-04-30) | Internal synthesized from primary externals | 2026-04-30 | Medium-High | Corroborates staged gate design but not specific local thresholds. |

## 4) Assumptions and Uncertainty
Assumptions:
- `thresholds.json` values are provisional but intended as near-term source of truth pending CTO ratification.
- Determinism for D5 is measured by repeatability of outputs under fixed manifest/config rather than bit-identical timing.
- CI enforcement target is protected-branch merge gate first, then release/default-on gate.

Uncertainty:
- Threshold numbers are not yet marked as formally approved in a governance artifact beyond draft ADR references.
- The canonical execution path (TS vs JS benchmark runner) is not explicitly declared.
- Hardware normalization policy for CI variance is not yet documented.

Confidence: Medium-High
- High confidence on repository-state facts and implementation mismatch.
- Medium confidence on final threshold strictness until formal ratification.

## 5) Risks/Tradeoffs
- Policy/implementation drift risk: documented two-tier thresholds can be bypassed if TS runner is used without gate-key selection.
- False confidence risk: deterministic claims weaken if manifest schema and runtime invocation contract are not enforced together.
- Throughput vs rigor tradeoff: tighter release gates reduce regression risk but can increase cycle time and flake exposure without hardware calibration.

## 6) Recommendation and Next Actions
Recommendation:
Treat `thresholds.json` as the single threshold source, enforce explicit gate-profile selection (`ci_gate` for merge/STC, `release_gate` for release/LTC), and close the TS/JS implementation gap before enabling protected-branch enforcement.

Next actions (smallest risk-reducing sequence):
1. Owner: Chess R&D Lead
Action: Ratify D6 threshold values (or updated values) in FOR-42 issue thread with explicit effective date.
2. Owner: Backend/Infra Engineer
Action: Align `run-benchmark.ts` to gate-keyed threshold selection parity with `run-benchmark.js`; require explicit `--gate` in CI invocation.
3. Owner: QA/Infra
Action: Add minimal verification job: run same manifest twice under fixed config and assert deterministic status/correctness outputs plus gate evaluation consistency.
4. Owner: CTO
Action: Confirm governance binding: merge gate requires D5 + STC (`ci_gate`), release/default-on requires LTC (`release_gate`).

Critical open questions:
- Which runner (`.ts` via ts-node or compiled `.js`) is canonical in CI today?
- Are current `release_gate` failure/correctness bounds calibrated to target hardware or copied from local baseline assumptions?
- What deterministic tolerance policy is accepted for latency percentiles under CI variance?
