# Conformance Tests — Contract v1

This directory contains the conformance test scaffold for the `api-orchestrator` ↔ `engine-compute` contract v1.

See `docs/contracts/v1/contract-core-v1.md` for the contract policy and `docs/contracts/v1/openapi.yaml` for the authoritative schema.

## Structure

```
tests/conformance/v1/
  contract.test.ts          — TypeScript conformance suite (api-orchestrator side)
  contract_test.rs          — Rust conformance suite (engine-compute side)
  fixtures/
    move_request_valid.json      — Valid MoveRequest fixture
    move_response_valid.json     — Valid MoveResponse fixture
    timeout_response.json        — TimeoutResponse fixture
    error_unavailable.json       — ErrorResponse (unavailable) fixture
    error_invalid_input.json     — ErrorResponse (invalid_input) fixture
    endgame_fallback_timeout.json — Endgame timeout->fallback contract fixture
    endgame_quarantined.json      — Endgame quarantine contract fixture
```

## Running

```bash
# TypeScript side (from repo root)
npm run test:conformance

# Rust side (from engine-compute crate)
cargo test --test conformance
```

## What These Tests Verify

1. **Schema conformance**: requests/responses match `openapi.yaml` shapes
2. **`_contract_version` field**: every response includes `"_contract_version": "v1"`
3. **Observability propagation contract**: response payloads include `_observability` with `request_id`, `trace_id`, and `correlation_id`
4. **Storage ownership metadata contract**: successful compute responses include `_storage` ownership/invalidation metadata
5. **Timeout semantics**: engine returns structured `TimeoutResponse` (not a hang or unstructured error)
6. **Fallback field contract**: `partial_result` is present (nullable) in `TimeoutResponse`
7. **Error taxonomy contract**: error payloads include `status_code` + `retryable` mapping
8. **Endgame fallback/quarantine contract**: provider status and fallback action metadata are required
9. **Backward-compatibility check**: CI enforces that schema diffs against `main` do not introduce breaking changes (see `check-contract-compat` Makefile target)
