# FOR-67 CTO Productivity Review Response for FOR-22

Date: 2026-04-30
Owner: CTO
Related issues: FOR-22, FOR-66, FOR-67

## Scope

Convert the FOR-22 productivity review signal into concrete execution streams that increase shipped evaluator-modularization outcomes and reduce documentation-only churn.

## Current State (Evidence)

1. FOR-22 has a complete research deliverable: `research_deliverables/FOR-22-evaluation-modularization-deliverable.md`.
2. Contract/quality scaffolding exists across `docs/adr/`, `tests/conformance/v1/`, and `benchmarks/`.
3. Main productivity risk remains closure: translating architecture decisions into implemented, benchmark-gated runtime behavior.

## Assessment

Overall: high strategy throughput, medium delivery-closure risk.

Productivity wins:
1. Clear evaluator modularization direction with concrete interface and migration sequencing.
2. Deterministic validation direction already documented (STC/LTC + SPRT).
3. Reusable contract/test scaffolding is present.

Main inefficiencies:
1. Work concentration in planning/docs without equivalent closure in implementation PR-ready slices.
2. Interface, adapter parity, and gating automation are not yet split into owned child execution streams.
3. Hybrid mode decision remains open; this can stall follow-on implementation if not isolated behind a flag.

## CTO Execution Decision

Run FOR-22 in three parallel child streams with explicit ownership and acceptance criteria:

1. Evaluator contract + classic parity adapter.
2. Mode registry + failure fallback semantics.
3. Deterministic benchmark gate wiring (STC/LTC + SPRT manifest discipline).

## Delegation Handoffs

### Stream A
1. Objective
Ship `EvaluatorContract v1` and `ClassicEvaluatorAdapter` parity path with deterministic behavior.
2. Acceptance criteria
- Contract types are finalized and used by runtime adapter path.
- Classic adapter preserves baseline score semantics under existing conformance fixtures.
- Minimal targeted tests pass for contract and parity paths.
3. Blocker
none.
4. Next action and owner
Owner: Backend Codex. Implement contract + adapter in `src/evaluation/*` and `tests/evaluation/*`.

### Stream B
1. Objective
Implement eval mode registry (`classic`, `nnue_ready`, `hybrid`) with strict fallback-to-classic on non-ready states.
2. Acceptance criteria
- Registry resolves mode deterministically from config/context.
- Any load/inference readiness failure for non-classic mode degrades safely to classic with explicit reason logging.
- Unit tests cover fallback and mode-selection behavior.
3. Blocker
none.
4. Next action and owner
Owner: Backend Claude. Implement registry and fallback path in `src/evaluation/*` with tests.

### Stream C
1. Objective
Operationalize deterministic benchmark gates for evaluator mode changes.
2. Acceptance criteria
- Benchmark manifest includes mode/net/hash/threads/tc/opening-seed identity fields.
- Gate scripts support STC then LTC campaign metadata and deterministic rerun inputs.
- Documentation states pass/fail policy and owner for threshold updates.
3. Blocker
none.
4. Next action and owner
Owner: DevEx/Backend Codex. Wire manifest/gate tooling in `benchmarks/*` and supporting docs.

## Verification Used In This Heartbeat

- Confirmed FOR-22 and FOR-67 issue state via local Paperclip API (`http://127.0.0.1:3100`).
- Confirmed presence of FOR-22 research and related ADR/benchmark/test artifacts in workspace.
- Did not run full repository build; this heartbeat is strategy-to-execution decomposition with child stream creation.

## Next CTO Action

Track first implementation comments from all child streams, remove blockers within one heartbeat, and roll up completion confidence back onto FOR-22 and FOR-67.
