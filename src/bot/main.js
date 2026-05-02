"use strict";

const { LichessClient } = require("./lichess_client");
const { RandomLegalMovePolicy } = require("../decision/random_legal_move_policy");
const { runSingleGame } = require("./game_loop");

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  return String(value).toLowerCase() === "true";
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function evaluateChallenge(challenge, policy) {
  if (!challenge?.id) {
    return { action: "ignore", reason: "missing-id" };
  }
  if (policy.hasActiveGame) {
    return { action: "decline", reason: "later" };
  }
  if (!policy.acceptRated && challenge.rated === true) {
    return { action: "decline", reason: "rated" };
  }

  const clockLimit = challenge.timeControl?.limit;
  if (policy.maxClockSeconds !== null && typeof clockLimit === "number" && clockLimit > policy.maxClockSeconds) {
    return { action: "decline", reason: "timeControl" };
  }

  return { action: "accept" };
}

async function run() {
  const token = process.env.LICHESS_BOT_TOKEN;
  const moveLatencyBudgetMs = Number(process.env.BOT_MOVE_BUDGET_MS || "200");
  const acceptRated = parseBoolean(process.env.ACCEPT_RATED, false);
  const maxClockSeconds = parseOptionalNumber(process.env.MAX_CLOCK_SECONDS);

  if (!token) {
    throw new Error("Missing LICHESS_BOT_TOKEN");
  }

  const client = new LichessClient({ token });
  const decisionPolicy = new RandomLegalMovePolicy();
  const logger = {
    info: (msg) => console.log(`[info] ${msg}`),
    warn: (msg) => console.warn(`[warn] ${msg}`),
  };
  let hasActiveGame = false;

  for await (const event of client.streamIncomingEvents()) {
    if (event.type === "challenge") {
      const challenge = event.challenge || {};
      const decision = evaluateChallenge(challenge, { hasActiveGame, acceptRated, maxClockSeconds });
      if (decision.action === "ignore") {
        logger.warn("ignoring malformed challenge event with missing id");
      } else if (decision.action === "accept") {
        logger.info(`accepting challenge ${challenge.id}`);
        await client.acceptChallenge(challenge.id).catch((err) =>
          logger.warn(`challenge ${challenge.id} accept failed: ${err.message}`)
        );
      } else {
        logger.info(`declining challenge ${challenge.id} (reason=${decision.reason})`);
        await client.declineChallenge(challenge.id, decision.reason).catch((err) =>
          logger.warn(`challenge ${challenge.id} decline failed: ${err.message}`)
        );
      }
      continue;
    }

    if (event.type !== "gameStart") {
      continue;
    }

    const game = event.game || {};
    const gameId = game.id;
    const botColor = game.color;

    if (!gameId || (botColor !== "white" && botColor !== "black")) {
      logger.warn(`Skipping malformed gameStart event: ${JSON.stringify(event)}`);
      continue;
    }

    logger.info(`starting game loop for ${gameId} as ${botColor}`);
    hasActiveGame = true;
    const outcome = await runSingleGame({
      client,
      decisionPolicy,
      logger,
      gameId,
      botColor,
      moveLatencyBudgetMs,
    });
    hasActiveGame = false;

    logger.info(`game ${gameId} closed with outcome=${outcome.result} status=${outcome.status}`);
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`[fatal] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  evaluateChallenge,
  parseBoolean,
  parseOptionalNumber,
  run,
};
