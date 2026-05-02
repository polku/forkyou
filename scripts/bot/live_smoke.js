"use strict";

const { LichessClient } = require("../../src/bot/lichess_client");

async function runLiveSmoke() {
  const token = process.env.LICHESS_BOT_TOKEN;
  const maxEvents = Number(process.env.BOT_SMOKE_MAX_EVENTS || "5");

  if (!token) {
    throw new Error("Missing LICHESS_BOT_TOKEN");
  }

  const client = new LichessClient({ token });

  let seen = 0;
  for await (const event of client.streamIncomingEvents()) {
    seen += 1;
    const eventType = event.type || "unknown";
    console.log(`[smoke] event#${seen} type=${eventType}`);

    if (eventType === "gameStart") {
      const id = event.game && event.game.id ? event.game.id : "unknown";
      const color = event.game && event.game.color ? event.game.color : "unknown";
      console.log(`[smoke] gameStart id=${id} color=${color}`);
      console.log("[smoke] PASS: authenticated stream + game-start detection confirmed");
      return;
    }

    if (seen >= maxEvents) {
      break;
    }
  }

  throw new Error(
    `No gameStart event observed within ${maxEvents} events. Keep bot online or issue a challenge and retry.`
  );
}

if (require.main === module) {
  runLiveSmoke().catch((error) => {
    console.error(`[smoke] FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  runLiveSmoke,
};
