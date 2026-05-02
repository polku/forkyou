"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  inferTurnFromMoves,
  extractLegalMovesFromEvent,
  computeLegalMovesFromHistory,
  computeFenFromHistory,
  runSingleGame,
} = require("../../src/bot/game_loop");

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

test("computeLegalMovesFromHistory computes legal moves from UCI history", () => {
  const opening = computeLegalMovesFromHistory("e2e4 e7e5");
  assert.ok(opening.length > 0, "should return legal moves after 1.e4 e5");
  assert.ok(opening.includes("g1f3"), "Nf3 should be legal after 1.e4 e5");

  const empty = computeLegalMovesFromHistory("");
  assert.equal(empty.length, 20, "starting position has 20 legal moves");

  const bad = computeLegalMovesFromHistory("z9z9");
  assert.deepEqual(bad, [], "invalid UCI returns empty array");
});

test("computeFenFromHistory computes FEN and returns null for invalid history", () => {
  const fen = computeFenFromHistory("e2e4 e7e5");
  assert.equal(typeof fen, "string");
  assert.ok(fen.startsWith("rnbqkbnr/pppp1ppp"));
  assert.equal(computeFenFromHistory("badmove"), null);
});

test("runSingleGame submits a move and stops on terminal state", async () => {
  const moves = [];
  const events = [
    { type: "gameState", moves: "", status: "started" },
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
    async decide({ legalMoves, fen }) {
      assert.equal(typeof fen, "string");
      const move = legalMoves.includes("e2e4") ? "e2e4" : legalMoves[0];
      return { move, latencyMs: 2, source: "baseline" };
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

test("runSingleGame skips and warns when computeLegalMovesFromHistory returns empty", async () => {
  const moves = [];
  const warnings = [];
  const events = [
    { type: "gameState", moves: "x1x1 y2y2", status: "started" },
    { type: "gameState", moves: "x1x1 y2y2", status: "aborted" },
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
    { type: "gameState", moves: "", status: "started" },
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
      return { move: "a1a1", latencyMs: 1, source: "baseline" };
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

test("runSingleGame handles 'game already over' rejection from makeMove without throwing", async () => {
  const warnings = [];
  const events = [
    { type: "gameState", moves: "", status: "started" },
  ];

  const client = {
    async *streamGame() {
      for (const event of events) {
        yield event;
      }
    },
    async makeMove() {
      throw new Error("move submission failed (400): {\"error\":\"Not your turn, or game already over\"}");
    },
  };

  const decisionPolicy = {
    decide({ legalMoves }) {
      return { move: legalMoves[0], latencyMs: 1, source: "baseline" };
    },
  };

  const logger = {
    info: () => {},
    warn: (msg) => warnings.push(msg),
  };

  const outcome = await runSingleGame({
    client,
    decisionPolicy,
    logger,
    gameId: "g4",
    botColor: "white",
    moveLatencyBudgetMs: 200,
  });

  assert.ok(warnings.some((w) => w.includes("game already over")), "should warn about rejected move");
  assert.equal(outcome.terminal, false, "outcome reflects last seen state before rejection");
});

test("runSingleGame re-throws unexpected makeMove errors", async () => {
  const events = [
    { type: "gameState", moves: "", status: "started" },
  ];

  const client = {
    async *streamGame() {
      for (const event of events) {
        yield event;
      }
    },
    async makeMove() {
      throw new Error("move submission failed (500): internal server error");
    },
  };

  const decisionPolicy = {
    decide({ legalMoves }) {
      return { move: legalMoves[0], latencyMs: 1, source: "baseline" };
    },
  };

  const logger = { info: () => {}, warn: () => {} };

  await assert.rejects(
    () => runSingleGame({ client, decisionPolicy, logger, gameId: "g5", botColor: "white", moveLatencyBudgetMs: 200 }),
    /internal server error/,
    "non-400 errors must propagate"
  );
});

test("runSingleGame passes non-zero think budget to decision policy when clock allows", async () => {
  const events = [
    { type: "gameState", moves: "", status: "started", wtime: 60000, btime: 60000, winc: 1000, binc: 1000 },
    { type: "gameState", moves: "e2e4", status: "resign", winner: "white" },
  ];
  let capturedBudget = 0;

  const client = {
    async *streamGame() {
      for (const event of events) {
        yield event;
      }
    },
    async makeMove() {
      return true;
    },
  };

  const decisionPolicy = {
    async decide({ legalMoves, timeBudgetMs }) {
      capturedBudget = timeBudgetMs;
      return { move: legalMoves[0], latencyMs: 1, source: "baseline" };
    },
  };

  const logger = { info: () => {}, warn: () => {} };
  await runSingleGame({
    client,
    decisionPolicy,
    logger,
    gameId: "g6",
    botColor: "white",
  });

  assert.ok(capturedBudget > 0, "expected positive think budget for usable clock");
});

test("runSingleGame does not warn when latency equals the computed think budget", async () => {
  const events = [
    { type: "gameState", moves: "", status: "started", wtime: 60000, btime: 60000 },
    { type: "gameState", moves: "e2e4", status: "resign", winner: "white" },
  ];
  const warnings = [];

  const client = {
    async *streamGame() { for (const e of events) yield e; },
    async makeMove() { return true; },
  };

  const decisionPolicy = {
    async decide({ legalMoves, timeBudgetMs }) {
      return { move: legalMoves[0], latencyMs: timeBudgetMs, source: "uci" };
    },
  };

  const logger = { info: () => {}, warn: (msg) => warnings.push(msg) };
  await runSingleGame({ client, decisionPolicy, logger, gameId: "g7", botColor: "white", moveLatencyBudgetMs: 200 });

  assert.ok(
    !warnings.some((w) => w.includes("overran budget")),
    "no overrun warning expected when latency equals the think budget"
  );
});

test("runSingleGame warns when latency significantly overruns the computed budget", async () => {
  const events = [
    { type: "gameState", moves: "", status: "started", wtime: 60000, btime: 60000 },
    { type: "gameState", moves: "e2e4", status: "resign", winner: "white" },
  ];
  const warnings = [];

  const client = {
    async *streamGame() { for (const e of events) yield e; },
    async makeMove() { return true; },
  };

  const decisionPolicy = {
    async decide({ legalMoves, timeBudgetMs }) {
      return { move: legalMoves[0], latencyMs: timeBudgetMs + 500, source: "uci" };
    },
  };

  const logger = { info: () => {}, warn: (msg) => warnings.push(msg) };
  await runSingleGame({ client, decisionPolicy, logger, gameId: "g8", botColor: "white", moveLatencyBudgetMs: 200 });

  assert.ok(
    warnings.some((w) => w.includes("overran budget")),
    "overrun warning expected when latency exceeds budget by 500ms (> 200ms tolerance)"
  );
});
