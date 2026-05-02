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

function extractComparableRating(perfs) {
  if (!perfs || typeof perfs !== "object") {
    return null;
  }
  const keys = ["blitz", "rapid", "bullet", "classical"];
  for (const key of keys) {
    const rating = perfs[key]?.rating;
    if (typeof rating === "number" && Number.isFinite(rating)) {
      return rating;
    }
  }
  return null;
}

function selectClosestBot(onlineBots, me) {
  const myName = me?.username;
  const myRating = extractComparableRating(me?.perfs);
  const candidates = onlineBots
    .map((bot) => bot?.username || bot?.name || bot?.id || null)
    .filter((username) => username && username !== myName);

  if (candidates.length === 0) {
    return null;
  }

  if (myRating === null) {
    return candidates[0];
  }

  const withScores = onlineBots
    .map((bot) => {
      const username = bot?.username || bot?.name || bot?.id;
      if (!username || username === myName) {
        return null;
      }
      const rating = extractComparableRating(bot?.perfs);
      const delta = rating === null ? Number.POSITIVE_INFINITY : Math.abs(rating - myRating);
      return { username, delta };
    })
    .filter(Boolean)
    .sort((a, b) => a.delta - b.delta);

  return withScores[0]?.username || candidates[0];
}

function rankBotsByRating(onlineBots, me) {
  const myName = me?.username;
  const myRating = extractComparableRating(me?.perfs);
  const out = [];

  for (const bot of onlineBots) {
    const username = bot?.username || bot?.name || bot?.id;
    if (!username || username === myName) {
      continue;
    }
    const rating = extractComparableRating(bot?.perfs);
    const delta = myRating === null || rating === null ? Number.POSITIVE_INFINITY : Math.abs(rating - myRating);
    out.push({ username, delta });
  }

  out.sort((a, b) => a.delta - b.delta);
  return out.map((row) => row.username);
}

function computeChallengeCooldownMs(err) {
  const seconds = err?.details?.ratelimit?.seconds;
  if (typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  return 5 * 60 * 1000;
}

function isOwnChallengeEvent(challenge, me) {
  const myUsername = me?.username;
  if (!myUsername) {
    return false;
  }
  const challengerName = challenge?.challenger?.name || challenge?.challenger?.id || challenge?.challenger?.username;
  return challengerName === myUsername;
}

async function maybeStartOutboundChallenge({ client, logger, state, challengeOptions }) {
  if (state.hasActiveGame || state.targetGamesReached || state.pendingOutboundChallenge) {
    return;
  }
  if (state.pendingOutboundChallengeId && Date.now() < state.pendingOutboundChallengeExpiresAt) {
    return;
  }
  if (state.pendingOutboundChallengeId && Date.now() >= state.pendingOutboundChallengeExpiresAt) {
    logger.info(`pending outbound challenge ${state.pendingOutboundChallengeId} expired; trying another opponent`);
    state.pendingOutboundChallengeId = null;
    state.pendingOutboundChallengeExpiresAt = 0;
  }

  state.pendingOutboundChallenge = true;
  try {
    if (!state.me) {
      state.me = await client.getAccount();
      logger.info(`Connected as BOT: ${state.me.username || "unknown"}`);
    }

    logger.info("Looking for online bots to challenge");
    const onlineBots = await client.getOnlineBots();
    const rankedOpponents = rankBotsByRating(onlineBots, state.me);

    const now = Date.now();
    const opponents = rankedOpponents.filter((username) => {
      const until = state.opponentCooldownUntil.get(username) || 0;
      return until <= now;
    });

    if (opponents.length === 0) {
      logger.info("No eligible online bot found yet; retrying soon");
      return;
    }

    for (const opponent of opponents) {
      logger.info(`Sending outbound challenge to ${opponent}`);
      try {
        const challengeResult = await client.createChallenge(opponent, challengeOptions);
        const challengeId = challengeResult.challenge?.id || challengeResult.id || "unknown";
        state.pendingOutboundChallengeId = challengeId;
        state.pendingOutboundChallengeExpiresAt = Date.now() + state.outboundChallengeTtlMs;
        logger.info(`Challenge created: ${challengeId} -> ${opponent}`);
        return;
      } catch (err) {
        const cooldownMs = computeChallengeCooldownMs(err);
        state.opponentCooldownUntil.set(opponent, now + cooldownMs);
        logger.warn(`challenge to ${opponent} failed; cooling down opponent for ${Math.ceil(cooldownMs / 1000)}s: ${err.message}`);
      }
    }

    logger.info("No outbound challenge was accepted/created this cycle; retrying soon");
  } catch (err) {
    logger.warn(`outbound challenge cycle failed: ${err.message}`);
  } finally {
    state.pendingOutboundChallenge = false;
  }
}

async function run() {
  const token = process.env.LICHESS_BOT_TOKEN;
  const moveLatencyBudgetMs = Number(process.env.BOT_MOVE_BUDGET_MS || "200");
  const acceptRated = parseBoolean(process.env.ACCEPT_RATED, false);
  const maxClockSeconds = parseOptionalNumber(process.env.MAX_CLOCK_SECONDS);
  const activeChallengeTargetGames = Number(process.env.ACTIVE_CHALLENGE_TARGET_GAMES || "2");
  const activeChallengeClockSeconds = Number(process.env.ACTIVE_CHALLENGE_CLOCK_SECONDS || "60");
  const activeChallengeClockIncrement = Number(process.env.ACTIVE_CHALLENGE_CLOCK_INCREMENT || "0");
  const outboundTickMs = Number(process.env.ACTIVE_CHALLENGE_TICK_MS || "5000");

  if (!token) {
    throw new Error("Missing LICHESS_BOT_TOKEN");
  }

  const client = new LichessClient({ token });
  const decisionPolicy = new RandomLegalMovePolicy();
  const logger = {
    info: (msg) => console.log(`[info] ${msg}`),
    warn: (msg) => console.warn(`[warn] ${msg}`),
  };
  const state = {
    hasActiveGame: false,
    targetGamesStarted: 0,
    targetGamesReached: false,
    pendingOutboundChallenge: false,
    pendingOutboundChallengeId: null,
    pendingOutboundChallengeExpiresAt: 0,
    outboundChallengeTtlMs: Number(process.env.ACTIVE_CHALLENGE_PENDING_TTL_MS || "45000"),
    opponentCooldownUntil: new Map(),
    me: null,
  };

  logger.info(
    `bot runtime starting; active challenge target=${activeChallengeTargetGames} ` +
      `clock=${activeChallengeClockSeconds}+${activeChallengeClockIncrement}`
  );

  const outboundTimer = setInterval(() => {
    maybeStartOutboundChallenge({
      client,
      logger,
      state,
      challengeOptions: {
        rated: false,
        clockLimitSeconds: activeChallengeClockSeconds,
        clockIncrementSeconds: activeChallengeClockIncrement,
      },
    });
  }, outboundTickMs);

  try {
    await maybeStartOutboundChallenge({
      client,
      logger,
      state,
      challengeOptions: {
        rated: false,
        clockLimitSeconds: activeChallengeClockSeconds,
        clockIncrementSeconds: activeChallengeClockIncrement,
      },
    });

    for await (const event of client.streamIncomingEvents()) {
      if (event.type === "challengeDeclined" || event.type === "challengeCanceled") {
        const challengeId = event.challenge?.id || event.challenge?.challenge?.id;
        if (challengeId && challengeId === state.pendingOutboundChallengeId) {
          logger.info(`outbound challenge ${challengeId} ended without game; unlocking outbound attempts`);
          state.pendingOutboundChallengeId = null;
          state.pendingOutboundChallengeExpiresAt = 0;
        }
        continue;
      }

      if (event.type === "challenge") {
        const challenge = event.challenge || {};
        if (isOwnChallengeEvent(challenge, state.me)) {
          logger.info(`ignoring own outbound challenge event ${challenge.id || "unknown"}`);
          continue;
        }
        const decision = evaluateChallenge(challenge, { hasActiveGame: state.hasActiveGame, acceptRated, maxClockSeconds });
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
      state.pendingOutboundChallengeId = null;
      state.pendingOutboundChallengeExpiresAt = 0;
      state.hasActiveGame = true;
      state.targetGamesStarted += 1;
      if (state.targetGamesStarted >= activeChallengeTargetGames && !state.targetGamesReached) {
        state.targetGamesReached = true;
        logger.info(`active challenge quota reached (${state.targetGamesStarted}/${activeChallengeTargetGames}); switching to passive mode`);
      }

      try {
        const outcome = await runSingleGame({
          client,
          decisionPolicy,
          logger,
          gameId,
          botColor,
          moveLatencyBudgetMs,
        });
        logger.info(`game ${gameId} closed with outcome=${outcome.result} status=${outcome.status}`);
      } finally {
        state.hasActiveGame = false;
      }
    }
  } finally {
    clearInterval(outboundTimer);
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
  extractComparableRating,
  parseBoolean,
  parseOptionalNumber,
  selectClosestBot,
  rankBotsByRating,
  computeChallengeCooldownMs,
  isOwnChallengeEvent,
  maybeStartOutboundChallenge,
  run,
};
