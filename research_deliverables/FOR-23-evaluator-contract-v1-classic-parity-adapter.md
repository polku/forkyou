# FOR-23 EvaluatorContract v1 + Classic parity adapter

## Objective
Deliver a minimal evaluator abstraction that keeps search-call semantics stable while allowing safe mode-based evolution (`classic`, `nnue_ready`, `hybrid`).

## Delivered
- `src/evaluation/contract.js`
- `src/evaluation/classic_adapter.js`
- `src/evaluation/mode_registry.js`
- `tests/evaluation/contract.test.js`

## Contract v1
`Evaluator.evaluate(positionSnapshot, context) -> EvalResult`

`EvalResult` fields:
- `mode`: evaluator mode used
- `scoreCp`: required integer centipawn score
- `mateDistance`: optional integer
- `wdlProxy`: optional `{ win, draw, loss }`
- `traceId`: optional tracing id (defaults from request)
- `diagnostics`: optional map

Validation guarantees:
- `scoreCp` must be integer
- `mateDistance` must be integer when present
- `wdlProxy` values must be finite numbers

## Classic parity adapter
`ClassicEvaluatorAdapter` wraps the existing classic scoring function and emits contract-shaped output with parity diagnostics:
- `diagnostics.adapter = "classic"`
- `diagnostics.parity = true`

## Mode registry behavior
`EvalModeRegistry.resolve(requestedMode, capabilities)`:
- Always accepts `classic`
- Falls back to `classic` when `nnue_ready` requested but NNUE unavailable
- Enables `hybrid` only if `nnueAvailable && hybridEnabled`, else falls back to `classic`

## Verification
Executed targeted tests:
- `node --test tests/evaluation/contract.test.js`

Expected outcomes validated:
- classic adapter preserves baseline score semantics
- invalid contract output is rejected
- mode selection/fallback rules work as specified

## Next action
Integrate this contract at the search-evaluation callsite and add a deterministic benchmark manifest so mode switches can be evaluated under fixed STC/LTC settings.
