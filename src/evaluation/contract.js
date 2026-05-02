"use strict";

const EvalMode = Object.freeze({
  CLASSIC: "classic",
  NNUE_READY: "nnue_ready",
  HYBRID: "hybrid",
});

function assertValidEvalResult(result) {
  if (!result || typeof result !== "object") {
    throw new Error("Evaluator returned invalid result object");
  }

  if (!Number.isInteger(result.scoreCp)) {
    throw new Error("Evaluator result requires integer scoreCp");
  }

  if (result.mateDistance !== undefined && !Number.isInteger(result.mateDistance)) {
    throw new Error("Evaluator result mateDistance must be an integer when provided");
  }

  if (result.wdlProxy !== undefined) {
    const { win, draw, loss } = result.wdlProxy;
    if (![win, draw, loss].every((x) => typeof x === "number" && Number.isFinite(x))) {
      throw new Error("Evaluator result wdlProxy must contain finite win/draw/loss numbers");
    }
  }
}

module.exports = {
  EvalMode,
  assertValidEvalResult,
};
