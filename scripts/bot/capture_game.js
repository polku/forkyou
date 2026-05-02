"use strict";

/**
 * One-shot Lichess game capture script.
 * Challenges maia1, plays random legal moves until natural game end
 * (checkmate, draw, opponent resign, stalemate, outoftime by maia1 — NOT scripted by us).
 *
 * Usage: LICHESS_BOT_TOKEN=<token> node scripts/bot/capture_game.js
 */

const { Chess } = require("./chess_lib");
const { LichessClient } = require("../../src/bot/lichess_client");

const LICHESS_BASE_URL = process.env.LICHESS_BASE_URL || "https://lichess.org";
const TOKEN = process.env.LICHESS_BOT_TOKEN;
const OPPONENT = process.env.CAPTURE_OPPONENT || "maia1";
// 3+0 blitz: enough for a full game, not too long to wait
const CLOCK_LIMIT = Number(process.env.CAPTURE_CLOCK_LIMIT || "180");
const CLOCK_INC = Number(process.env.CAPTURE_CLOCK_INC || "0");
const GAME_START_TIMEOUT_MS = 30_000;
const LOG = [];

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.error(line);
  LOG.push(line);
}

async function authPost(url, body = "") {
  return fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
}

async function sendChallenge(opponent) {
  log(`Sending challenge to ${opponent} (clock: ${CLOCK_LIMIT}+${CLOCK_INC})`);
  const res = await authPost(
    `${LICHESS_BASE_URL}/api/challenge/${opponent}`,
    `rated=false&clock.limit=${CLOCK_LIMIT}&clock.increment=${CLOCK_INC}`
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Challenge failed (${res.status}): ${text}`);
  const data = JSON.parse(text);
  const id = data.challenge?.id || data.id;
  log(`Challenge created: ${id}`);
  return id;
}

async function acceptChallenge(id) {
  const res = await authPost(`${LICHESS_BASE_URL}/api/challenge/${id}/accept`);
  if (!res.ok) log(`Accept ${id} failed (${res.status}) — may have auto-accepted`);
  else log(`Challenge ${id} accepted`);
}

async function fetchPgn(gameId) {
  log(`Fetching PGN for ${gameId}`);
  const res = await fetch(
    `${LICHESS_BASE_URL}/game/export/${gameId}?moves=true&clocks=false&evals=false`,
    { headers: { Accept: "application/x-chess-pgn" } }
  );
  if (!res.ok) { log(`PGN fetch failed (${res.status})`); return null; }
  return res.text();
}

async function waitForGameStart(client, timeoutMs) {
  log("Waiting for gameStart...");
  const ac = new AbortController();
  const timer = setTimeout(() => { log("gameStart timeout"); ac.abort(); }, timeoutMs);
  try {
    for await (const event of client.streamIncomingEvents(ac.signal)) {
      log(`Event: ${event.type}`);
      if (event.type === "challenge") {
        const cid = event.challenge?.id;
        if (cid) await acceptChallenge(cid);
      }
      if (event.type === "gameStart") {
        clearTimeout(timer);
        const game = event.game || {};
        log(`gameStart: id=${game.id} color=${game.color}`);
        return game;
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") throw err;
  }
  clearTimeout(timer);
  throw new Error("No gameStart within timeout");
}

function legalMovesFromHistory(movesStr) {
  const chess = new Chess();
  if (movesStr && movesStr.trim()) {
    for (const uci of movesStr.trim().split(/\s+/)) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length === 5 ? uci[4] : undefined;
      const result = chess.move({ from, to, ...(promotion ? { promotion } : {}) });
      if (!result) { log(`WARN: chess.js rejected move ${uci}`); break; }
    }
  }
  return chess.moves({ verbose: true }).map(m => `${m.from}${m.to}${m.promotion || ""}`);
}

function pickRandomMove(legalMoves) {
  return legalMoves[Math.floor(Math.random() * legalMoves.length)];
}

async function playGame(client, gameId, botColor) {
  log(`Playing game ${gameId} as ${botColor}`);
  let terminalStatus = "unknown";
  let terminalResult = "unknown";
  let moveCount = 0;

  const ac = new AbortController();
  const gameTimeout = setTimeout(() => { log("Game stream timeout"); ac.abort(); }, 20 * 60_000);

  const TERMINAL = new Set(["mate", "resign", "outoftime", "draw", "stalemate", "aborted", "timeout", "noStart", "cheat", "variantEnd"]);

  try {
    for await (const event of client.streamGame(gameId, ac.signal)) {
      const type = event.type;
      if (type !== "gameFull" && type !== "gameState") continue;

      const state = type === "gameFull" ? (event.state || event) : event;
      const status = state.status || "started";
      const movesStr = (state.moves || "").trim();
      const plies = movesStr ? movesStr.split(/\s+/).filter(Boolean).length : 0;
      moveCount = plies;

      if (TERMINAL.has(status)) {
        terminalStatus = status;
        terminalResult = state.winner
          ? (state.winner === botColor ? "win" : "loss")
          : "draw";
        log(`Terminal: status=${status} result=${terminalResult} moves=${moveCount}`);
        break;
      }

      const currentTurn = plies % 2 === 0 ? "white" : "black";
      if (currentTurn !== botColor) continue;

      const legalMoves = legalMovesFromHistory(movesStr);
      if (legalMoves.length === 0) {
        log(`No legal moves computed from position (moves=${plies}) — game likely terminal`);
        continue;
      }

      const move = pickRandomMove(legalMoves);
      log(`Turn ${plies + 1}: playing ${move} (${legalMoves.length} legal)`);

      try {
        const res = await fetch(`${LICHESS_BASE_URL}/api/bot/game/${gameId}/move/${move}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${TOKEN}` },
        });
        if (!res.ok) {
          const body = await res.text();
          log(`Move ${move} failed (${res.status}): ${body}`);
        }
      } catch (err) {
        log(`Move ${move} error: ${err.message}`);
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") throw err;
  }

  clearTimeout(gameTimeout);
  return { terminalStatus, terminalResult, moveCount };
}

async function main() {
  if (!TOKEN) throw new Error("Missing LICHESS_BOT_TOKEN");

  const startTs = new Date().toISOString();
  log(`=== Capture started at ${startTs} ===`);
  log(`Opponent: ${OPPONENT} | Clock: ${CLOCK_LIMIT}+${CLOCK_INC}`);

  const meRes = await fetch(`${LICHESS_BASE_URL}/api/account`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" },
  });
  if (!meRes.ok) throw new Error(`Auth check failed (${meRes.status})`);
  const me = await meRes.json();
  log(`Authenticated as: ${me.username} (title=${me.title || "none"})`);

  const client = new LichessClient({ token: TOKEN });

  await sendChallenge(OPPONENT);
  const game = await waitForGameStart(client, GAME_START_TIMEOUT_MS);
  const { id: gameId, color: botColor } = game;
  const gameUrl = `${LICHESS_BASE_URL}/${gameId}`;
  log(`Game started: ${gameUrl} as ${botColor}`);

  const { terminalStatus, terminalResult, moveCount } = await playGame(client, gameId, botColor);

  await new Promise(r => setTimeout(r, 5000));
  const pgn = await fetchPgn(gameId);

  const endTs = new Date().toISOString();
  log(`=== Capture complete at ${endTs} ===`);

  console.log(JSON.stringify({
    captureStartUtc: startTs,
    captureEndUtc: endTs,
    gameUrl,
    gameId,
    botColor,
    terminalStatus,
    terminalResult,
    moveCount,
    opponent: OPPONENT,
    pgn: pgn || "(PGN fetch failed)",
    runLog: LOG,
  }, null, 2));
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  console.error(err);
  process.exitCode = 1;
});
