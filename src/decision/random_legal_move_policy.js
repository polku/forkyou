"use strict";

const { DecisionSource, assertValidDecisionResult } = require("./contract");

class RandomLegalMovePolicy {
  constructor(options = {}) {
    this.rng = options.rng || Math.random;
    this.now = options.now || (() => Date.now());
  }

  decide(context) {
    const start = this.now();

    if (!context || !Array.isArray(context.legalMoves) || context.legalMoves.length === 0) {
      throw new Error("RandomLegalMovePolicy requires non-empty legalMoves array");
    }

    const index = Math.floor(this.rng() * context.legalMoves.length);
    const move = context.legalMoves[index];

    const result = {
      move,
      latencyMs: Math.max(0, this.now() - start),
      source: DecisionSource.BASELINE,
    };

    assertValidDecisionResult(result);
    return result;
  }
}

module.exports = {
  RandomLegalMovePolicy,
};
