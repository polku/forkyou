"use strict";

const { LichessClient } = require("./lichess_client");
const { RandomLegalMovePolicy } = require("../decision/random_legal_move_policy");
const { runSingleGame } = require("./game_loop");

async function run() {
  const token = process.env.LICHESS_BOT_TOKEN;
  const moveLatencyBudgetMs = Number(process.env.BOT_MOVE_BUDGET_MS || "200");

  if (!token) {
    throw new Error("Missing LICHESS_BOT_TOKEN");
  }

  const client = new LichessClient({ token });
  const decisionPolicy = new RandomLegalMovePolicy();
  const logger = {
    info: (msg) => console.log(`[info] ${msg}`),
    warn: (msg) => console.warn(`[warn] ${msg}`),
  };

  for await (const event of client.streamIncomingEvents()) {
    if (event.type === "challenge") {
      const challengeId = event.challenge?.id;
      if (challengeId) {
        logger.info(`accepting challenge ${challengeId}`);
        await client.acceptChallenge(challengeId).catch((err) =>
          logger.warn(`challenge ${challengeId} accept failed: ${err.message}`)
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
    const outcome = await runSingleGame({
      client,
      decisionPolicy,
      logger,
      gameId,
      botColor,
      moveLatencyBudgetMs,
    });

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
  run,
};
