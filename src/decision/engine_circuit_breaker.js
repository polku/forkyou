"use strict";

const { DecisionSource } = require("./contract");

const CircuitState = Object.freeze({
  CLOSED: "closed",
  OPEN: "open",
  HALF_OPEN: "half_open",
});

/**
 * Wraps a primary decision policy with circuit-breaker logic.
 *
 * Monitors the `source` field of each decision result. If the primary policy
 * returns DecisionSource.UCI_FALLBACK instead of DecisionSource.UCI for
 * `threshold` consecutive decisions, the circuit opens and all subsequent
 * calls are routed directly to the fallback policy without attempting the
 * primary.
 *
 * After `recoveryDelayMs` the circuit enters HALF_OPEN and tries the primary
 * once. Success closes the circuit; failure reopens it.
 */
class EngineCircuitBreaker {
  constructor(options = {}) {
    if (!options.primary || typeof options.primary.decide !== "function") {
      throw new Error("EngineCircuitBreaker requires a primary policy with decide(context)");
    }
    if (!options.fallback || typeof options.fallback.decide !== "function") {
      throw new Error("EngineCircuitBreaker requires a fallback policy with decide(context)");
    }

    this.primary = options.primary;
    this.fallback = options.fallback;
    this.threshold = typeof options.threshold === "number" ? options.threshold : 3;
    this.recoveryDelayMs = typeof options.recoveryDelayMs === "number" ? options.recoveryDelayMs : 0;
    this.logger = options.logger || { info: () => {}, warn: () => {} };
    this.now = options.now || (() => Date.now());

    this._state = CircuitState.CLOSED;
    this._consecutiveFailures = 0;
    this._openedAt = null;
  }

  get state() {
    return this._state;
  }

  get consecutiveFailures() {
    return this._consecutiveFailures;
  }

  async decide(context) {
    if (this._state === CircuitState.OPEN) {
      if (this._readyForRecovery()) {
        this._state = CircuitState.HALF_OPEN;
        this.logger.info(
          `[circuit-breaker] engine: entering half-open — attempting recovery after ${this._consecutiveFailures} failures`
        );
      } else {
        this.logger.warn("[circuit-breaker] engine: OPEN — bypassing primary, using fallback");
        return Promise.resolve(this.fallback.decide(context));
      }
    }

    const result = await this.primary.decide(context);
    const primarySucceeded = result.source === DecisionSource.UCI;

    if (primarySucceeded) {
      if (this._consecutiveFailures > 0) {
        this.logger.info(
          `[circuit-breaker] engine: CLOSED — primary recovered after ${this._consecutiveFailures} consecutive fallbacks`
        );
      }
      this._consecutiveFailures = 0;
      this._state = CircuitState.CLOSED;
      this._openedAt = null;
    } else {
      this._consecutiveFailures += 1;

      if (this._state === CircuitState.HALF_OPEN) {
        this.logger.warn("[circuit-breaker] engine: recovery attempt failed — returning to OPEN");
        this._state = CircuitState.OPEN;
        this._openedAt = this.now();
      } else if (this._consecutiveFailures >= this.threshold && this._state === CircuitState.CLOSED) {
        this.logger.warn(
          `[circuit-breaker] engine: OPEN after ${this._consecutiveFailures} consecutive fallbacks` +
            ` (threshold=${this.threshold}); primary will be bypassed until recovery`
        );
        this._state = CircuitState.OPEN;
        this._openedAt = this.now();
      }
    }

    return result;
  }

  async close() {
    if (typeof this.primary.close === "function") {
      await this.primary.close();
    }
  }

  _readyForRecovery() {
    if (this._openedAt === null) {
      return true;
    }
    return this.now() - this._openedAt >= this.recoveryDelayMs;
  }
}

module.exports = { EngineCircuitBreaker, CircuitState };
