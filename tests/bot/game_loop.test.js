"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { inferTurnFromMoves, extractLegalMovesFromEvent, runSingleGame } = require("../../src/bot/game_loop");

test("fallbackOpeningMove is not exported (no fixed e2e4 path)", () => {
  const exports = require("../../src/bot/game_loop");
  assert.equal(exports.fallbackOpeningMove, undefined);
});

test("inferTurnFromMoves tracks side to move from ply count", () => {
  assert.equal(inferTurnFromMoves(""), "white");
  assert.equal(inferTurnFromMoves("e2e4"), "black");
  assert.equal(inferTurnFromMoves("e2e4 e7e5"), "white");
});

test("extractLegalMovesFromEvent handles array and string", () => {
  assert.deepEqual(extractLegalMovesFromEvent({ legalMoves: ["e2e4", "d2d4"] }), ["e2e4", "d2d4"]);
  assert.deepEqual(extractLegalMovesFromEvent({ legalMoves: "e2e4 d2d4" }), ["e2e4", "d2d4"]);
});

test("runSingleGame submits a move and stops on terminal state", async () => {
  const moves = [];
  const events = [
    { type: "gameState", moves: "", status: "started", legalMoves: ["e2e4"] },
    { type: "gameState", moves: "e2e4", status: "mate", winner: "white" },
  ];

  const client = {
    async *streamGame() {
      for (const event of events) {
        yield event;
      }
    },
    async makeMove(_gameId, move) {
      moves.push(move);
      return true;
    },
  };

  const decisionPolicy = {
    decide() {
      return { move: "e2e4", latencyMs: 2, source: "baseline" };
    },
  };

  const logger = { info: () => {}, warn: () => {} };

  const outcome = await runSingleGame({
    client,
    decisionPolicy,
    logger,
    gameId: "g1",
    botColor: "white",
    moveLatencyBudgetMs: 200,
  });

  assert.deepEqual(moves, ["e2e4"]);
  assert.equal(outcome.terminal, true);
});

test("runSingleGame skips and warns when legalMoves is empty (no fallback submitted)", async () => {
  const moves = [];
  const warnings = [];
  const events = [
    { type: "gameState", moves: "", status: "started", legalMoves: [] },
    { type: "gameState", moves: "", status: "aborted" },
  ];

  const client = {
    async *streamGame() {
      for (const event of events) {
        yield event;
      }
    },
    async makeMove(_gameId, move) {
      moves.push(move);
      return true;
    },
  };

  const decisionPolicy = {
    decide() {
      throw new Error("should not be called when legalMoves is empty");
    },
  };

  const logger = {
    info: () => {},
    warn: (msg) => warnings.push(msg),
  };

  await runSingleGame({
    client,
    decisionPolicy,
    logger,
    gameId: "g2",
    botColor: "white",
    moveLatencyBudgetMs: 200,
  });

  assert.equal(moves.length, 0, "no move should be submitted when legalMoves is empty");
  assert.ok(warnings.some((w) => w.includes("no legalMoves")), "should warn about missing legalMoves");
});

test("runSingleGame skips and warns when policy returns an illegal move", async () => {
  const moves = [];
  const warnings = [];
  const events = [
    { type: "gameState", moves: "", status: "started", legalMoves: ["d2d4", "c2c4"] },
    { type: "gameState", moves: "d2d4", status: "mate", winner: "white" },
  ];

  const client = {
    async *streamGame() {
      for (const event of events) {
        yield event;
      }
    },
    async makeMove(_gameId, move) {
      moves.push(move);
      return true;
    },
  };

  const decisionPolicy = {
    decide() {
      return { move: "e2e4", latencyMs: 1, source: "baseline" };
    },
  };

  const logger = {
    info: () => {},
    warn: (msg) => warnings.push(msg),
  };

  await runSingleGame({
    client,
    decisionPolicy,
    logger,
    gameId: "g3",
    botColor: "white",
    moveLatencyBudgetMs: 200,
  });

  assert.equal(moves.length, 0, "illegal move from policy must not be submitted");
  assert.ok(warnings.some((w) => w.includes("illegal move")), "should warn about illegal move");
});
