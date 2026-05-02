# FOR-15 ADR Hardening v2 (FOR-36 Follow-up)

Status: Ready for Execution (CTO)
Date: 2026-04-30
Owner: CTO
Supersedes: `docs/adr/FOR-15-adr-package-v1.md`
Related: FOR-13, FOR-19, FOR-21A, FOR-21B, FOR-22, FOR-37

## Purpose
Convert FOR-15 ADR recommendations into execution-grade decisions with explicit acceptance criteria, dependency hooks to FOR-19, and rollout sequencing.

## Finalized Decisions

### ADR-001 Runtime and Language Boundary
Decision:
- Use TypeScript/Node.js for API/orchestration.
- Use Rust for compute-intensive chess search/evaluation services.

Acceptance criteria:
- Inter-service schema is versioned (`v1`) and checked in.
- At least one conformance test validates Node client <-> Rust service compatibility.
- Error taxonomy is identical across both runtimes.

FOR-19 dependency hook:
- FOR-19 owns protocol shape, timeout contract, and version compatibility policy.

### ADR-002 Service Boundary
Decision:
- Two-service architecture at MVP: `api-orchestrator` and `engine-compute`.
- Async queue is deferred unless SLO evidence requires it.

Acceptance criteria:
- Service contracts defined for synchronous eval/search and async analysis submission.
- Health/readiness endpoints return contract-defined states.
- Failure domain tests show API fallback behavior when compute is unavailable.

FOR-19 dependency hook:
- FOR-19 defines contract classes, availability semantics, and fallback behavior.

### ADR-003 Storage
Decision:
- MVP storage baseline is PostgreSQL + Redis.
- Object storage becomes phase-2 trigger-based only.

Acceptance criteria:
- Entity ownership map (Postgres vs Redis) is documented.
- Cache invalidation semantics are covered by integration tests.
- Artifact size/cost telemetry exists to support phase-2 trigger decision.

FOR-19 dependency hook:
- FOR-19 defines consistency guarantees and read-after-write expectations.

### ADR-004 Testing Strategy
Decision:
- Use test pyramid plus deterministic chess regression suites.
- CI merges require schema contract tests + deterministic replay + STC checks.

Acceptance criteria:
- Fixed FEN/tactical corpus is checked in with manifest hash.
- Deterministic replay test runs are reproducible on identical config.
- STC gate threshold is defined; LTC gate is required for default-on/release.

FOR-19 dependency hook:
- FOR-19 defines interface-level test obligations and pass/fail thresholds.

### ADR-005 Observability Baseline
Decision:
- Baseline is structured logs + metrics + distributed tracing (OTel-compatible).
- Tracing mandatory before scale-up milestone.

Acceptance criteria:
- Correlation IDs propagate across API -> compute boundary.
- Metric set includes eval latency percentiles, depth, cache hit rates, provider status.
- Error classes map consistently to logs, traces, and alerts.

FOR-19 dependency hook:
- FOR-19 defines required telemetry fields and error-class conventions.

## Unresolved Decisions Converted to Explicit Owners
1. Transport choice (`gRPC/Protobuf` vs `HTTP/JSON`)
- Owner: CTO
- Deadline: before FOR-19 revision freeze
- Default recommendation: `gRPC/Protobuf` unless single-host constraint proves superior for MVP timeline.

2. Rule policy for endgame draw semantics (`fide_claim_aware` vs `auto_75`)
- Owner: Product + CTO
- Deadline: before FOR-21A implementation merge

3. STC/LTC non-regression thresholds
- Owner: Chess R&D Lead
- Deadline: before CI gate enforcement on protected branch

4. Object storage activation threshold
- Owner: Platform Lead
- Deadline: before first production load test signoff

## Delivery Sequence (Execution Order)
1. Finalize FOR-19 `v1` dependency matrix and contract classes.
2. Freeze schema + error taxonomy and generate contract fixtures.
3. Implement endgames adapter + mapping tests (FOR-21B).
4. Implement deterministic benchmark manifest + STC gate.
5. Add cross-service telemetry propagation and alerts.

## Minimal Verification Plan for This ADR Hardening
- Verify each ADR has: decision, acceptance criteria, dependency hook, owner for unresolved items.
- Verify sequence maps to child execution streams without ambiguity.

## Next Action
- Publish FOR-19 dependency matrix document and split implementation into child issues by contract, adapter, CI gating, and observability streams.
