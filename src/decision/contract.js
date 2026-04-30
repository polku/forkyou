"use strict";

const DecisionSource = Object.freeze({
  BASELINE: "baseline",
});

function assertValidDecisionResult(result) {
  if (!result || typeof result !== "object") {
    throw new Error("Decision policy returned invalid result object");
  }

  if (typeof result.move !== "string" || result.move.length === 0) {
    throw new Error("Decision result requires non-empty string move");
  }

  if (typeof result.latencyMs !== "number" || !Number.isFinite(result.latencyMs)) {
    throw new Error("Decision result requires finite number latencyMs");
  }

  if (typeof result.source !== "string" || result.source.length === 0) {
    throw new Error("Decision result requires non-empty string source");
  }
}

module.exports = {
  DecisionSource,
  assertValidDecisionResult,
};
