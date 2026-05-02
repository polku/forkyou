"use strict";

const TERMINAL_STATUSES = new Set([
  "mate",
  "resign",
  "timeout",
  "draw",
  "stalemate",
  "aborted",
  "outoftime",
  "noStart",
  "cheat",
]);

function normalizeOutcome(status, winner, botColor) {
  if (!status || !TERMINAL_STATUSES.has(status)) {
    return { terminal: false, status: status || "started", result: "ongoing" };
  }

  if (status === "draw" || status === "stalemate") {
    return { terminal: true, status, result: "draw" };
  }

  if (status === "aborted" || status === "noStart") {
    return { terminal: true, status, result: "aborted" };
  }

  if (!winner || !botColor) {
    return { terminal: true, status, result: "unknown" };
  }

  return {
    terminal: true,
    status,
    result: winner === botColor ? "win" : "loss",
  };
}

module.exports = {
  TERMINAL_STATUSES,
  normalizeOutcome,
};
