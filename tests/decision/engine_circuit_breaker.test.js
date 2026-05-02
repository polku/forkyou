"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { EngineCircuitBreaker, CircuitState } = require("../../src/decision/engine_circuit_breaker");
const { DecisionSource } = require("../../src/decision/contract");

const LEGAL_MOVES = ["e2e4", "d2d4", "g1f3"];
const BASE_CONTEXT = { legalMoves: LEGAL_MOVES, fen: "startpos" };

function makePolicy(source) {
  return {
    decide: async () => ({ move: LEGAL_MOVES[0], latencyMs: 1, source }),
  };
}

function makeFallbackPolicy() {
  return {
    decide: () => ({ move: LEGAL_MOVES[1], latencyMs: 0, source: DecisionSource.BASELINE }),
  };
}

function makeFailingPolicy() {
  return {
    decide: async () => { throw new Error("engine unavailable"); },
  };
}

test("starts CLOSED and delegates to primary on success", async () => {
  const primary = makePolicy(DecisionSource.UCI);
  const cb = new EngineCircuitBreaker({ primary, fallback: makeFallbackPolicy(), threshold: 3 });

  const result = await cb.decide(BASE_CONTEXT);

  assert.equal(result.source, DecisionSource.UCI);
  assert.equal(cb.state, CircuitState.CLOSED);
  assert.equal(cb.consecutiveFailures, 0);
});

test("increments consecutiveFailures when primary returns fallback source", async () => {
  const primary = makePolicy(DecisionSource.UCI_FALLBACK);
  const cb = new EngineCircuitBreaker({ primary, fallback: makeFallbackPolicy(), threshold: 3 });

  await cb.decide(BASE_CONTEXT);
  assert.equal(cb.consecutiveFailures, 1);
  assert.equal(cb.state, CircuitState.CLOSED);

  await cb.decide(BASE_CONTEXT);
  assert.equal(cb.consecutiveFailures, 2);
  assert.equal(cb.state, CircuitState.CLOSED);
});

test("opens circuit after threshold consecutive fallbacks", async () => {
  const primary = makePolicy(DecisionSource.UCI_FALLBACK);
  const logs = [];
  const logger = { info: (m) => logs.push(m), warn: (m) => logs.push(m) };
  const cb = new EngineCircuitBreaker({ primary, fallback: makeFallbackPolicy(), threshold: 3, logger });

  for (let i = 0; i < 3; i++) {
    await cb.decide(BASE_CONTEXT);
  }

  assert.equal(cb.state, CircuitState.OPEN);
  assert.ok(logs.some((m) => m.includes("OPEN")));
});

test("OPEN circuit bypasses primary and uses fallback directly", async () => {
  const primary = makePolicy(DecisionSource.UCI_FALLBACK);
  const fallback = makeFallbackPolicy();
  let primaryCalls = 0;
  const spy = { decide: async (ctx) => { primaryCalls += 1; return primary.decide(ctx); } };

  const now = (() => { let t = 0; return () => t; })();
  const cb = new EngineCircuitBreaker({ primary: spy, fallback, threshold: 2, recoveryDelayMs: 60000, now });

  await cb.decide(BASE_CONTEXT);
  await cb.decide(BASE_CONTEXT);
  assert.equal(cb.state, CircuitState.OPEN);

  const callsBefore = primaryCalls;
  const result = await cb.decide(BASE_CONTEXT);
  assert.equal(primaryCalls, callsBefore, "primary must not be called in OPEN state");
  assert.equal(result.source, DecisionSource.BASELINE);
});

test("enters HALF_OPEN after recoveryDelayMs and closes on primary success", async () => {
  const primary = makePolicy(DecisionSource.UCI_FALLBACK);
  let tick = 0;
  const now = () => tick;
  const cb = new EngineCircuitBreaker({ primary, fallback: makeFallbackPolicy(), threshold: 2, recoveryDelayMs: 1000, now });

  tick = 0;
  await cb.decide(BASE_CONTEXT);
  await cb.decide(BASE_CONTEXT);
  assert.equal(cb.state, CircuitState.OPEN);

  tick = 1001;
  // Now replace primary with a succeeding one
  cb.primary = makePolicy(DecisionSource.UCI);

  const result = await cb.decide(BASE_CONTEXT);
  assert.equal(result.source, DecisionSource.UCI);
  assert.equal(cb.state, CircuitState.CLOSED);
  assert.equal(cb.consecutiveFailures, 0);
});

test("returns to OPEN when recovery attempt fails in HALF_OPEN", async () => {
  let tick = 0;
  const now = () => tick;
  const primary = makePolicy(DecisionSource.UCI_FALLBACK);
  const cb = new EngineCircuitBreaker({ primary, fallback: makeFallbackPolicy(), threshold: 2, recoveryDelayMs: 1000, now });

  tick = 0;
  await cb.decide(BASE_CONTEXT);
  await cb.decide(BASE_CONTEXT);
  assert.equal(cb.state, CircuitState.OPEN);

  tick = 1001;
  await cb.decide(BASE_CONTEXT);
  assert.equal(cb.state, CircuitState.OPEN);
});

test("resets consecutiveFailures after primary success following failures", async () => {
  let succeedNext = false;
  const primary = {
    decide: async () => ({
      move: LEGAL_MOVES[0],
      latencyMs: 1,
      source: succeedNext ? DecisionSource.UCI : DecisionSource.UCI_FALLBACK,
    }),
  };
  const cb = new EngineCircuitBreaker({ primary, fallback: makeFallbackPolicy(), threshold: 10 });

  await cb.decide(BASE_CONTEXT);
  await cb.decide(BASE_CONTEXT);
  assert.equal(cb.consecutiveFailures, 2);

  succeedNext = true;
  await cb.decide(BASE_CONTEXT);
  assert.equal(cb.consecutiveFailures, 0);
  assert.equal(cb.state, CircuitState.CLOSED);
});

test("throws when constructed without primary or fallback", () => {
  assert.throws(
    () => new EngineCircuitBreaker({ fallback: makeFallbackPolicy() }),
    /primary policy/
  );
  assert.throws(
    () => new EngineCircuitBreaker({ primary: makePolicy(DecisionSource.UCI) }),
    /fallback policy/
  );
});

test("close() delegates to primary.close if present", async () => {
  let closed = false;
  const primary = { decide: async () => ({ move: LEGAL_MOVES[0], latencyMs: 1, source: DecisionSource.UCI }), close: async () => { closed = true; } };
  const cb = new EngineCircuitBreaker({ primary, fallback: makeFallbackPolicy() });

  await cb.close();
  assert.ok(closed);
});
