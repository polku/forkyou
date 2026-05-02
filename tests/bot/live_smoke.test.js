"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { runLiveSmoke } = require("../../scripts/bot/live_smoke");

test("live smoke fails fast when token missing", async () => {
  const prev = process.env.LICHESS_BOT_TOKEN;
  delete process.env.LICHESS_BOT_TOKEN;

  await assert.rejects(async () => {
    await runLiveSmoke();
  }, /Missing LICHESS_BOT_TOKEN/);

  if (prev) {
    process.env.LICHESS_BOT_TOKEN = prev;
  }
});
