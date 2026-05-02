"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { normalizeOutcome } = require("../../src/bot/terminal");

test("normalizeOutcome returns ongoing for non-terminal statuses", () => {
  const outcome = normalizeOutcome("started", undefined, "white");
  assert.equal(outcome.terminal, false);
  assert.equal(outcome.result, "ongoing");
});

test("normalizeOutcome maps mate to loss/win by winner", () => {
  const loss = normalizeOutcome("mate", "black", "white");
  const win = normalizeOutcome("mate", "white", "white");

  assert.equal(loss.terminal, true);
  assert.equal(loss.result, "loss");
  assert.equal(win.result, "win");
});

test("normalizeOutcome maps draw and aborted correctly", () => {
  const draw = normalizeOutcome("draw", undefined, "white");
  const aborted = normalizeOutcome("aborted", undefined, "white");

  assert.equal(draw.result, "draw");
  assert.equal(aborted.result, "aborted");
});
