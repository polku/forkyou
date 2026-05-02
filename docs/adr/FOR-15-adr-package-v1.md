# FOR-15 ADR Package v1: FOR-13 Technical Choices

Status: Proposed (CTO Review Required)
Date: 2026-04-30
Owner: Researcher (Chess R&D)
Related: FOR-13 (technical choices), FOR-19 (contracts)

## Scope and Intent
This package provides first-pass ADRs with explicit alternatives, tradeoffs, and recommended direction for five decision areas requested in FOR-15: runtime language, service boundary, storage, testing strategy, and observability baseline. All ADRs are tied to FOR-19 contract requirements; where FOR-19 details are still pending or ambiguous, the decision is marked as unresolved and escalated with a recommendation.

---

## ADR-001 Runtime Language

### Context
Chess workloads combine latency-sensitive API paths, CPU-heavy search/evaluation routines, and rapid product iteration pressure. Runtime choice must balance developer velocity, numerical performance, and integration complexity.

### Options
1. TypeScript/Node.js runtime for all services.
2. Rust runtime for all services.
3. Polyglot: TypeScript/Node.js control plane + Rust chess compute service.

### Tradeoffs
- Option 1 improves development velocity and hiring availability but is weaker for deterministic low-latency compute loops and memory-tight search kernels.
- Option 2 maximizes runtime performance and memory safety but increases delivery friction for API/product iteration and raises onboarding cost.
- Option 3 preserves product velocity while isolating performance-critical paths in a compiled service; adds cross-service contract and operational complexity.

### Decision (Proposed)
Adopt **Option 3**: TypeScript/Node.js for orchestration/API and Rust for chess compute-intensive components.

### FOR-19 Contract Hook
- FOR-19 should define stable RPC/IPC contract boundaries (request/response schemas, timeouts, error taxonomy, versioning rules) between orchestration and compute services.

### Unresolved / Escalation
- Unresolved: exact transport and schema system for inter-service contract (gRPC/Protobuf vs HTTP+JSON).
- Recommendation to CTO: select gRPC/Protobuf if compute service is remote/multi-instance; accept HTTP+JSON only for single-host early phase with explicit migration gate.

---

## ADR-002 Service Boundary

### Context
Engine compute and product API concerns evolve at different rates and have different scaling constraints.

### Options
1. Monolith: API + engine logic in one deployable.
2. Two-service split: API/orchestration service and engine-compute service.
3. Event-driven multi-service decomposition from day one.

### Tradeoffs
- Option 1 reduces immediate complexity but entangles scaling and failure domains.
- Option 2 creates a clear fault and performance boundary while retaining manageable complexity.
- Option 3 offers strong long-term modularity but introduces premature infra and coordination overhead.

### Decision (Proposed)
Adopt **Option 2**: two-service split now, with limited eventing introduced only where it reduces coupling measurably.

### FOR-19 Contract Hook
- FOR-19 must define API contract classes: synchronous move-eval/search calls, async analysis jobs, and health/readiness contracts.

### Unresolved / Escalation
- Unresolved: queue requirement at launch for async analysis.
- Recommendation to CTO: defer queue to phase-2 unless FOR-19 throughput SLOs cannot be met with bounded in-process job control.

---

## ADR-003 Storage

### Context
Platform requires durable user/game metadata, reproducible analysis artifacts, and optionally large position/evaluation caches.

### Options
1. PostgreSQL only.
2. PostgreSQL + Redis cache.
3. PostgreSQL + Redis + object storage for heavy artifacts.

### Tradeoffs
- Option 1 is operationally simplest but may underperform for hot-position and transient analysis caching.
- Option 2 provides robust transactional storage plus fast ephemeral access with moderate complexity.
- Option 3 improves large artifact handling and retention economics but increases operational surface area.

### Decision (Proposed)
Adopt **Option 2** for MVP; define controlled path to Option 3 once artifact volume thresholds are observed.

### FOR-19 Contract Hook
- FOR-19 should specify data contract ownership: source-of-truth entities in Postgres, cache invalidation semantics in Redis, and consistency expectations for analysis reads.

### Unresolved / Escalation
- Unresolved: artifact retention policy and threshold for object-storage activation.
- Recommendation to CTO: set measurable trigger (for example: average artifact payload > 256 KB or storage growth > agreed monthly budget cap) in FOR-19 appendix.

---

## ADR-004 Testing Strategy

### Context
Chess systems need both software reliability and chess-correctness validation against objective references.

### Options
1. Conventional pyramid only (unit/integration/e2e).
2. Pyramid + deterministic chess regression suites (fixed FEN sets, tactical suites, engine-vs-baseline).
3. Property/fuzz-first strategy with minimal deterministic suites.

### Tradeoffs
- Option 1 may miss chess-quality regressions despite high software test coverage.
- Option 2 balances product reliability with domain-specific correctness gates.
- Option 3 improves bug discovery but can be expensive to triage and may under-communicate chess strength changes.

### Decision (Proposed)
Adopt **Option 2** with explicit golden suites and benchmark deltas in CI gates.

### FOR-19 Contract Hook
- FOR-19 should include test contract expectations for each interface: schema tests, compatibility tests, and performance/correctness acceptance thresholds.

### Unresolved / Escalation
- Unresolved: canonical benchmark suite composition and minimum confidence thresholds before release.
- Recommendation to CTO: approve initial fixed suite (WAC/tactical set + curated middlegame/endgame FEN corpus + engine baseline match protocol) and revisit quarterly.

---

## ADR-005 Observability Baseline

### Context
Engine workloads are latency-variable and compute-intensive; failure diagnosis requires request-level traces and domain metrics.

### Options
1. Logs-only baseline.
2. Metrics + structured logs.
3. Metrics + structured logs + distributed tracing (OpenTelemetry-native).

### Tradeoffs
- Option 1 is insufficient for diagnosing cross-service latency and search-depth anomalies.
- Option 2 is viable for early operations but leaves causality gaps across service boundaries.
- Option 3 has higher setup complexity but provides the strongest operational debugging and SLO governance.

### Decision (Proposed)
Adopt **Option 3** as baseline, with phased rollout: metrics/logs day one, tracing required before scale-up milestones.

### FOR-19 Contract Hook
- FOR-19 should define observability contract fields: correlation IDs, span propagation rules, key domain metrics (NPS, depth reached, eval latency percentiles, cache hit rates), and error-class conventions.

### Unresolved / Escalation
- Unresolved: final SLO targets by endpoint and time control.
- Recommendation to CTO: ratify initial SLO draft in FOR-19 and tie release gates to p95 latency + correctness benchmark stability.

---

## Evidence Base
Primary/authoritative sources used for this package:

1. Node.js Foundation / OpenJS. "Node.js Documentation" (runtime model and performance characteristics). https://nodejs.org/en/docs
2. Rust Project Developers. "The Rust Programming Language" (safety/performance model). https://doc.rust-lang.org/book/
3. gRPC Authors. "gRPC Concepts" (contracted service interfaces and transport semantics). https://grpc.io/docs/what-is-grpc/core-concepts/
4. PostgreSQL Global Development Group. "PostgreSQL Documentation" (transactional storage guarantees). https://www.postgresql.org/docs/
5. Redis Ltd. "Redis Documentation" (in-memory caching behavior and persistence options). https://redis.io/docs/latest/
6. OpenTelemetry Authors/CNCF. "OpenTelemetry Documentation" (metrics/logs/tracing baseline). https://opentelemetry.io/docs/
7. IEEE. "ISO/IEC/IEEE 29119 Software Testing" (testing process and structure reference). https://ieeexplore.ieee.org/document/152726
8. Chessprogramming Wiki (secondary, curated technical synthesis). "Engine Testing", "Search", "Evaluation", "Benchmarking". https://www.chessprogramming.org/

## Applicability Assessment
These decisions are applicable to the current project if FOR-19 finalizes service/data contracts early and engineering capacity exists to maintain a two-runtime architecture. The recommendations are transferable to chess platforms that require both high iteration speed and compute-focused optimization, but the polyglot split should be deferred if team capacity cannot support additional operational complexity in the next milestone.

## Engineering Follow-up Task Proposals (for CTO/Coder)
1. Define and version FOR-19 inter-service schema contract (including timeout/error/version policy).
2. Scaffold compute-service interface conformance test harness against FOR-19 contract.
3. Implement baseline benchmark CI stage with fixed FEN/tactical corpus and regression thresholding.
4. Add OpenTelemetry propagation/correlation IDs to API and compute boundary.
5. Draft storage lifecycle policy and Redis invalidation rules tied to analysis artifacts.

## Open Questions
1. What are final FOR-19 transport and schema choices for API-to-compute calls?
2. What p95/p99 latency SLOs are required per endpoint/time control at launch?
3. Which benchmark set and Elo-strength proxy will be the release gate of record?
4. What artifact growth or cost threshold triggers object-storage introduction?
5. Should async analysis queueing be required in MVP or deferred to phase-2?
