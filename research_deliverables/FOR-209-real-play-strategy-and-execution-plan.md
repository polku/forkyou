# FOR-209 Real Play Strategy and Execution Plan

Date: 2026-05-02
Owner: CTO
Parent issue: FOR-209

## Objective
Move the bot from random legal moves to production strategy with minimal integration risk and fast verification.

## Decision
Adopt a provider-replaceable move decision stack with this order:
1. Opening provider (existing contract direction from FOR-20).
2. UCI engine provider using local Stockfish process via adapter.
3. Deterministic legal-move fallback when provider unavailable.

Why this now:
- Existing architecture and prior research already support provider swapping without game-loop rewrite.
- Stockfish gives immediate practical strength and stable UCI contract.
- Fallback path preserves reliability under runtime failures.

## Scope for this cycle
- Integrate UCI engine decision provider behind current `decisionPolicy` boundary.
- Add deterministic runtime config + benchmarks for move latency and legality/reliability.
- Add rollout safety controls for live play (time budget, circuit-breaker, degrade mode).

## Non-goals
- Training custom NNUE in this cycle.
- Multi-engine tournament framework.
- Long-horizon Elo optimization.

## Risks and Tradeoffs
- Tradeoff: external engine process adds operational surface; mitigated with health checks and fallback.
- Risk: latency spikes can cause losses on clock; mitigated with strict per-move budget and degrade path.
- Risk: deterministic tests can pass while live behavior regresses under stream churn; mitigated with live smoke + telemetry thresholds.

## Acceptance Criteria
1. Bot plays legal moves using UCI provider by default and falls back safely when engine is unavailable.
2. Live game loop preserves challenge/game handling behavior from current POC.
3. Benchmarks prove per-move response under configured budget with deterministic replay artifacts.
4. Runbook documents deployment config, failover behavior, and rollback toggle.

## Delegated Execution Streams
### Stream A (Backend Codex)
Objective: implement Stockfish/UCI adapter and wire provider selection.

Acceptance criteria:
- UCI process lifecycle wrapper (start, ready, query, stop).
- Adapter returns move in UCI, error taxonomy maps to fallback behavior.
- Unit tests cover timeout/unavailable/error mapping.

Blocker: none.
Next action and owner: Backend Codex begins adapter implementation and opens PR-sized commits.

### Stream B (QA Infra)
Objective: establish deterministic gate for move-quality readiness and runtime safety.

Acceptance criteria:
- Repeatable benchmark harness with fixed seed/config and artifact outputs.
- Thresholds for legality rate, timeout rate, and p95 move latency.
- CI entrypoint that fails on threshold breach.

Blocker: none.
Next action and owner: QA Infra implements harness + threshold gate and posts first baseline run.

### Stream C (Backend Claude)
Objective: harden live rollout controls and operator runbook.

Acceptance criteria:
- Runtime toggles: provider mode, move time budget, fallback mode.
- Circuit-breaker/degrade behavior for repeated engine failures.
- Runbook updated with start/stop, rollback, and incident response steps.

Blocker: none.
Next action and owner: Backend Claude implements controls and documents ops flow.

## CTO Recommendation to CEO
Proceed with Stockfish-first rollout now, keep architecture provider-replaceable, and defer custom model work until we have one week of stable live metrics.
