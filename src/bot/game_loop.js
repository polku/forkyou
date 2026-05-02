"use strict";

const { Chess } = require("../../scripts/bot/chess_lib");
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

function computeLegalMovesFromHistory(movesStr) {
  const chess = new Chess();
  if (movesStr && movesStr.trim()) {
    for (const uci of movesStr.trim().split(/\s+/)) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length === 5 ? uci[4] : undefined;
      if (!chess.move({ from, to, ...(promotion ? { promotion } : {}) })) {
        return [];
      }
    }
  }
  return chess.moves({ verbose: true }).map((m) => `${m.from}${m.to}${m.promotion || ""}`);
}

function computeFenFromHistory(movesStr) {
  const chess = new Chess();
  if (movesStr && movesStr.trim()) {
    for (const uci of movesStr.trim().split(/\s+/)) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length === 5 ? uci[4] : undefined;
      if (!chess.move({ from, to, ...(promotion ? { promotion } : {}) })) {
        return null;
      }
    }
  }
  return chess.fen();
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

    const legalMoves = computeLegalMovesFromHistory(state.moves);
    if (legalMoves.length === 0) {
      logger.warn(`game ${gameId}: no legalMoves present in event; waiting for next state`);
      continue;
    }

    const fen = computeFenFromHistory(state.moves);
    if (!fen) {
      logger.warn(`game ${gameId}: unable to compute FEN from history; waiting for next state`);
      continue;
    }

    const decision = await decisionPolicy.decide({
      gameId,
      botColor,
      legalMoves,
      fen,
      state,
    });

    if (!legalMoves.includes(decision.move)) {
      logger.warn(`game ${gameId}: policy returned illegal move ${decision.move}; skipping`);
      continue;
    }

    if (decision.latencyMs > moveLatencyBudgetMs) {
      logger.warn(`game ${gameId}: move decision exceeded budget ${moveLatencyBudgetMs}ms (${decision.latencyMs}ms)`);
    }

    try {
      await client.makeMove(gameId, decision.move);
      logger.info(`game ${gameId}: submitted move ${decision.move} (${decision.source}, ${decision.latencyMs}ms)`);
    } catch (err) {
      if (/game already over/i.test(err.message)) {
        logger.warn(`game ${gameId}: move rejected (game already over); exiting game loop`);
        break;
      }
      throw err;
    }
  }

  return outcome;
}

module.exports = {
  inferTurnFromMoves,
  extractLegalMovesFromEvent,
  computeLegalMovesFromHistory,
  computeFenFromHistory,
  runSingleGame,
};
