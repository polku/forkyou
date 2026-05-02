"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { DecisionSource, assertValidDecisionResult } = require("../../src/decision/contract");
const { BaselineMovePolicy } = require("../../src/decision/baseline_policy");
const { MoveDecisionConnector } = require("../../src/decision/api_connector");

// --- Interface contract ---

test("assertValidDecisionResult rejects non-object result", () => {
  assert.throws(() => assertValidDecisionResult(null), /invalid result object/);
  assert.throws(() => assertValidDecisionResult("e2e4"), /invalid result object/);
});

test("assertValidDecisionResult rejects empty-string move", () => {
  assert.throws(
    () => assertValidDecisionResult({ move: "", source: "baseline", latencyMs: 0 }),
    /non-empty string move/
  );
});

test("assertValidDecisionResult rejects non-finite latencyMs", () => {
  assert.throws(
    () => assertValidDecisionResult({ move: "e2e4", source: "baseline", latencyMs: NaN }),
    /finite number latencyMs/
  );
  assert.throws(
    () => assertValidDecisionResult({ move: "e2e4", source: "baseline", latencyMs: Infinity }),
    /finite number latencyMs/
  );
});

test("assertValidDecisionResult rejects missing source", () => {
  assert.throws(
    () => assertValidDecisionResult({ move: "e2e4", latencyMs: 0 }),
    /non-empty string source/
  );
});

test("assertValidDecisionResult accepts valid result", () => {
  assert.doesNotThrow(() =>
    assertValidDecisionResult({ move: "e2e4", source: "baseline", latencyMs: 1 })
  );
});

test("DecisionSource.BASELINE is defined", () => {
  assert.equal(DecisionSource.BASELINE, "baseline");
  assert.equal(DecisionSource.UCI, "uci");
  assert.equal(DecisionSource.UCI_FALLBACK, "uci_fallback");
});

// --- BaselineMovePolicy ---

test("baseline policy selects first legal move deterministically", () => {
  const policy = new BaselineMovePolicy();
  const result = policy.selectMove({ legalMoves: ["e2e4", "d2d4", "g1f3"], requestId: "req-1" });
  assert.equal(result.move, "e2e4");
  assert.equal(result.source, DecisionSource.BASELINE);
  assert.equal(result.traceId, "req-1");
});

test("baseline policy selects same first move regardless of call count", () => {
  const policy = new BaselineMovePolicy();
  const moves = ["a2a4", "b2b4", "c2c4"];
  const r1 = policy.selectMove({ legalMoves: moves });
  const r2 = policy.selectMove({ legalMoves: moves });
  assert.equal(r1.move, r2.move);
  assert.equal(r1.move, "a2a4");
});

test("baseline policy in random mode selects from legal moves", () => {
  let callCount = 0;
  const rngValues = [0.9, 0.1, 0.5];
  const policy = new BaselineMovePolicy({
    random: true,
    rng: () => rngValues[callCount++ % rngValues.length],
  });
  const moves = ["a2a4", "b2b4", "c2c4"];

  const r0 = policy.selectMove({ legalMoves: moves });
  assert.equal(r0.move, "c2c4"); // floor(0.9 * 3) = 2

  const r1 = policy.selectMove({ legalMoves: moves });
  assert.equal(r1.move, "a2a4"); // floor(0.1 * 3) = 0
});

test("baseline policy throws on empty legalMoves", () => {
  const policy = new BaselineMovePolicy();
  assert.throws(() => policy.selectMove({ legalMoves: [] }), /non-empty legalMoves/);
});

test("baseline policy throws on missing legalMoves", () => {
  const policy = new BaselineMovePolicy();
  assert.throws(() => policy.selectMove({}), /non-empty legalMoves/);
});

test("baseline policy result conforms to interface contract", () => {
  const policy = new BaselineMovePolicy();
  const result = policy.selectMove({ legalMoves: ["e2e4"], requestId: "trace-abc" });
  assert.doesNotThrow(() => assertValidDecisionResult(result));
  assert.equal(typeof result.latencyMs, "number");
  assert.ok(Number.isFinite(result.latencyMs));
  assert.equal(result.traceId, "trace-abc");
});

test("baseline policy latencyMs is bounded (sub-millisecond for O(1) selection)", () => {
  const policy = new BaselineMovePolicy({ now: (() => { let t = 0; return () => t++; })() });
  const result = policy.selectMove({ legalMoves: ["e2e4", "d2d4"] });
  assert.ok(result.latencyMs < 10, `latencyMs=${result.latencyMs} exceeds O(1) bound`);
});

test("baseline policy accepts custom policyId", () => {
  const policy = new BaselineMovePolicy({ policyId: "custom-baseline" });
  const result = policy.selectMove({ legalMoves: ["e2e4"] });
  assert.equal(result.source, "custom-baseline");
});

// --- MoveDecisionConnector ---

test("connector construction fails without policy", () => {
  assert.throws(() => new MoveDecisionConnector({}), /requires a policy/);
  assert.throws(() => new MoveDecisionConnector({ policy: {} }), /requires a policy/);
});

test("connector decide() delegates to policy and returns move", async () => {
  const policy = new BaselineMovePolicy();
  const connector = new MoveDecisionConnector({ policy });

  const result = await connector.decide({
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    legalMoves: ["e7e5", "e7e6", "d7d5"],
    observability: {
      request_id: "req-connector-1",
      trace_id: "trace-001",
      correlation_id: "corr-001",
    },
  });

  assert.equal(result.move, "e7e5");
  assert.equal(result.source, DecisionSource.BASELINE);
  assert.equal(result.traceId, "req-connector-1");
  assert.equal(typeof result.latencyMs, "number");
});

test("connector decide() forwards observability request_id as traceId", async () => {
  const policy = new BaselineMovePolicy();
  const connector = new MoveDecisionConnector({ policy });

  const result = await connector.decide({
    fen: "8/8/8/8/8/8/4K3/4k3 w - - 0 1",
    legalMoves: ["e2e3"],
    observability: { request_id: "req-trace-test", trace_id: "t", correlation_id: "c" },
  });

  assert.equal(result.traceId, "req-trace-test");
});

test("connector decide() works without observability context", async () => {
  const policy = new BaselineMovePolicy();
  const connector = new MoveDecisionConnector({ policy });

  const result = await connector.decide({
    fen: "8/8/8/8/8/8/4K3/4k3 w - - 0 1",
    legalMoves: ["e2e3", "e2e4"],
  });

  assert.equal(result.move, "e2e3");
  assert.equal(result.traceId, null);
});

test("connector is swappable: different policies return different moves", async () => {
  const legalMoves = ["a1a2", "b1b2", "c1c2"];

  const deterministicPolicy = new BaselineMovePolicy({ random: false });
  const fixedRandomPolicy = new BaselineMovePolicy({
    random: true,
    rng: () => 0.99,
  });

  const deterministicConnector = new MoveDecisionConnector({ policy: deterministicPolicy });
  const randomConnector = new MoveDecisionConnector({ policy: fixedRandomPolicy });

  const r1 = await deterministicConnector.decide({ legalMoves });
  const r2 = await randomConnector.decide({ legalMoves });

  assert.equal(r1.move, "a1a2");
  assert.equal(r2.move, "c1c2"); // floor(0.99 * 3) = 2
});
