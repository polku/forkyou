"use strict";

const DEFAULTS = {
  minThinkMs: Number(process.env.ENGINE_MIN_THINK_MS || "50"),
  maxThinkMs: Number(process.env.ENGINE_MAX_THINK_MS || "2000"),
  reserveMs: Number(process.env.ENGINE_TIME_RESERVE_MS || "200"),
  incrementFactor: Number(process.env.ENGINE_INCREMENT_FACTOR || "0.8"),
  openingFraction: Number(process.env.ENGINE_OPENING_TIME_FRACTION || "0.04"),
  middlegameFraction: Number(process.env.ENGINE_MIDDLEGAME_TIME_FRACTION || "0.06"),
  endgameFraction: Number(process.env.ENGINE_ENDGAME_TIME_FRACTION || "0.1"),
};

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function toFiniteNumber(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function pliesFromMoves(moves) {
  if (!moves || typeof moves !== "string" || moves.trim() === "") {
    return 0;
  }
  return moves.trim().split(/\s+/).filter(Boolean).length;
}

function phaseFraction(plies, config) {
  if (plies < 20) {
    return config.openingFraction;
  }
  if (plies < 60) {
    return config.middlegameFraction;
  }
  return config.endgameFraction;
}

function normalizeConfig(config = {}) {
  return {
    minThinkMs: Math.max(1, Number(config.minThinkMs ?? DEFAULTS.minThinkMs)),
    maxThinkMs: Math.max(1, Number(config.maxThinkMs ?? DEFAULTS.maxThinkMs)),
    reserveMs: Math.max(0, Number(config.reserveMs ?? DEFAULTS.reserveMs)),
    incrementFactor: clamp(Number(config.incrementFactor ?? DEFAULTS.incrementFactor), 0, 2),
    openingFraction: clamp(Number(config.openingFraction ?? DEFAULTS.openingFraction), 0.001, 1),
    middlegameFraction: clamp(Number(config.middlegameFraction ?? DEFAULTS.middlegameFraction), 0.001, 1),
    endgameFraction: clamp(Number(config.endgameFraction ?? DEFAULTS.endgameFraction), 0.001, 1),
  };
}

function computeMoveBudget({ state, botColor, moves, config } = {}) {
  const cfg = normalizeConfig(config);
  const remaining = toFiniteNumber(botColor === "white" ? state?.wtime : state?.btime);
  const increment = toFiniteNumber(botColor === "white" ? state?.winc : state?.binc) ?? 0;

  if (remaining === null || remaining <= 0) {
    return 0;
  }

  const available = Math.max(0, remaining - cfg.reserveMs);
  if (available <= 0) {
    return Math.max(1, Math.floor(Math.min(remaining, cfg.minThinkMs)));
  }

  const plies = pliesFromMoves(moves);
  const fraction = phaseFraction(plies, cfg);
  const baseBudget = available * fraction;
  const incrementBudget = increment * cfg.incrementFactor;
  const rawBudget = baseBudget + incrementBudget;

  const capped = Math.min(rawBudget, available, cfg.maxThinkMs);
  const budget = clamp(Math.floor(capped), cfg.minThinkMs, Math.floor(available));
  return Math.max(1, budget);
}

module.exports = {
  computeMoveBudget,
  normalizeConfig,
  pliesFromMoves,
};
