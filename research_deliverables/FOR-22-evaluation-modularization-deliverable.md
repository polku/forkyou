Acknowledged latest scope update from comment `5b70e413-3f4d-4cd9-bcb3-476a0dd4cfb2`: this deliverable focuses on a safe evaluator-swap architecture with explicit interface contract, mode-switching rules, determinism constraints, and benchmark protocol.

## 1) Summary
A safe modularization path is to define a single evaluator contract that takes immutable position/search context and returns a typed score bundle (centipawn/mate domain + optional WDL proxy + feature diagnostics), while keeping evaluator state externalized so engines can swap classic, NNUE-ready, and hybrid evaluators without touching search control flow. Evidence from Stockfish’s UCI and NNUE integration indicates production engines already separate evaluator selection (`Use NNUE`, `EvalFile`) from search command semantics, which supports an interface-first migration with mode flags rather than search rewrites. For reproducibility, evaluator mode must be part of the experiment identity, and deterministic benchmarking must freeze thread/time/book settings and use sequential statistical testing (SPRT) across STC→LTC gates. The migration from classic baseline should be staged: parity wrapper first, then feature-flagged NNUE-ready adapter, then hybrid blending experiments only behind benchmark gates. This minimizes regression risk while preserving comparability with established engine-testing practice.

## 2) Evidence
Major claim A: Interface-first evaluator swapping is feasible in strong engines and can be decoupled from UCI/search plumbing.
- Source: **Stockfish Docs — UCI & Commands** (official Stockfish docs, current). Documents evaluator-related options (`Use NNUE`, `EvalFile`) and standard search command flow via UCI, indicating evaluator configuration is a bounded subsystem rather than a protocol redesign.
  URL: https://official-stockfish.github.io/docs/stockfish-wiki/UCI-%26-Commands.html
- Source: **Description of the Universal Chess Interface (UCI), April 2004** (Huber & Meyer-Kahlen). Defines engine/GUI protocol boundary independent of internal evaluator implementation.
  URL: https://www.wbec-ridderkerk.nl/html/UCIProtocol.html

Major claim B: NNUE-ready mode should support efficient incremental eval while preserving compatibility constraints.
- Source: **NNUE | Stockfish Docs** (official stockfish nnue-pytorch wiki docs). Describes sparse feature design, incremental updates, and integer-domain quantization constraints that drive NNUE interface needs.
  URL: https://official-stockfish.github.io/docs/nnue-pytorch-wiki/docs/nnue.html
- Source: **Stockfish Docs — Creating my first test (NNUE net tests)**. Shows net-selection workflow tied to `EvalFileDefaultName` and branch-level testing, implying evaluator binaries/nets are versioned test artifacts.
  URL: https://official-stockfish.github.io/docs/fishtest-wiki/Creating-my-first-test.html

Major claim C: Reproducibility and acceptance should be enforced through standardized engine testing protocol.
- Source: **Stockfish Docs — Progression / Regression Tests**. Publishes explicit time controls, thread settings, game counts, and opening book criteria used for progression/regression.
  URL: https://official-stockfish.github.io/docs/stockfish-wiki/Regression-Tests.html
- Source: **Stockfish Docs — Creating my first test**. Documents STC then LTC gate and SPRT-based stop/pass/fail decisions for robust patch validation.
  URL: https://official-stockfish.github.io/docs/fishtest-wiki/Creating-my-first-test.html
- Source (secondary corroboration): **Chessprogramming Wiki — Sequential Probability Ratio Test**. Summarizes why SPRT is preferred in modern engine development.
  URL: https://www.chessprogramming.org/Sequential_Probability_Ratio_Test

Major claim D: External benchmark comparability should include broad-list references, not only internal self-play.
- Source: **CCRL official site**. Documents consistent community rating-list infrastructure and stated testing guidelines for cross-engine context.
  URL: https://computerchess.org.uk/index.html

## 3) Applicability Assessment
This applies directly to FOR-22: the project can implement evaluator modularization without destabilizing search by enforcing a strict evaluator boundary and mode registry, then validating each mode under a fixed STC/LTC + SPRT protocol. Transfer risk is low for interface and benchmarking process, medium for hybrid scoring calibration (requires tuning budget and anti-overfit safeguards).

## 4) Engineering Follow-up Tasks
1. **Define `EvaluatorContract v1` with typed outputs and deterministic context inputs**
2. **Implement `ClassicEvaluatorAdapter` parity wrapper against current baseline score path**
3. **Add `EvalModeRegistry` and hard rules for `classic`, `nnue_ready`, `hybrid` mode selection**
4. **Add reproducibility manifest (`mode`, net id/hash, hash size, threads, tc, opening suite seed) to benchmark runs**
5. **Create benchmark harness profile: STC SPRT gate then LTC SPRT gate with fixed opening suite**
6. **Add hybrid guardrail: no default enable unless passes LTC SPRT and non-regression tactical suite checks**

## 5) Open Questions
1. Should hybrid mode combine classic+NNUE as weighted score blending, or as position-classifier-based hard switching?
2. What evaluator output shape is required by downstream pruning heuristics (raw cp only vs cp+uncertainty/WDL proxy)?
3. Which opening suite breadth is required for acceptance (single UHO-style book vs multi-book rotation by ECO families)?
4. Do we require deterministic equivalence at fixed node budget (`go nodes`) in addition to fixed time controls?
5. What is the acceptable Elo/noise threshold for declaring parity before enabling NNUE-ready mode by default?

### Proposed Interface Draft (for CTO/Coder)
```text
Evaluate(PositionSnapshot pos, EvalContext ctx) -> EvalResult

EvalContext:
- mode: classic | nnue_ready | hybrid
- phase_hint: opening | middlegame | endgame (optional)
- deterministic_seed: u64
- eval_cache_token: opaque

EvalResult:
- score_cp: i32              # side-to-move relative
- mate_distance: optional i16
- wdl_proxy: optional (w,d,l)
- trace_id: optional string  # benchmark traceability
- diagnostics: optional map  # feature flags / accumulator stats
```

### Migration Path from Classic Baseline
1. Freeze current classic eval as reference and snapshot benchmark baseline.
2. Implement contract wrapper returning identical score semantics (`ClassicEvaluatorAdapter`).
3. Add mode registry with `classic` default and strict fallback-to-classic on any NNUE load/inference failure.
4. Introduce `nnue_ready` adapter behind feature flag; no search heuristic changes in this stage.
5. Run STC SPRT then LTC SPRT against classic baseline; require pass before broader rollout.
6. Introduce experimental `hybrid` mode only after `nnue_ready` stabilizes; evaluate separate SPRT campaign and opening-breadth checks.

Next action: CTO to choose hybrid strategy direction (blend vs hard-switch) and assign the interface + harness implementation tasks.
