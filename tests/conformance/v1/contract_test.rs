/// Conformance test suite — Contract v1 (engine-compute side)
///
/// These tests validate that the engine-compute service produces responses
/// that match the shapes defined in docs/contracts/v1/openapi.yaml.
///
/// Run: cargo test --test conformance
/// With live server: ENGINE_TEST_ADDR=127.0.0.1:8080 cargo test --test conformance

use serde_json::Value;
use std::fs;
use std::path::Path;

const FIXTURES_DIR: &str = "tests/conformance/v1/fixtures";

fn load_fixture(name: &str) -> Value {
    let path = Path::new(FIXTURES_DIR).join(name);
    let content = fs::read_to_string(&path)
        .unwrap_or_else(|e| panic!("failed to read fixture {name}: {e}"));
    serde_json::from_str(&content)
        .unwrap_or_else(|e| panic!("failed to parse fixture {name}: {e}"))
}

fn assert_contract_version(obj: &Value, label: &str) {
    let version = obj
        .get("_contract_version")
        .and_then(|v| v.as_str())
        .unwrap_or_else(|| panic!("{label}: missing _contract_version field"));
    assert_eq!(
        version, "v1",
        "{label}: expected _contract_version=v1, got {version}"
    );
}

fn assert_move_response(obj: &Value) {
    assert_contract_version(obj, "MoveResponse");
    assert_observability_context(obj, "MoveResponse");
    assert_storage_metadata(obj, "MoveResponse");
    assert!(
        obj.get("move").and_then(|v| v.as_str()).is_some(),
        "MoveResponse: 'move' must be a string"
    );
}

fn assert_timeout_response(obj: &Value) {
    assert_contract_version(obj, "TimeoutResponse");
    assert_observability_context(obj, "TimeoutResponse");
    assert_eq!(
        obj.get("error").and_then(|v| v.as_str()),
        Some("timeout"),
        "TimeoutResponse: 'error' must be \"timeout\""
    );
    assert!(
        obj.get("partial_result").is_some(),
        "TimeoutResponse: 'partial_result' field must be present (nullable)"
    );
    assert!(
        obj.get("depth_reached").and_then(|v| v.as_u64()).is_some(),
        "TimeoutResponse: 'depth_reached' must be a number"
    );
    assert!(
        obj.get("elapsed_ms").and_then(|v| v.as_u64()).is_some(),
        "TimeoutResponse: 'elapsed_ms' must be a number"
    );
}

fn assert_error_response(obj: &Value) {
    assert_contract_version(obj, "ErrorResponse");
    assert_observability_context(obj, "ErrorResponse");
    let valid_errors = [
        "invalid_input",
        "unavailable",
        "timeout",
        "internal_error",
        "dependency_error",
        "rate_limited",
    ];
    let valid_status_codes = [400_u64, 429_u64, 500_u64, 503_u64, 504_u64];
    let error_val = obj
        .get("error")
        .and_then(|v| v.as_str())
        .unwrap_or_else(|| panic!("ErrorResponse: missing 'error' field"));
    assert!(
        valid_errors.contains(&error_val),
        "ErrorResponse: 'error' must be one of {valid_errors:?}, got {error_val}"
    );
    let status_code = obj
        .get("status_code")
        .and_then(|v| v.as_u64())
        .unwrap_or_else(|| panic!("ErrorResponse: missing 'status_code' field"));
    assert!(
        valid_status_codes.contains(&status_code),
        "ErrorResponse: 'status_code' must be one of {valid_status_codes:?}, got {status_code}"
    );
    assert!(
        obj.get("retryable").and_then(|v| v.as_bool()).is_some(),
        "ErrorResponse: 'retryable' must be a boolean"
    );
}

fn assert_observability_context(obj: &Value, label: &str) {
    let obs = obj
        .get("_observability")
        .unwrap_or_else(|| panic!("{label}: missing _observability field"));
    for field in ["request_id", "trace_id", "correlation_id"] {
        let value = obs
            .get(field)
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| panic!("{label}: missing _observability.{field}"));
        assert!(
            !value.is_empty(),
            "{label}: _observability.{field} must be non-empty"
        );
    }
}

fn assert_storage_metadata(obj: &Value, label: &str) {
    let storage = obj
        .get("_storage")
        .unwrap_or_else(|| panic!("{label}: missing _storage field"));
    let owner = storage
        .get("owner")
        .and_then(|v| v.as_str())
        .unwrap_or_else(|| panic!("{label}: missing _storage.owner"));
    assert!(
        ["redis", "postgres", "ephemeral"].contains(&owner),
        "{label}: invalid _storage.owner {owner}"
    );
    let durability = storage
        .get("durability")
        .and_then(|v| v.as_str())
        .unwrap_or_else(|| panic!("{label}: missing _storage.durability"));
    assert!(
        ["volatile", "persistent"].contains(&durability),
        "{label}: invalid _storage.durability {durability}"
    );
    let consistency = storage
        .get("consistency")
        .and_then(|v| v.as_str())
        .unwrap_or_else(|| panic!("{label}: missing _storage.consistency"));
    assert!(
        ["eventual", "strong", "not_applicable"].contains(&consistency),
        "{label}: invalid _storage.consistency {consistency}"
    );
    storage
        .get("invalidation_scope")
        .and_then(|v| v.as_str())
        .unwrap_or_else(|| panic!("{label}: missing _storage.invalidation_scope"));
}

fn assert_endgame_response(obj: &Value) {
    assert_contract_version(obj, "EndgameResponse");
    assert!(
        obj.get("available").and_then(|v| v.as_bool()).is_some(),
        "EndgameResponse: 'available' must be a boolean"
    );

    let provider_states = ["hit", "miss", "timeout", "unavailable", "error", "quarantined"];
    let provider_status = obj
        .get("provider_status")
        .and_then(|v| v.as_str())
        .unwrap_or_else(|| panic!("EndgameResponse: missing 'provider_status' field"));
    assert!(
        provider_states.contains(&provider_status),
        "EndgameResponse: invalid provider_status {provider_status}"
    );

    let fallback_actions = ["none", "search", "opening", "fail_closed"];
    let fallback_action = obj
        .get("fallback_action")
        .and_then(|v| v.as_str())
        .unwrap_or_else(|| panic!("EndgameResponse: missing 'fallback_action' field"));
    assert!(
        fallback_actions.contains(&fallback_action),
        "EndgameResponse: invalid fallback_action {fallback_action}"
    );

    assert!(
        obj.get("retryable").and_then(|v| v.as_bool()).is_some(),
        "EndgameResponse: 'retryable' must be a boolean"
    );

    if provider_status == "quarantined" {
        let quarantine = obj
            .get("quarantine")
            .unwrap_or_else(|| panic!("EndgameResponse: missing 'quarantine' object"));
        assert_eq!(
            quarantine.get("active").and_then(|v| v.as_bool()),
            Some(true),
            "EndgameResponse: quarantine.active must be true when quarantined"
        );
    }
}

// --- Fixture conformance tests ---

#[test]
fn test_move_response_fixture() {
    let fixture = load_fixture("move_response_valid.json");
    assert_move_response(&fixture);
}

#[test]
fn test_timeout_response_fixture() {
    let fixture = load_fixture("timeout_response.json");
    assert_timeout_response(&fixture);
}

#[test]
fn test_error_unavailable_fixture() {
    let fixture = load_fixture("error_unavailable.json");
    assert_error_response(&fixture);
    assert_eq!(
        fixture.get("error").and_then(|v| v.as_str()),
        Some("unavailable")
    );
}

#[test]
fn test_error_invalid_input_fixture() {
    let fixture = load_fixture("error_invalid_input.json");
    assert_error_response(&fixture);
    assert_eq!(
        fixture.get("error").and_then(|v| v.as_str()),
        Some("invalid_input")
    );
}

#[test]
fn test_endgame_timeout_fallback_fixture() {
    let fixture = load_fixture("endgame_fallback_timeout.json");
    assert_endgame_response(&fixture);
    assert_eq!(
        fixture.get("provider_status").and_then(|v| v.as_str()),
        Some("timeout")
    );
    assert_eq!(
        fixture.get("fallback_action").and_then(|v| v.as_str()),
        Some("search")
    );
}

#[test]
fn test_endgame_quarantine_fixture() {
    let fixture = load_fixture("endgame_quarantined.json");
    assert_endgame_response(&fixture);
    assert_eq!(
        fixture.get("provider_status").and_then(|v| v.as_str()),
        Some("quarantined")
    );
}

// --- Live engine tests (skipped if ENGINE_TEST_ADDR not set) ---

#[test]
fn test_live_health_check() {
    let addr = match std::env::var("ENGINE_TEST_ADDR") {
        Ok(a) => a,
        Err(_) => {
            eprintln!("SKIP: ENGINE_TEST_ADDR not set");
            return;
        }
    };

    let url = format!("http://{addr}/v1/health");
    let response = ureq::get(&url)
        .call()
        .unwrap_or_else(|e| panic!("GET /v1/health failed: {e}"));

    let status = response.status();
    assert!(
        status == 200 || status == 503,
        "/v1/health returned unexpected status {status}"
    );

    let body: Value = response
        .into_json()
        .unwrap_or_else(|e| panic!("failed to parse /v1/health response: {e}"));

    assert_contract_version(&body, "HealthResponse");

    let valid_statuses = ["ok", "degraded"];
    let status_val = body
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or_else(|| panic!("HealthResponse: missing 'status' field"));
    assert!(
        valid_statuses.contains(&status_val),
        "HealthResponse: 'status' must be one of {valid_statuses:?}, got {status_val}"
    );
}

#[test]
fn test_live_move_selection_blitz() {
    let addr = match std::env::var("ENGINE_TEST_ADDR") {
        Ok(a) => a,
        Err(_) => {
            eprintln!("SKIP: ENGINE_TEST_ADDR not set");
            return;
        }
    };

    let url = format!("http://{addr}/v1/move");
    let request_body = serde_json::json!({
        "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        "time_control": "blitz",
        "moves_played": 1,
        "remaining_ms": 180000
    });

    let response = ureq::post(&url)
        .set("Content-Type", "application/json")
        .send_json(request_body)
        .unwrap_or_else(|e| panic!("POST /v1/move failed: {e}"));

    let http_status = response.status();
    let body: Value = response
        .into_json()
        .unwrap_or_else(|e| panic!("failed to parse /v1/move response: {e}"));

    match http_status {
        200 => assert_move_response(&body),
        504 => assert_timeout_response(&body),
        _ => panic!("/v1/move returned unexpected status {http_status}"),
    }
}
