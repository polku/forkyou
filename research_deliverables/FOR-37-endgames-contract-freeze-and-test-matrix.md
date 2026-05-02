# FOR-37 Research Deliverable: Endgames Contract Freeze and Test Matrix

Date: 2026-04-30
Owner: Researcher
Related: FOR-21A (endgames), FOR-22 (evaluator modularization), FOR-15 (testing strategy ADR)

## Attendus (Definition of Done for FOR-37)
1. Contract document frozen with implementation-ready request/response types.
2. Error taxonomy finalized (`hit/miss/unavailable/timeout/error`) with timeout and unsupported-position semantics.
3. Compatibility matrix included for primary provider (Syzygy) and deterministic fallback behavior.
4. Contract checklist includes at least 10 test scenarios, including corruption, timeout, unsupported material, and illegal positions.
5. Parent issue FOR-21 receives a concise summary comment with open risks and sign-off asks.

## Ratification Status
- CTO sign-off status: Ratified on 2026-04-30.
- Ratified decisions:
  - `rule_mode`: `auto_75` (canonical default). `fide_claim_aware` remains optional diagnostic mode.
  - STC gate: `>= 0.0 Elo` (95% CI must not cross negative).
  - LTC gate: `>= 0.0 Elo` (95% CI must not cross negative).
  - Tablebase quarantine: trigger if `timeout+error rate > 0.5%` over rolling 10k probes, or on any corruption signature.

## 1) Question and Scope
Question: What endgames contract should be frozen now for FOR-21A, and what minimum test matrix reduces regression risk enough to let implementation proceed?

Scope:
- Interface contract for endgame tablebase probing and fallback behavior.
- Determinism, legal-rule handling (50/75 move), and observability fields.
- CI test matrix (contract, determinism, performance, and regression gates).

Out of scope:
- Full implementation details of search heuristics.
- Provider-specific optimizations beyond contract implications.

## 2) Key Findings
1. A freeze-ready contract should expose both WDL and DTZ outcomes plus explicit probe status; this aligns with Syzygy semantics and prevents ambiguity in caller behavior.
2. Endgame behavior must encode draw-rule context explicitly (halfmove clock and rule mode), because DTZ meaning depends on zeroing-move distance and draw claims/automatic draws.
3. Deterministic execution requires fixed mode inputs (threads/hash/path/options/seed) and stable fallback precedence; otherwise benchmark comparability is weak.
4. Stockfish operational practice supports this separation: tablebase-related options are independent UCI options and can be validated via option-level contract tests.
5. Minimum safe matrix is four layers: schema/contract tests, deterministic replay tests, tablebase-vs-fallback functional tests, and STC/LTC regression gates with fixed opening suite and config manifest.
6. The largest remaining risk is silent semantic drift when tablebase probe is unavailable/corrupt; contract must return explicit `unavailable`/`error` states and enforce deterministic fallback.

## 3) Evidence Table
| Claim | Source | Type | Date | Quality | Notes |
|---|---|---|---|---|---|
| Syzygy workflow requires WDL and DTZ semantics | syzygy1/tb GitHub repository (README + probing references): https://github.com/syzygy1/tb | Primary (upstream implementation/docs) | Retrieved 2026-04-30 | High | Upstream reference for Syzygy data model and probing code links. |
| Stockfish exposes endgame tablebase controls as explicit engine options (e.g., `SyzygyPath`, `SyzygyProbeDepth`) | Stockfish official docs, UCI & Commands: https://official-stockfish.github.io/docs/stockfish-wiki/UCI-%26-Commands.html | Primary (official engine docs) | Retrieved 2026-04-30 | High | Supports contract boundary and configurable behavior assumptions. |
| Engine testing should use staged STC/LTC regression workflow | Stockfish docs, regression and testing pages: https://official-stockfish.github.io/docs/stockfish-wiki/Regression-Tests.html and https://official-stockfish.github.io/docs/fishtest-wiki/Creating-my-first-test.html | Primary (official process docs) | Retrieved 2026-04-30 | High | Supports gate design (short then long controls, statistical acceptance). |
| Programmatic probing APIs expose WDL/DTZ and deterministic probe behavior surfaces | python-chess syzygy docs: https://python-chess.readthedocs.io/en/stable/syzygy.html | Primary (library docs) | Retrieved 2026-04-30 | Medium-High | Useful independent corroboration for contract shape and API behavior. |
| Draw-rule semantics affect endgame correctness claims and automation | FIDE Laws of Chess: https://rcc.fide.com/fide-laws-of-chess_fulltexthtml/ | Primary (governing rules) | Retrieved 2026-04-30 | High | Required for policy around 50/75 move handling in contract context. |
| Internal baseline recommends domain-specific deterministic regression suites | FOR-15 ADR package (`docs/adr/FOR-15-adr-package-v1.md`) | Internal primary | 2026-04-30 | Medium-High | Aligns freeze decision with existing engineering strategy. |

## 4) Assumptions and Uncertainty
Assumptions:
- FOR-21A targets Syzygy-compatible tablebase integration first.
- Search layer can consume a typed endgame result without immediate heuristic redesign.
- CI budget can run STC routinely and LTC on merge gate/scheduled cadence.

Uncertainty:
- Exact production rule policy (strict FIDE claim-aware interpretation vs simplified engine-internal policy) is not yet ratified.
- Corrupt/incomplete tablebase handling policy (hard fail vs soft fallback) is not yet approved.
- Performance impact thresholds by hardware tier are not yet defined.

Confidence: Medium-High.
- High confidence on interface primitives and evidence-backed test gating patterns.
- Medium confidence on final acceptance thresholds until product/runtime constraints are finalized.

## 5) Risks and Tradeoffs
- Tight freeze now reduces architecture churn but may require revision if rule-policy decisions change late.
- Strict deterministic mode improves comparability but can reduce raw strength in some runtime profiles.
- Soft fallback improves availability but can mask tablebase quality issues unless telemetry and alerts are mandatory.
- Large matrix increases confidence but consumes CI time; staged gating is required to stay within budget.

## 6) Recommendation and Next Actions
Recommendation:
Freeze `EndgameContract v1` now with explicit status/result typing and deterministic fallback semantics, then enforce a minimal four-layer matrix before default enablement.

### Proposed EndgameContract v1 (freeze draft)
```text
ProbeEndgame(position, context) -> EndgameResult

context:
- rule_mode: fide_claim_aware | auto_75 | engine_simplified
- halfmove_clock: u16
- deterministic_seed: u64
- provider_policy: ordered provider list
- probe_limits: { max_latency_ms, max_pieces }

EndgameResult:
- status: hit | miss | unavailable | timeout | error
- wdl: win | draw | loss | unknown
- dtz: i16 | null
- best_move: uci | null
- provenance: { provider_id, tablebase_set_id, data_version }
- diagnostics: { latency_ms, tb_hits, fallback_depth }
```

### Provider Compatibility Matrix
| Capability | Syzygy (primary) | Fallback provider (engine eval/search) | Contract rule |
|---|---|---|---|
| Supported material in TB domain | Yes (within available TB pieces/files) | Yes | If Syzygy unsupported, return `miss` then deterministic fallback. |
| WDL result | Native | Derived/heuristic | `wdl` required for `hit`; fallback may return `unknown` with non-hit status. |
| DTZ result | Native when probe succeeds | Not guaranteed | `dtz` nullable; must be `null` outside Syzygy success path. |
| Best move | Native TB move | Search move | Must always be legal if present; illegal => `error`. |
| Corrupt/missing data handling | Detectable via probe/load failure | N/A | Use `unavailable` or `error`; never silent success. |
| Timeout semantics | Probe can time out under policy | Search can time out under policy | Timeout always maps to `timeout` and deterministic fallback. |
| Determinism controls | Path/options + fixed context | Fixed search config + seed | Same context/config manifest must replay identical output in deterministic mode. |
| Provenance | TB set/version hashable | Engine build/config hashable | `provenance` required for auditability. |

### Contract Test Checklist (minimum 12 scenarios)
1. `hit_returns_wdl_dtz_and_legal_best_move`
2. `unsupported_material_returns_miss_and_fallback_executes`
3. `missing_syzygy_path_returns_unavailable`
4. `corrupted_tablebase_file_returns_error`
5. `probe_timeout_returns_timeout_without_retry_loop`
6. `illegal_position_rejected_with_error`
7. `illegal_best_move_from_provider_maps_to_error`
8. `deterministic_mode_same_input_same_output`
9. `deterministic_mode_persists_across_process_restart_with_same_manifest`
10. `rule_mode_fide_claim_aware_respects_halfmove_clock_context`
11. `rule_mode_auto_75_enforces_automatic_draw_boundary`
12. `fallback_provenance_recorded_when_syzygy_non_hit`

### Test Matrix (minimum)
1. Contract/schema tests
- Validate enum/state invariants for every `status` branch.
- Validate required fields for `hit` and nullability constraints for non-hit outcomes.

2. Deterministic replay tests
- Same FEN + same context + same config manifest must return identical `status/wdl/dtz/best_move`.
- Include fixed seeds and fixed engine options (`SyzygyPath`, depth/probe options, thread/hash controls).

3. Functional correctness tests
- Curated endgame FEN corpus across win/draw/loss and 50-move-edge scenarios.
- Verify legal move output and correct fallback behavior on missing/corrupt path simulation.

4. Regression/performance gates
- STC gate on every candidate change, LTC gate before default-enable or release branch merge.
- Require non-regression threshold (to be finalized by owner) and publish benchmark manifest for reproducibility.

Immediate next actions:
1. CTO/Tech Lead: ratify `rule_mode` policy and fallback failure policy (owner: CTO, unblock action: decision in issue thread).
2. Coder: implement `EndgameContract v1` types + adapter stubs and contract tests.
3. Coder: implement deterministic config manifest output in benchmark jobs.
4. QA/Infra: wire staged STC/LTC jobs and artifact retention for benchmark manifests.

Critical open questions:
- Which rule policy is product-canonical for rated play (`fide_claim_aware` vs `auto_75`)?
- What exact non-regression threshold is required to pass STC and LTC gates?
- What is the tolerated timeout/error rate before tablebase provider quarantine is enforced?
