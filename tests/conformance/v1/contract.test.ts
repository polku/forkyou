/**
 * Conformance test suite — Contract v1 (api-orchestrator side)
 *
 * These tests validate that responses from engine-compute match
 * the shapes defined in docs/contracts/v1/openapi.yaml.
 *
 * To run against a live engine:  ENGINE_URL=http://localhost:8080 npm run test:conformance
 * To run in schema-only mode:    npm run test:conformance (validates fixtures only)
 */

import * as fs from "fs";
import * as path from "path";

const FIXTURES_DIR = path.join(import.meta.dirname, "fixtures");
const ENGINE_URL = process.env.ENGINE_URL ?? null;

function loadFixture(name: string): unknown {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, name), "utf-8")
  );
}

// --- Schema shape assertions ---

function assertContractVersion(obj: Record<string, unknown>, label: string): void {
  if (obj["_contract_version"] !== "v1") {
    throw new Error(
      `${label}: expected _contract_version "v1", got ${JSON.stringify(obj["_contract_version"])}`
    );
  }
}

function assertObservabilityContext(obj: Record<string, unknown>, label: string): void {
  const ctx = obj["_observability"] as Record<string, unknown> | undefined;
  if (!ctx || typeof ctx !== "object") {
    throw new Error(`${label}: '_observability' must be an object`);
  }
  for (const field of ["request_id", "trace_id", "correlation_id"]) {
    if (typeof ctx[field] !== "string" || (ctx[field] as string).length === 0) {
      throw new Error(`${label}: '_observability.${field}' must be a non-empty string`);
    }
  }
}

function assertStorageMetadata(obj: Record<string, unknown>, label: string): void {
  const storage = obj["_storage"] as Record<string, unknown> | undefined;
  if (!storage || typeof storage !== "object") {
    throw new Error(`${label}: '_storage' must be an object`);
  }
  const validOwners = ["redis", "postgres", "ephemeral"];
  const validDurability = ["volatile", "persistent"];
  const validConsistency = ["eventual", "strong", "not_applicable"];
  if (!validOwners.includes(storage["owner"] as string)) {
    throw new Error(`${label}: '_storage.owner' invalid`);
  }
  if (!validDurability.includes(storage["durability"] as string)) {
    throw new Error(`${label}: '_storage.durability' invalid`);
  }
  if (!validConsistency.includes(storage["consistency"] as string)) {
    throw new Error(`${label}: '_storage.consistency' invalid`);
  }
  if (typeof storage["invalidation_scope"] !== "string") {
    throw new Error(`${label}: '_storage.invalidation_scope' must be a string`);
  }
}

function assertMoveResponse(obj: Record<string, unknown>): void {
  assertContractVersion(obj, "MoveResponse");
  assertObservabilityContext(obj, "MoveResponse");
  assertStorageMetadata(obj, "MoveResponse");
  if (typeof obj["move"] !== "string") {
    throw new Error(`MoveResponse: 'move' must be a string`);
  }
}

function assertTimeoutResponse(obj: Record<string, unknown>): void {
  assertContractVersion(obj, "TimeoutResponse");
  assertObservabilityContext(obj, "TimeoutResponse");
  if (obj["error"] !== "timeout") {
    throw new Error(`TimeoutResponse: 'error' must be "timeout"`);
  }
  if (!("partial_result" in obj)) {
    throw new Error(`TimeoutResponse: 'partial_result' field must be present (nullable)`);
  }
  if (typeof obj["depth_reached"] !== "number") {
    throw new Error(`TimeoutResponse: 'depth_reached' must be a number`);
  }
  if (typeof obj["elapsed_ms"] !== "number") {
    throw new Error(`TimeoutResponse: 'elapsed_ms' must be a number`);
  }
}

function assertErrorResponse(obj: Record<string, unknown>): void {
  assertContractVersion(obj, "ErrorResponse");
  assertObservabilityContext(obj, "ErrorResponse");
  const validErrors = ["invalid_input", "unavailable", "timeout", "internal_error", "dependency_error", "rate_limited"];
  const validStatusCodes = [400, 429, 500, 503, 504];
  if (!validErrors.includes(obj["error"] as string)) {
    throw new Error(
      `ErrorResponse: 'error' must be one of ${validErrors.join(", ")}, got ${obj["error"]}`
    );
  }
  if (!validStatusCodes.includes(obj["status_code"] as number)) {
    throw new Error(`ErrorResponse: 'status_code' must be one of ${validStatusCodes.join(", ")}`);
  }
  if (typeof obj["retryable"] !== "boolean") {
    throw new Error(`ErrorResponse: 'retryable' must be a boolean`);
  }
}

function assertEndgameResponse(obj: Record<string, unknown>): void {
  assertContractVersion(obj, "EndgameResponse");
  if (typeof obj["available"] !== "boolean") {
    throw new Error(`EndgameResponse: 'available' must be a boolean`);
  }
  const validProviderStates = ["hit", "miss", "timeout", "unavailable", "error", "quarantined"];
  if (!validProviderStates.includes(obj["provider_status"] as string)) {
    throw new Error(`EndgameResponse: invalid provider_status ${obj["provider_status"]}`);
  }
  const validFallbackActions = ["none", "search", "opening", "fail_closed"];
  if (!validFallbackActions.includes(obj["fallback_action"] as string)) {
    throw new Error(`EndgameResponse: invalid fallback_action ${obj["fallback_action"]}`);
  }
  if (typeof obj["retryable"] !== "boolean") {
    throw new Error(`EndgameResponse: 'retryable' must be a boolean`);
  }
  if (obj["provider_status"] === "quarantined") {
    const quarantine = obj["quarantine"] as Record<string, unknown> | null;
    if (!quarantine || quarantine["active"] !== true) {
      throw new Error(`EndgameResponse: quarantined status requires active quarantine metadata`);
    }
  }
}

// --- Fixture conformance tests ---

function testMoveResponseFixture(): void {
  const fixture = loadFixture("move_response_valid.json") as Record<string, unknown>;
  assertMoveResponse(fixture);
  console.log("  PASS: MoveResponse fixture matches schema");
}

function testTimeoutResponseFixture(): void {
  const fixture = loadFixture("timeout_response.json") as Record<string, unknown>;
  assertTimeoutResponse(fixture);
  console.log("  PASS: TimeoutResponse fixture matches schema");
}

function testErrorUnavailableFixture(): void {
  const fixture = loadFixture("error_unavailable.json") as Record<string, unknown>;
  assertErrorResponse(fixture);
  if (fixture["error"] !== "unavailable") {
    throw new Error(`Expected error=unavailable`);
  }
  console.log("  PASS: ErrorResponse(unavailable) fixture matches schema");
}

function testErrorInvalidInputFixture(): void {
  const fixture = loadFixture("error_invalid_input.json") as Record<string, unknown>;
  assertErrorResponse(fixture);
  if (fixture["error"] !== "invalid_input") {
    throw new Error(`Expected error=invalid_input`);
  }
  console.log("  PASS: ErrorResponse(invalid_input) fixture matches schema");
}

function testEndgameTimeoutFallbackFixture(): void {
  const fixture = loadFixture("endgame_fallback_timeout.json") as Record<string, unknown>;
  assertEndgameResponse(fixture);
  if (fixture["provider_status"] !== "timeout" || fixture["fallback_action"] !== "search") {
    throw new Error(`Expected timeout/search fallback contract`);
  }
  console.log("  PASS: Endgame timeout fallback fixture matches schema");
}

function testEndgameQuarantineFixture(): void {
  const fixture = loadFixture("endgame_quarantined.json") as Record<string, unknown>;
  assertEndgameResponse(fixture);
  if (fixture["provider_status"] !== "quarantined") {
    throw new Error(`Expected provider_status=quarantined`);
  }
  console.log("  PASS: Endgame quarantined fixture matches schema");
}

// --- Live engine tests (skipped if ENGINE_URL not set) ---

async function testLiveMoveSelection(): Promise<void> {
  if (!ENGINE_URL) {
    console.log("  SKIP: testLiveMoveSelection (ENGINE_URL not set)");
    return;
  }
  const request = loadFixture("move_request_valid.json");
  const res = await fetch(`${ENGINE_URL}/v1/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (res.status === 200) {
    const body = (await res.json()) as Record<string, unknown>;
    assertMoveResponse(body);
    console.log(`  PASS: testLiveMoveSelection → move=${body["move"]}`);
  } else if (res.status === 504) {
    const body = (await res.json()) as Record<string, unknown>;
    assertTimeoutResponse(body);
    console.log(`  PASS: testLiveMoveSelection → timeout (depth=${body["depth_reached"]})`);
  } else {
    throw new Error(`Unexpected status ${res.status} from /v1/move`);
  }
}

async function testLiveHealthCheck(): Promise<void> {
  if (!ENGINE_URL) {
    console.log("  SKIP: testLiveHealthCheck (ENGINE_URL not set)");
    return;
  }
  const res = await fetch(`${ENGINE_URL}/v1/health`);
  if (res.status !== 200 && res.status !== 503) {
    throw new Error(`/v1/health returned unexpected status ${res.status}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  assertContractVersion(body, "HealthResponse");
  const validStatuses = ["ok", "degraded"];
  if (!validStatuses.includes(body["status"] as string)) {
    throw new Error(`HealthResponse: 'status' must be one of ${validStatuses.join(", ")}`);
  }
  console.log(`  PASS: testLiveHealthCheck → status=${body["status"]}`);
}

// --- Runner ---

async function main(): Promise<void> {
  console.log("=== Contract v1 Conformance Tests ===\n");

  let passed = 0;
  let failed = 0;

  const tests: Array<() => void | Promise<void>> = [
    testMoveResponseFixture,
    testTimeoutResponseFixture,
    testErrorUnavailableFixture,
    testErrorInvalidInputFixture,
    testEndgameTimeoutFallbackFixture,
    testEndgameQuarantineFixture,
    testLiveMoveSelection,
    testLiveHealthCheck,
  ];

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (err) {
      console.error(`  FAIL: ${test.name} — ${(err as Error).message}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Conformance runner error:", err);
  process.exit(1);
});
