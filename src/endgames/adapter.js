"use strict";

const { EndgamesErrorCode, mapProviderError } = require("./errors");

class SyzygyEndgamesAdapter {
  constructor(options = {}) {
    this.providerId = options.providerId || "syzygy";
    this.provider = options.provider;
    this.now = options.now || (() => Date.now());

    if (!this.provider || typeof this.provider.lookup !== "function") {
      throw new Error("SyzygyEndgamesAdapter requires a provider with lookup(query)");
    }
  }

  async resolveBestMove(query) {
    const start = this.now();

    try {
      const hit = await this.provider.lookup(query);

      return {
        providerId: this.providerId,
        status: "hit",
        move: {
          uci: hit.uci,
          dtz: hit.dtz,
          dtm: hit.dtm,
          wdl: hit.wdl,
        },
        latencyMs: this.now() - start,
        traceId: query.requestId,
      };
    } catch (rawError) {
      const error = mapProviderError(rawError);

      if (error.code === EndgamesErrorCode.UNSUPPORTED) {
        return {
          providerId: this.providerId,
          status: "miss",
          latencyMs: this.now() - start,
          traceId: query.requestId,
          error,
        };
      }

      if (error.code === EndgamesErrorCode.TIMEOUT) {
        return {
          providerId: this.providerId,
          status: "timeout",
          latencyMs: this.now() - start,
          traceId: query.requestId,
          error,
        };
      }

      return {
        providerId: this.providerId,
        status: "error",
        latencyMs: this.now() - start,
        traceId: query.requestId,
        error,
      };
    }
  }
}

module.exports = {
  SyzygyEndgamesAdapter,
};
