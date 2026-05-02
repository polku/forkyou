"use strict";

const EndgamesErrorCode = Object.freeze({
  TIMEOUT: "timeout",
  IO: "io",
  CORRUPTION: "corruption",
  UNSUPPORTED: "unsupported",
  UNKNOWN: "unknown",
});

class EndgamesError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "EndgamesError";
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.cause = options.cause;
  }
}

function mapProviderError(error) {
  if (!error || typeof error !== "object") {
    return new EndgamesError(EndgamesErrorCode.UNKNOWN, "Unknown provider error", {
      retryable: false,
      cause: error,
    });
  }

  const type = error.type;

  if (type === "timeout") {
    return new EndgamesError(EndgamesErrorCode.TIMEOUT, error.message || "Endgames lookup timed out", {
      retryable: true,
      cause: error,
    });
  }

  if (type === "io") {
    return new EndgamesError(EndgamesErrorCode.IO, error.message || "I/O failure from endgames provider", {
      retryable: true,
      cause: error,
    });
  }

  if (type === "corruption") {
    return new EndgamesError(
      EndgamesErrorCode.CORRUPTION,
      error.message || "Corrupt endgames data from provider",
      {
        retryable: false,
        cause: error,
      }
    );
  }

  if (type === "unsupported") {
    return new EndgamesError(
      EndgamesErrorCode.UNSUPPORTED,
      error.message || "Position is outside provider support",
      {
        retryable: false,
        cause: error,
      }
    );
  }

  return new EndgamesError(EndgamesErrorCode.UNKNOWN, error.message || "Unknown provider error", {
    retryable: false,
    cause: error,
  });
}

module.exports = {
  EndgamesError,
  EndgamesErrorCode,
  mapProviderError,
};
