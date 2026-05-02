"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  evaluateChallenge,
  extractComparableRating,
  maybeStartOutboundChallenge,
  parseBoolean,
  parseOptionalNumber,
  rankBotsByRating,
  computeChallengeCooldownMs,
  selectClosestBot,
} = require("../../src/bot/main");

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

test("extractComparableRating picks supported perf buckets", () => {
  assert.equal(extractComparableRating({ blitz: { rating: 1600 } }), 1600);
  assert.equal(extractComparableRating({ rapid: { rating: 1700 } }), 1700);
  assert.equal(extractComparableRating({}), null);
});

test("selectClosestBot chooses non-self nearest rating", () => {
  const me = { username: "mybot", perfs: { blitz: { rating: 1500 } } };
  const online = [
    { username: "mybot", perfs: { blitz: { rating: 1500 } } },
    { username: "botA", perfs: { blitz: { rating: 1490 } } },
    { username: "botB", perfs: { blitz: { rating: 1800 } } },
  ];
  assert.equal(selectClosestBot(online, me), "botA");
});

test("maybeStartOutboundChallenge creates challenge when eligible", async () => {
  const calls = [];
  const client = {
    async getAccount() {
      calls.push("getAccount");
      return { username: "mybot", perfs: { blitz: { rating: 1500 } } };
    },
    async getOnlineBots() {
      calls.push("getOnlineBots");
      return [{ username: "botA", perfs: { blitz: { rating: 1510 } } }];
    },
    async createChallenge(username, options) {
      calls.push(["createChallenge", username, options.clockLimitSeconds]);
      return { challenge: { id: "c1" } };
    },
  };
  const logs = [];
  const logger = { info: (msg) => logs.push(msg), warn: (msg) => logs.push(msg) };
  const state = {
    hasActiveGame: false,
    targetGamesReached: false,
    pendingOutboundChallenge: false,
    opponentCooldownUntil: new Map(),
    me: null,
  };

  await maybeStartOutboundChallenge({
    client,
    logger,
    state,
    challengeOptions: { rated: false, clockLimitSeconds: 60, clockIncrementSeconds: 0 },
  });

  assert.deepEqual(calls[0], "getAccount");
  assert.deepEqual(calls[1], "getOnlineBots");
  assert.equal(calls[2][0], "createChallenge");
  assert.equal(calls[2][1], "botA");
  assert.equal(state.pendingOutboundChallenge, false);
  assert.ok(logs.some((l) => l.includes("Challenge created")));
});

test("rankBotsByRating orders opponents by closest rating", () => {
  const me = { username: "mybot", perfs: { blitz: { rating: 1500 } } };
  const ranked = rankBotsByRating(
    [
      { username: "mybot", perfs: { blitz: { rating: 1500 } } },
      { username: "far", perfs: { blitz: { rating: 1900 } } },
      { username: "near", perfs: { blitz: { rating: 1510 } } },
    ],
    me
  );
  assert.deepEqual(ranked, ["near", "far"]);
});

test("computeChallengeCooldownMs uses ratelimit seconds when present", () => {
  assert.equal(computeChallengeCooldownMs({ details: { ratelimit: { seconds: 30 } } }), 30000);
  assert.equal(computeChallengeCooldownMs({}), 300000);
});

test("maybeStartOutboundChallenge retries with next opponent after rate-limit failure", async () => {
  const client = {
    async getAccount() {
      return { username: "mybot", perfs: { blitz: { rating: 1500 } } };
    },
    async getOnlineBots() {
      return [
        { username: "botA", perfs: { blitz: { rating: 1501 } } },
        { username: "botB", perfs: { blitz: { rating: 1502 } } },
      ];
    },
    async createChallenge(username) {
      if (username === "botA") {
        const err = new Error("challenge create failed (400): rate");
        err.details = { ratelimit: { seconds: 10 } };
        throw err;
      }
      return { challenge: { id: "ok" } };
    },
  };
  const logger = { info: () => {}, warn: () => {} };
  const state = {
    hasActiveGame: false,
    targetGamesReached: false,
    pendingOutboundChallenge: false,
    opponentCooldownUntil: new Map(),
    me: null,
  };

  await maybeStartOutboundChallenge({
    client,
    logger,
    state,
    challengeOptions: { rated: false, clockLimitSeconds: 60, clockIncrementSeconds: 0 },
  });

  assert.ok(state.opponentCooldownUntil.get("botA") > Date.now());
});
