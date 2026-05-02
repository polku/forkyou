# FOR-38 / FOR-21B Endgames Adapter Skeleton + Error Mapping

## Scope
Define a backend adapter contract for an endgames provider with explicit typed error mapping and deterministic caller behavior.

## Adapter Interface (TypeScript)
```ts
export type EndgamesProviderId = "tablebase_local" | "tablebase_remote" | string;

export type EndgamesQuery = {
  fen: string;
  maxPieces?: number; // optional caller hint
  timeoutMs: number;
  requestId: string;
};

export type EndgamesStatus =
  | "hit"
  | "miss"
  | "timeout"
  | "unavailable"
  | "error";

export type EndgamesMove = {
  uci: string;
  dtz?: number;
  dtm?: number;
  wdl?: -2 | -1 | 0 | 1 | 2;
};

export type EndgamesResult = {
  providerId: EndgamesProviderId;
  status: EndgamesStatus;
  move?: EndgamesMove;
  latencyMs: number;
  traceId: string;
  error?: EndgamesDomainError;
};

export interface EndgamesAdapter {
  resolveBestMove(query: EndgamesQuery): Promise<EndgamesResult>;
}
```

## Domain Error Model
```ts
export type EndgamesErrorCode =
  | "INVALID_FEN"
  | "UNSUPPORTED_POSITION"
  | "NOT_INITIALIZED"
  | "TIMEOUT"
  | "UPSTREAM_4XX"
  | "UPSTREAM_5XX"
  | "TRANSPORT"
  | "RATE_LIMITED"
  | "INTERNAL";

export type EndgamesDomainError = {
  code: EndgamesErrorCode;
  message: string;
  retryable: boolean;
  cause?: unknown;
};
```

## Error Mapping Policy
| Source condition | Mapped code | `status` | retryable |
|---|---|---|---|
| FEN parse/validation fail | `INVALID_FEN` | `error` | false |
| Position outside tablebase support | `UNSUPPORTED_POSITION` | `miss` | false |
| Provider not ready / initialization missing | `NOT_INITIALIZED` | `unavailable` | true |
| Adapter timeout reached | `TIMEOUT` | `timeout` | true |
| Remote HTTP 429 | `RATE_LIMITED` | `unavailable` | true |
| Remote HTTP 4xx (except 429) | `UPSTREAM_4XX` | `error` | false |
| Remote HTTP 5xx | `UPSTREAM_5XX` | `unavailable` | true |
| Network/DNS/socket failure | `TRANSPORT` | `unavailable` | true |
| Unexpected exception | `INTERNAL` | `error` | false |

## Caller Semantics
- `hit`: play returned move.
- `miss`: fall through to next subsystem (search/eval).
- `timeout` or `unavailable`: continue with fallback and emit warning log.
- `error`: quarantine provider for current decision and fallback.

## Observability Contract
Emit structured log/event per adapter call:
- `requestId`
- `providerId`
- `status`
- `error.code` (when present)
- `latencyMs`
- `fenPieceCount`

Counter dimensions:
- `endgames_requests_total{providerId,status}`
- `endgames_errors_total{providerId,errorCode}`
- `endgames_latency_ms` (histogram)

## Minimal Tests (FOR-21B)
1. `maps_invalid_fen_to_error_invalid_fen`
2. `maps_unsupported_position_to_miss`
3. `maps_timeout_to_timeout_status_retryable`
4. `maps_http_429_to_rate_limited_unavailable`
5. `maps_http_5xx_to_unavailable_retryable`
6. `maps_transport_failure_to_unavailable`
7. `maps_unknown_exception_to_internal_error`

## Next Implementation Step
Create `src/endgames/adapter.ts`, `src/endgames/errors.ts`, and unit tests for the mapping table once backend repository checkout is available in this issue workspace.

## CTO Heartbeat 2026-04-30
- Acknowledged blocker escalation from Backend Codex comment `b21b28d8-1ea0-40f6-be69-de482db9d0a2`.
- Decision: keep `FOR-38` blocked until backend repository workspace is attached to this issue.

Unblock owner and action
- Owner: CTO (me) with platform/workspace provisioning support.
- Action: provision/attach backend repo execution workspace to `FOR-38`, or create/relink implementation issue in backend workspace with inherited execution workspace and handoff to Backend Codex.

Execution immediately after unblock
- Resume adapter + error mapping implementation against frozen FOR-37 contract.
- Run targeted tests for success/timeout/unsupported paths.
- Post evidence to parent FOR-21 thread with changed file paths and test output.

Operational note
- Paperclip control-plane API calls from this run returned connection resets, so this update is persisted here as durable heartbeat evidence until issue-thread API is reachable.
