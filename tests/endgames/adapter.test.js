"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { SyzygyEndgamesAdapter } = require("../../src/endgames/adapter");
const { EndgamesErrorCode } = require("../../src/endgames/errors");

function buildQuery() {
  return {
    fen: "8/8/8/8/8/8/4K3/4k3 w - - 0 1",
    requestId: "req-123",
    timeoutMs: 50,
  };
}

test("successful lookup path returns hit with move payload", async () => {
  const adapter = new SyzygyEndgamesAdapter({
    provider: {
      lookup: async () => ({ uci: "e2e3", dtz: 2, dtm: undefined, wdl: 1 }),
    },
  });

  const result = await adapter.resolveBestMove(buildQuery());

  assert.equal(result.status, "hit");
  assert.equal(result.move.uci, "e2e3");
  assert.equal(result.error, undefined);
});

test("timeout path maps to timeout contract taxonomy", async () => {
  const adapter = new SyzygyEndgamesAdapter({
    provider: {
      lookup: async () => {
        throw { type: "timeout", message: "provider timeout" };
      },
    },
  });

  const result = await adapter.resolveBestMove(buildQuery());

  assert.equal(result.status, "timeout");
  assert.equal(result.error.code, EndgamesErrorCode.TIMEOUT);
  assert.equal(result.error.retryable, true);
});

test("unsupported-position path maps to miss with unsupported error code", async () => {
  const adapter = new SyzygyEndgamesAdapter({
    provider: {
      lookup: async () => {
        throw { type: "unsupported", message: "position not in tablebase" };
      },
    },
  });

  const result = await adapter.resolveBestMove(buildQuery());

  assert.equal(result.status, "miss");
  assert.equal(result.error.code, EndgamesErrorCode.UNSUPPORTED);
  assert.equal(result.error.retryable, false);
});
