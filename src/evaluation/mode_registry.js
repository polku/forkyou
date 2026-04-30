"use strict";

const { EvalMode } = require("./contract");

const FALLBACK_REASONS = Object.freeze({
  NNUE_UNAVAILABLE: "nnue_unavailable",
  HYBRID_NNUE_UNAVAILABLE: "hybrid_nnue_unavailable",
  HYBRID_DISABLED: "hybrid_disabled",
  UNKNOWN_MODE: "unknown_mode",
});

class EvalModeRegistry {
  constructor(options = {}) {
    this.defaultMode = options.defaultMode || EvalMode.CLASSIC;
    this._logger = options.logger || null;
  }

  resolve(requestedMode, capabilities = {}) {
    const mode = requestedMode || this.defaultMode;

    if (mode === EvalMode.CLASSIC) {
      return { mode: EvalMode.CLASSIC, fallbackReason: null };
    }

    if (mode === EvalMode.NNUE_READY) {
      if (capabilities.nnueAvailable) {
        return { mode: EvalMode.NNUE_READY, fallbackReason: null };
      }
      return this._fallback(FALLBACK_REASONS.NNUE_UNAVAILABLE, mode);
    }

    if (mode === EvalMode.HYBRID) {
      if (capabilities.hybridEnabled && capabilities.nnueAvailable) {
        return { mode: EvalMode.HYBRID, fallbackReason: null };
      }
      const reason = !capabilities.nnueAvailable
        ? FALLBACK_REASONS.HYBRID_NNUE_UNAVAILABLE
        : FALLBACK_REASONS.HYBRID_DISABLED;
      return this._fallback(reason, mode);
    }

    return this._fallback(FALLBACK_REASONS.UNKNOWN_MODE, mode);
  }

  _fallback(reason, requestedMode) {
    if (this._logger) {
      this._logger.warn(
        `EvalModeRegistry: downgrading from "${requestedMode}" to classic — reason: ${reason}`
      );
    }
    return { mode: EvalMode.CLASSIC, fallbackReason: reason };
  }
}

module.exports = {
  EvalModeRegistry,
  FALLBACK_REASONS,
};
