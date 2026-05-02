# FOR-20 Research Deliverable: Openings Subsystem Strategy

## Summary
A provider-replaceable openings subsystem should use one stable query/response contract with explicit outcome states (`hit`, `miss`, `timeout`, `unavailable`, `error`) and deterministic fallback traversal. The core finding is that UCI engine interaction and Polyglot-style book outputs can be normalized behind the same interface if legality checks, timeout behavior, and tie-break policies are standardized. This design prevents behavioral drift when a preferred provider is missing or slow. Determinism must be policy-driven (stable sort + seed rules), because runtime/search configuration can change engine behavior. The result is a testable contract that maps directly to implementation tasks.

## Evidence
- UCI engine lifecycle and command semantics (`uci`/`uciok`, `isready`/`readyok`, `go`, `stop`, `bestmove`) support a provider adapter boundary and timeout-aware control flow.
  - Stockfish Docs: *UCI & Commands* (Stockfish developers), https://official-stockfish.github.io/docs/stockfish-wiki/UCI-%26-Commands.html
  - Meyer-Kahlen et al.: *Universal Chess Interface draft-2* (2024), https://expositor.dev/uci/doc/draft-2.pdf
- Polyglot opening book format provides position-keyed move candidates and weights, supporting a common output schema for opening providers.
  - *polyglot(6) man page* (PolyGlot docs), https://manpages.debian.org/jessie/polyglot/polyglot.6.en.html
- Reproducibility constraints are tied to engine/runtime configuration; benchmark signatures are used to verify exact search identity.
  - Stockfish Docs: *UCI & Commands* (`bench` guidance), https://official-stockfish.github.io/docs/stockfish-wiki/UCI-%26-Commands.html
  - Stockfish Docs: *Stockfish FAQ* (time control / thread-hash guidance), https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html

## Applicability Assessment
This is directly applicable to ForChess because it isolates provider-specific logic from callers, allowing swaps (local book, UCI engine, remote service) without interface churn. The work is practical for near-term delivery: most effort is in contract and orchestration behavior, not novel engine research.

## Engineering Follow-up Tasks
1. Define `OpeningProvider.resolve(position, context) -> OpeningResolution` contract with enum/status invariants.
2. Implement deterministic fallback orchestrator with immutable per-game provider precedence.
3. Implement error quarantine policy for providers and chain-exhaustion handoff to search subsystem.
4. Add contract tests for all provider outcomes and deterministic tie-break behavior.
5. Add structured logs (`providerId`, `status`, `latencyMs`, `fallbackDepth`, `seedUsed`).

## Open Questions
- Should provider quarantine on `error` be scoped to one ply, one move pair, or full game?
- What default timeout budgets should be used for bullet/blitz/rapid/classical?
- Is determinism required cross-hardware, or only within fixed runtime config and seed?
- Should remote opening providers be allowed in rated games or analysis-only modes?

## Proposed Provider Interface
`OpeningProvider.resolve(position, context) -> OpeningResolution`

- `position`: normalized FEN (+ side to move)
- `context`: `{ gamePhaseHint, timeBudgetMs, determinismMode, maxCandidates }`
- `OpeningResolution`:
  - `status`: `hit | miss | timeout | unavailable | error`
  - `selectedMove`: UCI move or `null`
  - `candidates`: ordered list `{ move, scoreType(weight|cp|wdl), score, provenance }`
  - `providerId`, `latencyMs`, `trace`

## Fallback Decision Table
| Preferred provider outcome | Immediate action | Next provider | Determinism rule |
|---|---|---|---|
| `hit` with legal move | accept | none | equal-score tie-break: score desc, move lexicographic |
| `miss` | fallback | next in chain | same tie-break policy |
| `timeout` | degraded + fallback | next in chain | no same-ply retry |
| `unavailable` | fallback | next in chain | log once per game segment |
| `error` | quarantine provider | next in chain | deterministic quarantine scope |
| chain exhausted | return `no_opening_move` | handoff to search | stable handoff payload |

## Contract Test Cases
- `returns_hit_legal_move_when_primary_hits`
- `falls_back_on_primary_miss_to_secondary_hit`
- `falls_back_on_timeout_without_same_ply_retry`
- `marks_unavailable_and_uses_next_provider`
- `quarantines_erroring_provider_for_current_game`
- `returns_no_opening_move_when_chain_exhausted`
- `enforces_stable_tiebreak_for_equal_scores`
- `seeded_mode_is_reproducible_for_same_gameid_ply`
- `non_seeded_mode_remains_non_random_by_default`
- `illegal_provider_move_is_treated_as_error`
