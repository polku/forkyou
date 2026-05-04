"use strict";

const { Chess } = require("../../scripts/bot/chess_lib");
const { normalizeOutcome } = require("./terminal");
const { computeMoveBudget } = require("../decision/time_manager");

const PIECE_VALUES = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
};

const CLEAR_ADVANTAGE_CP = 300;
const SIGNIFICANT_TIME_DEFICIT_MS = 15000;
const SIGNIFICANT_TIME_RATIO = 0.6;

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

function hasOpponentDrawOffer(state, botColor) {
  return botColor === "white" ? state.bdraw === true : state.wdraw === true;
}

function materialScoreFromFenForBot(fen, botColor) {
  if (!fen || typeof fen !== "string") {
    return 0;
  }

  const placement = fen.split(" ")[0] || "";
  let whiteScore = 0;
  let blackScore = 0;

  for (const ch of placement) {
    const lower = ch.toLowerCase();
    const value = PIECE_VALUES[lower] || 0;
    if (!value) {
      continue;
    }
    if (ch === lower) {
      blackScore += value;
    } else {
      whiteScore += value;
    }
  }

  return botColor === "white" ? whiteScore - blackScore : blackScore - whiteScore;
}

function isSignificantlyBehindOnTime(state, botColor) {
  const ownTimeMs = botColor === "white" ? state.wtime : state.btime;
  const oppTimeMs = botColor === "white" ? state.btime : state.wtime;
  if (!Number.isFinite(ownTimeMs) || !Number.isFinite(oppTimeMs) || oppTimeMs <= 0) {
    return false;
  }
  const deficit = oppTimeMs - ownTimeMs;
  const ratio = ownTimeMs / oppTimeMs;
  return deficit >= SIGNIFICANT_TIME_DEFICIT_MS && ratio <= SIGNIFICANT_TIME_RATIO;
}

function shouldAcceptDrawOffer({ state, botColor }) {
  if (!hasOpponentDrawOffer(state, botColor)) {
    return false;
  }

  const fen = typeof state.fen === "string" && state.fen.trim() ? state.fen : computeFenFromHistory(state.moves);
  const materialScore = materialScoreFromFenForBot(fen, botColor);
  const hasClearAdvantage = materialScore >= CLEAR_ADVANTAGE_CP;
  const significantlyBehindOnTime = isSignificantlyBehindOnTime(state, botColor);
  return !hasClearAdvantage && significantlyBehindOnTime;
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

    if (hasOpponentDrawOffer(state, botColor)) {
      if (shouldAcceptDrawOffer({ state, botColor })) {
        try {
          await client.acceptDraw(gameId);
          logger.info(`game ${gameId}: accepted opponent draw offer`);
        } catch (err) {
          logger.warn(`game ${gameId}: draw accept failed: ${err.message}`);
        }
        continue;
      }
      logger.info(`game ${gameId}: draw offer declined by policy; continuing play`);
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

    const timeBudgetMs = computeMoveBudget({ state, botColor, moves: state.moves });

    const decision = await decisionPolicy.decide({
      gameId,
      botColor,
      legalMoves,
      fen,
      state,
      timeBudgetMs,
    });

    if (!legalMoves.includes(decision.move)) {
      logger.warn(`game ${gameId}: policy returned illegal move ${decision.move}; skipping`);
      continue;
    }

    const overrunMs = decision.latencyMs - timeBudgetMs;
    if (overrunMs > moveLatencyBudgetMs) {
      logger.warn(`game ${gameId}: move decision overran budget by ${overrunMs}ms (budget=${timeBudgetMs}ms, actual=${decision.latencyMs}ms)`);
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
  hasOpponentDrawOffer,
  materialScoreFromFenForBot,
  isSignificantlyBehindOnTime,
  shouldAcceptDrawOffer,
  runSingleGame,
};
