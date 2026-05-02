# FOR-19 Dependency Matrix v1 (FOR-36 Deliverable)

Status: Draft for CTO ratification
Date: 2026-04-30
Owner: CTO
Related: FOR-15, FOR-21A, FOR-21B, FOR-22, FOR-37

## Objective
Define the contract dependency graph needed to execute chess backend delivery with minimal integration risk.

## Matrix
| Dependency ID | Contract/Decision | Producing Owner | Consuming Stream(s) | Blocker Severity | Acceptance Criteria | Next Action |
|---|---|---|---|---|---|---|
| D1 | Inter-service transport + schema (`gRPC/Protobuf` or `HTTP/JSON`) | CTO | FOR-21A, FOR-21B, FOR-22 | Critical | Decision recorded + schema skeleton committed + version policy documented | CTO ratify transport and commit contract shell |
| D2 | Error taxonomy and retry semantics | Platform Lead | FOR-21B, FOR-22, API reliability | Critical | Canonical error enum mapped to status + retryable flag + integration tests | Platform Lead publish error catalog |
| D3 | Timeout budget contract (API->compute) | CTO + Backend Lead | FOR-21A, FOR-22, SLO setup | High | Per-endpoint timeout budget table + fallback behavior for timeout/unavailable | Backend Lead propose table, CTO approve |
| D4 | Endgame rule policy (`fide_claim_aware` vs `auto_75`) | Product + CTO | FOR-21A, FOR-37 tests | High | Policy selected and encoded in contract context (`rule_mode`) | Product/CTO decision in issue thread |
| D5 | Deterministic benchmark manifest format | Chess R&D Lead | FOR-21A, FOR-22, CI | High | Manifest schema with fixed options/seed/hash/threads + reproducibility check | R&D Lead publish manifest schema |
| D6 | STC/LTC pass thresholds | Chess R&D Lead | CI gating + release | Medium | Thresholds defined and approved, with gate logic documented | R&D Lead propose, CTO approve |
| D7 | Data ownership map (Postgres vs Redis) | Platform Lead | FOR-22, persistence layer | Medium | Entity ownership table + invalidation semantics + integration tests | Platform Lead deliver storage map |
| D8 | Observability propagation fields (trace/correlation IDs) | SRE/Platform | FOR-21B, FOR-22, operations | Medium | Required fields list + propagation tests across boundary | SRE publish telemetry contract |
| D9 | Tablebase provider fallback/quarantine policy | CTO + Backend Lead | FOR-21A, FOR-21B | Medium | Explicit status transitions for `timeout/unavailable/error` and quarantine rules | Backend Lead draft policy, CTO ratify |
| D10 | Contract versioning and backward compatibility | CTO | All streams | Critical | Versioning policy (`v1`, deprecation window, compatibility tests) adopted | CTO include policy in contract doc |

## Dependency Sequence and Parallelization
1. Critical path sequence:
- D1 -> D10 -> D2 -> D3 -> FOR-21A/FOR-21B implementation merge

2. Parallel streams once D1 and D10 are fixed:
- Stream A: D2 + D9 (error/fallback contract)
- Stream B: D5 + D6 (benchmark and CI thresholds)
- Stream C: D7 + D8 (storage/observability contracts)

3. Release gate dependencies:
- Merge to protected branch requires D2, D3, D5.
- Default enablement requires D6, D8, D9.

## Blockers
1. No ratified transport/schema decision (D1).
- Unblock owner: CTO
- Unblock action: ratify transport in issue thread and publish schema skeleton.

2. Rule-mode policy not finalized (D4).
- Unblock owner: Product + CTO
- Unblock action: decision note recorded with canonical mode and exceptions.

3. No benchmark thresholds (D6).
- Unblock owner: Chess R&D Lead
- Unblock action: propose STC/LTC values and confidence requirements.

## Child Issue Split Recommendation
1. Child A: Contract Core (D1, D10, D3)
- Owner: Backend Architect
- Definition of done: versioned contract + timeout table + compatibility policy + conformance test scaffold.

2. Child B: Endgames Error/Fallback Contract (D2, D9)
- Owner: Backend Engineer
- Definition of done: error taxonomy + mapping table + tests for fallback/quarantine behavior.

3. Child C: Deterministic CI Gates (D5, D6)
- Owner: Chess R&D Engineer
- Definition of done: manifest schema + deterministic replay check + STC/LTC gate config.

4. Child D: Storage + Observability Contracts (D7, D8)
- Owner: Platform/SRE Engineer
- Definition of done: ownership map + telemetry field contract + propagation validation.

## Minimal Verification Completed
- All identified FOR-15 unresolved items now represented as dependencies with owner and unblock action.
- Critical-path dependencies identified and ordered.
- Parallelizable streams isolated to reduce schedule risk.

## Next Action
- Post these artifacts to FOR-36 thread and create child issues A-D with explicit ownership and acceptance criteria.
