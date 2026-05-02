"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { evaluateChallenge, parseBoolean, parseOptionalNumber } = require("../../src/bot/main");

test("parseBoolean honors explicit true/false and defaults", () => {
  assert.equal(parseBoolean(undefined, false), false);
  assert.equal(parseBoolean(undefined, true), true);
  assert.equal(parseBoolean("true", false), true);
  assert.equal(parseBoolean("TRUE", false), true);
  assert.equal(parseBoolean("false", true), false);
});

test("parseOptionalNumber returns positive numbers or null", () => {
  assert.equal(parseOptionalNumber(undefined), null);
  assert.equal(parseOptionalNumber(""), null);
  assert.equal(parseOptionalNumber("60"), 60);
  assert.equal(parseOptionalNumber("0"), null);
  assert.equal(parseOptionalNumber("abc"), null);
});

test("evaluateChallenge ignores malformed challenge payload", () => {
  assert.deepEqual(evaluateChallenge({}, { hasActiveGame: false, acceptRated: false, maxClockSeconds: null }), {
    action: "ignore",
    reason: "missing-id",
  });
});

test("evaluateChallenge declines while active game is running", () => {
  assert.deepEqual(
    evaluateChallenge(
      { id: "c1", rated: false, timeControl: { limit: 60 } },
      { hasActiveGame: true, acceptRated: true, maxClockSeconds: null }
    ),
    { action: "decline", reason: "later" }
  );
});

test("evaluateChallenge enforces rated and clock policy", () => {
  assert.deepEqual(
    evaluateChallenge(
      { id: "c2", rated: true, timeControl: { limit: 60 } },
      { hasActiveGame: false, acceptRated: false, maxClockSeconds: null }
    ),
    { action: "decline", reason: "rated" }
  );

  assert.deepEqual(
    evaluateChallenge(
      { id: "c3", rated: false, timeControl: { limit: 300 } },
      { hasActiveGame: false, acceptRated: true, maxClockSeconds: 120 }
    ),
    { action: "decline", reason: "timeControl" }
  );
});

test("evaluateChallenge accepts compliant challenge", () => {
  assert.deepEqual(
    evaluateChallenge(
      { id: "c4", rated: false, timeControl: { limit: 60 } },
      { hasActiveGame: false, acceptRated: false, maxClockSeconds: 120 }
    ),
    { action: "accept" }
  );
});
