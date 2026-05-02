"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { computeMoveBudget } = require("../../src/decision/time_manager");

test("computeMoveBudget keeps non-zero think time in low-time scenarios", () => {
  const budget = computeMoveBudget({
    botColor: "white",
    moves: "e2e4 e7e5",
    state: { wtime: 140, winc: 0, btime: 10000, binc: 0 },
    config: { reserveMs: 200, minThinkMs: 25, maxThinkMs: 1000 },
  });

  assert.equal(budget, 25);
});

test("computeMoveBudget uses increment to expand budget", () => {
  const budget = computeMoveBudget({
    botColor: "black",
    moves: "e2e4 e7e5 g1f3 b8c6",
    state: { wtime: 60000, winc: 0, btime: 60000, binc: 2000 },
    config: {
      minThinkMs: 50,
      maxThinkMs: 3000,
      reserveMs: 200,
      incrementFactor: 0.8,
      openingFraction: 0.04,
    },
  });

  assert.equal(budget, 3000);
});

test("computeMoveBudget handles sudden death without increment", () => {
  const budget = computeMoveBudget({
    botColor: "white",
    moves: "",
    state: { wtime: 30000, winc: 0, btime: 30000, binc: 0 },
    config: {
      minThinkMs: 50,
      maxThinkMs: 5000,
      reserveMs: 200,
      openingFraction: 0.04,
    },
  });

  assert.equal(budget, 1192);
});
