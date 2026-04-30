"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { EvalMode, assertValidEvalResult } = require("../../src/evaluation/contract");
const { ClassicEvaluatorAdapter } = require("../../src/evaluation/classic_adapter");
const { EvalModeRegistry } = require("../../src/evaluation/mode_registry");

test("classic adapter preserves baseline score semantics", () => {
  const adapter = new ClassicEvaluatorAdapter({
    evaluateClassic: () => ({ scoreCp: 34, traceId: "eval-1" }),
  });

  const result = adapter.evaluate({ fen: "8/8/8/8/8/8/4K3/4k3 w - - 0 1" }, { requestId: "req-1" });

  assert.equal(result.mode, EvalMode.CLASSIC);
  assert.equal(result.scoreCp, 34);
  assert.equal(result.traceId, "eval-1");
  assert.equal(result.diagnostics.parity, true);
});

test("validator rejects non-integer score output", () => {
  assert.throws(() => {
    assertValidEvalResult({ scoreCp: 1.5 });
  }, /scoreCp/);
});

test("mode registry defaults to classic", () => {
  const registry = new EvalModeRegistry();
  const result = registry.resolve(undefined, { nnueAvailable: true });
  assert.equal(result.mode, EvalMode.CLASSIC);
  assert.equal(result.fallbackReason, null);
});

test("mode registry falls back to classic when nnue unavailable", () => {
  const registry = new EvalModeRegistry();
  const result = registry.resolve(EvalMode.NNUE_READY, { nnueAvailable: false });
  assert.equal(result.mode, EvalMode.CLASSIC);
  assert.ok(result.fallbackReason);
});

test("mode registry enables nnue_ready and hybrid with capabilities", () => {
  const registry = new EvalModeRegistry();
  assert.equal(registry.resolve(EvalMode.NNUE_READY, { nnueAvailable: true }).mode, EvalMode.NNUE_READY);
  assert.equal(
    registry.resolve(EvalMode.HYBRID, { nnueAvailable: true, hybridEnabled: true }).mode,
    EvalMode.HYBRID
  );
});
