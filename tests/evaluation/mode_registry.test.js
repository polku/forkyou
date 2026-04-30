"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { EvalMode } = require("../../src/evaluation/contract");
const { EvalModeRegistry, FALLBACK_REASONS } = require("../../src/evaluation/mode_registry");

// --- Mode selection ---

test("classic mode resolves directly with no fallback", () => {
  const registry = new EvalModeRegistry();
  const result = registry.resolve(EvalMode.CLASSIC, {});
  assert.equal(result.mode, EvalMode.CLASSIC);
  assert.equal(result.fallbackReason, null);
});

test("nnue_ready resolves when nnueAvailable is true", () => {
  const registry = new EvalModeRegistry();
  const result = registry.resolve(EvalMode.NNUE_READY, { nnueAvailable: true });
  assert.equal(result.mode, EvalMode.NNUE_READY);
  assert.equal(result.fallbackReason, null);
});

test("hybrid resolves when hybridEnabled and nnueAvailable are both true", () => {
  const registry = new EvalModeRegistry();
  const result = registry.resolve(EvalMode.HYBRID, { hybridEnabled: true, nnueAvailable: true });
  assert.equal(result.mode, EvalMode.HYBRID);
  assert.equal(result.fallbackReason, null);
});

// --- Default mode from config ---

test("undefined requestedMode uses defaultMode from constructor", () => {
  const registry = new EvalModeRegistry({ defaultMode: EvalMode.CLASSIC });
  const result = registry.resolve(undefined, {});
  assert.equal(result.mode, EvalMode.CLASSIC);
});

test("defaultMode nnue_ready resolves when capabilities met", () => {
  const registry = new EvalModeRegistry({ defaultMode: EvalMode.NNUE_READY });
  const result = registry.resolve(undefined, { nnueAvailable: true });
  assert.equal(result.mode, EvalMode.NNUE_READY);
  assert.equal(result.fallbackReason, null);
});

test("defaultMode nnue_ready falls back when capabilities not met", () => {
  const registry = new EvalModeRegistry({ defaultMode: EvalMode.NNUE_READY });
  const result = registry.resolve(undefined, { nnueAvailable: false });
  assert.equal(result.mode, EvalMode.CLASSIC);
  assert.equal(result.fallbackReason, FALLBACK_REASONS.NNUE_UNAVAILABLE);
});

// --- Fallback behavior with explicit reasons ---

test("nnue_ready falls back with NNUE_UNAVAILABLE reason when nnue missing", () => {
  const registry = new EvalModeRegistry();
  const result = registry.resolve(EvalMode.NNUE_READY, { nnueAvailable: false });
  assert.equal(result.mode, EvalMode.CLASSIC);
  assert.equal(result.fallbackReason, FALLBACK_REASONS.NNUE_UNAVAILABLE);
});

test("nnue_ready falls back when capabilities is empty", () => {
  const registry = new EvalModeRegistry();
  const result = registry.resolve(EvalMode.NNUE_READY, {});
  assert.equal(result.mode, EvalMode.CLASSIC);
  assert.equal(result.fallbackReason, FALLBACK_REASONS.NNUE_UNAVAILABLE);
});

test("hybrid falls back with HYBRID_NNUE_UNAVAILABLE when nnue missing", () => {
  const registry = new EvalModeRegistry();
  const result = registry.resolve(EvalMode.HYBRID, { hybridEnabled: true, nnueAvailable: false });
  assert.equal(result.mode, EvalMode.CLASSIC);
  assert.equal(result.fallbackReason, FALLBACK_REASONS.HYBRID_NNUE_UNAVAILABLE);
});

test("hybrid falls back with HYBRID_DISABLED when nnue available but hybrid not enabled", () => {
  const registry = new EvalModeRegistry();
  const result = registry.resolve(EvalMode.HYBRID, { hybridEnabled: false, nnueAvailable: true });
  assert.equal(result.mode, EvalMode.CLASSIC);
  assert.equal(result.fallbackReason, FALLBACK_REASONS.HYBRID_DISABLED);
});

test("hybrid falls back with HYBRID_NNUE_UNAVAILABLE when both missing (nnue checked first)", () => {
  const registry = new EvalModeRegistry();
  const result = registry.resolve(EvalMode.HYBRID, {});
  assert.equal(result.mode, EvalMode.CLASSIC);
  assert.equal(result.fallbackReason, FALLBACK_REASONS.HYBRID_NNUE_UNAVAILABLE);
});

test("unknown mode falls back with UNKNOWN_MODE reason", () => {
  const registry = new EvalModeRegistry();
  const result = registry.resolve("quantum_eval", {});
  assert.equal(result.mode, EvalMode.CLASSIC);
  assert.equal(result.fallbackReason, FALLBACK_REASONS.UNKNOWN_MODE);
});

// --- Logger integration ---

test("logger.warn is called on fallback with reason and requested mode", () => {
  const warnings = [];
  const logger = { warn: (msg) => warnings.push(msg) };
  const registry = new EvalModeRegistry({ logger });

  registry.resolve(EvalMode.NNUE_READY, { nnueAvailable: false });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /nnue_ready/);
  assert.match(warnings[0], /nnue_unavailable/);
});

test("logger.warn is not called when mode resolves without fallback", () => {
  const warnings = [];
  const logger = { warn: (msg) => warnings.push(msg) };
  const registry = new EvalModeRegistry({ logger });

  registry.resolve(EvalMode.CLASSIC, {});
  registry.resolve(EvalMode.NNUE_READY, { nnueAvailable: true });
  registry.resolve(EvalMode.HYBRID, { hybridEnabled: true, nnueAvailable: true });

  assert.equal(warnings.length, 0);
});

test("logger.warn called once per fallback call, not accumulating", () => {
  const warnings = [];
  const logger = { warn: (msg) => warnings.push(msg) };
  const registry = new EvalModeRegistry({ logger });

  registry.resolve(EvalMode.HYBRID, { nnueAvailable: false });
  registry.resolve(EvalMode.NNUE_READY, {});

  assert.equal(warnings.length, 2);
});

test("no logger option is safe — fallback works without logging", () => {
  const registry = new EvalModeRegistry();
  assert.doesNotThrow(() => {
    const result = registry.resolve(EvalMode.NNUE_READY, { nnueAvailable: false });
    assert.equal(result.mode, EvalMode.CLASSIC);
  });
});

// --- Determinism ---

test("resolution is deterministic: same inputs always produce same output", () => {
  const registry = new EvalModeRegistry();
  const inputs = [
    [EvalMode.NNUE_READY, { nnueAvailable: true }],
    [EvalMode.NNUE_READY, { nnueAvailable: false }],
    [EvalMode.HYBRID, { hybridEnabled: true, nnueAvailable: true }],
    [EvalMode.HYBRID, {}],
    [EvalMode.CLASSIC, {}],
  ];

  for (const [mode, caps] of inputs) {
    const r1 = registry.resolve(mode, caps);
    const r2 = registry.resolve(mode, caps);
    assert.deepEqual(r1, r2);
  }
});
