# Chess Bot Inter-Service Contract — Core v1

Status: Accepted
Date: 2026-04-30
Owner: Backend Engineer (FOR-40)
Related: FOR-19, FOR-36, FOR-40, FOR-41, FOR-42, FOR-43
Supersedes: (none — first v1 freeze)

---

## D1 — Transport and Schema Decision

### Decision: HTTP/JSON with OpenAPI 3.1 schema

The internal boundary between `api-orchestrator` (TypeScript/Node.js) and `engine-compute` (Rust)
uses **HTTP/1.1 + JSON** with an **OpenAPI 3.1** schema definition as the authoritative contract.

### Rationale

1. **Single-host MVP constraint**: gRPC's multiplexing and binary framing gains are negligible
   when both services run on the same host without network hops. FOR-15 ADR-001 explicitly
   stated "accept HTTP+JSON only for single-host early phase with explicit migration gate."
2. **Toolchain simplicity**: HTTP/JSON eliminates the protoc + grpc_rust + ts_grpc toolchain
   from CI, reducing build complexity for a small team.
3. **FOR-19 alignment**: FOR-19 committed to "HTTP+JSON for external clients" — using the same
   transport internally avoids a second protocol surface and keeps ops simple.
4. **Type safety via OpenAPI**: utoipa (Rust) + ts-rest/zod (TypeScript) generate typed
   clients/handlers from the shared OpenAPI schema, preserving the contractual typing of
   Protobuf without the gRPC dependency.
5. **Migration gate**: if multi-host deployment is required post-MVP, the OpenAPI schema is
   translatable to a Protobuf IDL. Migration is guarded by an explicit gate (see §Migration
   Policy below).

### What This Decides

- Transport protocol: HTTP/1.1 (upgrade to HTTP/2 only if benchmarks show need)
- Payload format: JSON (Content-Type: application/json)
- Schema authority: `docs/contracts/v1/openapi.yaml` (source of truth for all endpoint shapes)
- Code generation: generated clients/handlers from the schema; handwritten adapters are rejected

### What This Does Not Decide

- External-client protocol (handled separately; HTTP/JSON already confirmed by FOR-19)
- WebSocket or streaming protocol (deferred, no use case identified at MVP)
- gRPC migration threshold (see §Migration Policy)

### Migration Gate to gRPC/Protobuf

Migration is triggered by any of:
- Multi-host deployment required (engine-compute moves off api-orchestrator host)
- p95 move-selection latency > 200 ms attributable to JSON serialization overhead
  (must be confirmed by profiling, not speculation)
- Team grows to >4 engineers needing protoc toolchain familiarity

Migration requires: CTO approval + ADR amendment + conformance test update.

---

## D10 — Contract Versioning and Backward-Compatibility Policy

### Version Scheme

- Schema version: `v{MAJOR}` path prefix (e.g., `/v1/move`, `/v1/health`)
- Current frozen version: **v1**
- Minor/patch changes (additive, non-breaking) do not increment the major version
- Breaking changes require a new major version (`v2`) with parallel support window

### Backward-Compatibility Rules

A change is **breaking** (requires `v2`) if it:
- Removes or renames an endpoint path
- Removes or renames a required request field
- Changes the type of an existing field
- Removes a response field that consumers may depend on
- Changes error code semantics for an existing error class

A change is **non-breaking** (allowed in `v1`) if it:
- Adds a new optional request field
- Adds a new response field (consumers must ignore unknown fields)
- Adds a new endpoint path
- Adds a new error code for a previously-unhandled condition

### Deprecation Policy

| Stage            | Duration  | Action Required                              |
|------------------|-----------|----------------------------------------------|
| Deprecated       | ≥ 2 weeks | `Deprecation` response header added to v1    |
| Sunset notice    | ≥ 1 week  | Warning logged; callers expected to migrate  |
| Removed          | After window | `v1` endpoint returns 410 Gone if removed |

For MVP (pre-first production release), the deprecation window is **2 weeks minimum** unless
a critical security issue requires faster removal (CTO decision required).

### Versioning in OpenAPI Schema

- Each schema file is named `openapi-v{MAJOR}.yaml`
- The `info.version` field reflects the minor semantic version (e.g., `1.0.0`, `1.1.0`)
- All response objects include a `_contract_version` field: `"v1"`

### Compatibility Test Obligation

- Every PR modifying `docs/contracts/v1/openapi.yaml` must pass `tests/conformance/v1/`
- A contract compatibility check (`make check-contract-compat`) is required in CI before merge
- The check compares the PR diff against the breaking-change rules above and fails on violations

---

## D3 — Endpoint Timeout Budget Table

### Budget Principles

- All timeouts are enforced at the **api-orchestrator** level (caller-side)
- The engine-compute service MUST return a structured error on internal timeout (not hang)
- Fallback behavior is defined per endpoint class (see column below)
- Timeout values represent **p99 budget** — p95 should be ≤ 60% of budget

### Timeout Budget Table

| Endpoint                    | Path              | p99 Budget | Engine-Side Limit | Fallback on Timeout                                   |
|-----------------------------|-------------------|------------|-------------------|-------------------------------------------------------|
| Move selection (blitz)      | `POST /v1/move`   | 500 ms     | 450 ms            | Return best move found so far (partial result)        |
| Move selection (rapid)      | `POST /v1/move`   | 2 000 ms   | 1 800 ms          | Return best move found so far (partial result)        |
| Move selection (classical)  | `POST /v1/move`   | 10 000 ms  | 9 000 ms          | Return best move found so far (partial result)        |
| Move selection (analysis)   | `POST /v1/analyze`| 30 000 ms  | 28 000 ms         | Return partial analysis with depth reached            |
| Opening lookup              | `POST /v1/opening`| 200 ms     | 150 ms            | Return `{"source":"fallback","move":null}` — caller decides |
| Endgame probe               | `POST /v1/endgame`| 300 ms     | 250 ms            | Return `{"available":false}` — caller falls back to search   |
| Health check                | `GET /v1/health`  | 100 ms     | 80 ms             | Return `503 Service Unavailable`                      |
| Readiness check             | `GET /v1/ready`   | 100 ms     | 80 ms             | Return `503 Service Unavailable`                      |

### Time Control Routing

The `time_control` field in move-selection requests maps to timeout class:

| `time_control` value | Timeout class applied |
|----------------------|-----------------------|
| `bullet` (< 3 min)   | blitz                 |
| `blitz` (3–10 min)   | blitz                 |
| `rapid` (10–60 min)  | rapid                 |
| `classical` (> 60 min) | classical           |
| `correspondence`     | classical             |
| `analysis`           | analysis              |

### Fallback Semantics Contract

Engine-compute MUST signal timeout/unavailable with structured errors:

```json
{
  "error": "timeout",
  "partial_result": { /* best move so far, may be null */ },
  "depth_reached": 5,
  "elapsed_ms": 448
}
```

- `"error": "timeout"` — engine hit its internal limit; partial result included if available
- `"error": "unavailable"` — engine not ready (startup, resource exhaustion); no result
- `"error": "invalid_input"` — malformed position or illegal FEN; no result

Api-orchestrator fallback rules:
- On `timeout`: use `partial_result` if `depth_reached >= 3`; otherwise return `500` with `retry_after: 0`
- On `unavailable`: return `503` with `retry_after: 5` (seconds)
- On `invalid_input`: return `400` with error forwarded verbatim

---

## D2 + D9 — Endgame Error Taxonomy and Fallback/Quarantine Contract

### Canonical Error Taxonomy

All error responses MUST include `{ error, status_code, retryable, _contract_version }`.

| `error`            | `status_code` | `retryable` | Meaning |
|--------------------|---------------|-------------|---------|
| `invalid_input`    | 400           | false       | Request payload or position data is invalid |
| `rate_limited`     | 429           | true        | Admission control rejected due to capacity |
| `internal_error`   | 500           | false       | Non-recoverable engine failure |
| `dependency_error` | 503           | true        | Upstream dependency failed in a recoverable way |
| `unavailable`      | 503           | true        | Engine or provider is not currently ready |
| `timeout`          | 504           | true        | Timeout reached before a complete result |

### Endgame Provider Status Contract

`POST /v1/endgame` returns `EndgameResponse` with required metadata fields:
- `provider_status` in `{hit, miss, timeout, unavailable, error, quarantined}`
- `fallback_action` in `{none, search, opening, fail_closed}`
- `retryable` (boolean)
- optional `quarantine` object when status is `quarantined`

### Fallback + Quarantine State Rules

| Provider status | Required response behavior | `fallback_action` | `retryable` | Quarantine transition |
|-----------------|----------------------------|-------------------|-------------|-----------------------|
| `hit`           | Return tablebase output (`available=true`) | `none` | false | none |
| `miss`          | Return `available=false` with no provider failure | `search` | false | none |
| `timeout`       | Return `available=false` and continue via search | `search` | true | Enter quarantine after 3 consecutive timeouts in 60s |
| `unavailable`   | Return `available=false` and continue via search | `search` | true | Enter quarantine after 3 consecutive unavailable events in 60s |
| `error`         | Return `available=false`; isolate provider from hot path | `search` | true | Enter quarantine immediately on first non-timeout error |
| `quarantined`   | Do not attempt provider call; use fallback directly | `search` | true | Exit after `until_epoch_ms` or manual clear |

### Quarantine Object

When `provider_status=quarantined`, include:

```json
{
  "quarantine": {
    "active": true,
    "reason": "timeout_burst|unavailable_burst|error_burst|manual",
    "until_epoch_ms": 1777559999000
  }
}
```

---

## D7 — Storage Ownership and Invalidation Contract

### Ownership Map

| Domain entity / artifact | System of record | Cache owner | Consistency model | Invalidation contract |
|--------------------------|------------------|-------------|-------------------|------------------------|
| Opening lookup result    | Postgres opening corpus snapshot | Redis (`opening:*`) | Eventual | Versioned corpus publish clears `opening:{corpus_version}:*`; warmup repopulates lazily |
| Endgame probe result     | Local/remote tablebase source manifest | Redis (`endgame:*`) | Eventual | Provider-state transitions `timeout/unavailable/error/quarantined` invalidate matching FEN key family |
| Search move output       | Engine in-memory runtime | Ephemeral (none) | Not applicable | No persistent invalidation; response marked `owner=ephemeral` |

### Response Metadata Requirement

All successful compute responses (`MoveResponse`, `AnalyzeResponse`, `OpeningResponse`, `EndgameResponse`)
MUST include `_storage` metadata:
- `owner`: `redis` | `postgres` | `ephemeral`
- `durability`: `persistent` | `volatile`
- `consistency`: `strong` | `eventual` | `not_applicable`
- `invalidation_scope`: cache key prefix or table scope name

---

## D8 — Observability Propagation Contract

### Required Propagation Fields

Every request across `api-orchestrator` -> `engine-compute` MUST include:
- `observability.request_id`
- `observability.trace_id`
- `observability.correlation_id`

Every response (success or error) MUST echo these values in:
- `_observability.request_id`
- `_observability.trace_id`
- `_observability.correlation_id`

### Propagation Behavior

- Values are caller-generated and treated as opaque by `engine-compute`.
- `engine-compute` MUST forward values unchanged in response payloads.
- Missing observability fields are contract violations and fail conformance.

### Integration-Test Requirements (D7/D8)

Required validation cases for runtime repositories (`api-orchestrator`, `engine-compute`):

1. `propagates_observability_ids_move_success`
- Send `POST /v1/move` with `observability.{request_id,trace_id,correlation_id}` and assert response echoes identical values in `_observability`.

2. `propagates_observability_ids_error_path`
- Trigger a deterministic `invalid_input` response and assert `_observability` values match request context on error payloads.

3. `declares_storage_metadata_move_search`
- Assert `MoveResponse` includes `_storage.owner=ephemeral`, `_storage.durability=volatile`, `_storage.consistency=not_applicable`.

4. `declares_storage_metadata_opening_cache`
- Route a request through opening-book path and assert `_storage.owner=redis` with non-empty `invalidation_scope`.

5. `declares_storage_metadata_endgame_cache_or_fallback`
- Route a request through endgame path and assert `_storage` presence with valid enum values, including fallback/quarantine outcomes.

6. `invalidates_cache_on_provider_state_transition`
- Force provider status transition (`timeout|unavailable|error|quarantined`) and assert configured endgame cache key family invalidation executes.

---

## OpenAPI v1 Schema Reference

The authoritative schema lives at:
```
docs/contracts/v1/openapi.yaml
```

This contract document does not duplicate the schema; the YAML file is the source of truth.
All consumers MUST generate their client/handler code from the schema, not from this document.

---

## Compliance Verification

| Criterion                                           | Status   | Artifact                               |
|-----------------------------------------------------|----------|----------------------------------------|
| D1: Transport decision recorded with rationale      | Accepted | This document, §D1                     |
| D10: v1 versioning + backward-compat policy         | Accepted | This document, §D10                    |
| D3: Timeout budget table + fallback semantics       | Accepted | This document, §D3                     |
| D7: Storage ownership + invalidation semantics      | Accepted | This document, §D7 + `openapi.yaml` `_storage` |
| D8: Trace/correlation propagation field contract    | Accepted | This document, §D8 + `openapi.yaml` `_observability` |
| v1 schema shell checked in                          | Accepted | `docs/contracts/v1/openapi.yaml`       |
| Conformance test scaffold committed                 | Accepted | `tests/conformance/v1/`                |

---

## Next Action

- FOR-41 (Endgames Error/Fallback Contract) is implemented in this contract revision
  through §D2 + §D9 and mirrored in `openapi.yaml` + conformance fixtures.
- FOR-42 (Deterministic CI Gates) is now unblocked — CI contract tests can reference `tests/conformance/v1/`.
- FOR-43 (Storage + Observability Contract) is implemented in this contract revision
  through §D7 + §D8 and mirrored in `openapi.yaml` + conformance fixtures.
