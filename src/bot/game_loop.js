"use strict";

const { normalizeOutcome } = require("./terminal");

function inferTurnFromMoves(moves) {
  if (!moves || moves.trim() === "") {
    return "white";
  }

  const plies = moves.trim().split(/\s+/).filter(Boolean).length;
  return plies % 2 === 0 ? "white" : "black";
}

function extractLegalMovesFromEvent(event) {
  if (Array.isArray(event.legalMoves)) {
    return event.legalMoves;
  }

  if (typeof event.legalMoves === "string") {
    return event.legalMoves.split(" ").map((m) => m.trim()).filter(Boolean);
  }

  return [];
}

async function runSingleGame({ client, decisionPolicy, logger, gameId, botColor, moveLatencyBudgetMs = 200 }) {
  let outcome = { terminal: false, status: "started", result: "ongoing" };

  for await (const event of client.streamGame(gameId)) {
    const type = event.type;

    if (type !== "gameFull" && type !== "gameState") {
      continue;
    }

    const state = type === "gameFull" ? (event.state || {}) : event;
    const turn = inferTurnFromMoves(state.moves);
    const status = state.status || "started";

    outcome = normalizeOutcome(status, state.winner, botColor);
    if (outcome.terminal) {
      logger.info(`game ${gameId} finished: ${outcome.result} (${outcome.status})`);
      break;
    }

    if (turn !== botColor) {
      continue;
    }

    const legalMoves = extractLegalMovesFromEvent(state);
    if (legalMoves.length === 0) {
      logger.warn(`game ${gameId}: no legalMoves present in event; waiting for next state`);
      continue;
    }

    const decision = decisionPolicy.decide({
      gameId,
      botColor,
      legalMoves,
      state,
    });

    if (!legalMoves.includes(decision.move)) {
      logger.warn(`game ${gameId}: policy returned illegal move ${decision.move}; skipping`);
      continue;
    }

    if (decision.latencyMs > moveLatencyBudgetMs) {
      logger.warn(`game ${gameId}: move decision exceeded budget ${moveLatencyBudgetMs}ms (${decision.latencyMs}ms)`);
    }

    await client.makeMove(gameId, decision.move);
    logger.info(`game ${gameId}: submitted move ${decision.move} (${decision.source}, ${decision.latencyMs}ms)`);
  }

  return outcome;
}

module.exports = {
  inferTurnFromMoves,
  extractLegalMovesFromEvent,
  runSingleGame,
};
