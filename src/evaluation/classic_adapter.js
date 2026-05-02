"use strict";

const { EvalMode, assertValidEvalResult } = require("./contract");

class ClassicEvaluatorAdapter {
  constructor(options = {}) {
    this.evaluateClassic = options.evaluateClassic;

    if (typeof this.evaluateClassic !== "function") {
      throw new Error("ClassicEvaluatorAdapter requires evaluateClassic(position, context)");
    }
  }

  evaluate(positionSnapshot, context = {}) {
    const result = this.evaluateClassic(positionSnapshot, context);
    assertValidEvalResult(result);

    return {
      mode: EvalMode.CLASSIC,
      scoreCp: result.scoreCp,
      mateDistance: result.mateDistance,
      wdlProxy: result.wdlProxy,
      traceId: result.traceId || context.requestId,
      diagnostics: {
        ...(result.diagnostics || {}),
        adapter: "classic",
        parity: true,
      },
    };
  }
}

module.exports = {
  ClassicEvaluatorAdapter,
};
