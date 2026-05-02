"use strict";

const { DecisionSource, assertValidDecisionResult } = require("./contract");

class BaselineMovePolicy {
  constructor(options = {}) {
    this.policyId = options.policyId || DecisionSource.BASELINE;
    this.random = Boolean(options.random);
    this.rng = options.rng || Math.random;
    this.now = options.now || (() => Date.now());
  }

  selectMove(gameState) {
    const { legalMoves, requestId } = gameState;

    if (!Array.isArray(legalMoves) || legalMoves.length === 0) {
      throw new Error("BaselineMovePolicy requires non-empty legalMoves array");
    }

    const start = this.now();

    const move = this.random
      ? legalMoves[Math.floor(this.rng() * legalMoves.length)]
      : legalMoves[0];

    const result = {
      move,
      source: this.policyId,
      latencyMs: this.now() - start,
      traceId: requestId || null,
    };

    assertValidDecisionResult(result);
    return result;
  }

  decide(context) {
    return this.selectMove(context);
  }
}

module.exports = {
  BaselineMovePolicy,
};
