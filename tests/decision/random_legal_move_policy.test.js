"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { RandomLegalMovePolicy } = require("../../src/decision/random_legal_move_policy");

test("policy picks from provided legal moves and returns decision metadata", () => {
  const policy = new RandomLegalMovePolicy({
    rng: () => 0.0,
    now: (() => {
      let t = 10;
      return () => t++;
    })(),
  });

  const result = policy.decide({ legalMoves: ["e2e4", "d2d4"] });

  assert.equal(result.move, "e2e4");
  assert.equal(result.source, "baseline");
  assert.equal(typeof result.latencyMs, "number");
  assert.ok(result.latencyMs >= 0);
});

test("policy throws when legal moves are missing", () => {
  const policy = new RandomLegalMovePolicy();
  assert.throws(() => policy.decide({ legalMoves: [] }), /legalMoves/);
});
