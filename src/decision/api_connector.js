"use strict";

class MoveDecisionConnector {
  constructor(options = {}) {
    this.policy = options.policy;
    this.now = options.now || (() => Date.now());

    if (!this.policy || typeof this.policy.selectMove !== "function") {
      throw new Error("MoveDecisionConnector requires a policy with selectMove(gameState)");
    }
  }

  async decide(request) {
    const { fen, legalMoves, observability } = request;
    const start = this.now();

    const decision = this.policy.selectMove({
      fen,
      legalMoves,
      requestId: observability?.request_id,
    });

    return {
      move: decision.move,
      source: decision.source,
      latencyMs: this.now() - start,
      traceId: decision.traceId,
    };
  }
}

module.exports = {
  MoveDecisionConnector,
};
