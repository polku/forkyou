"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { LichessClient, parseNdjson } = require("../../src/bot/lichess_client");

function responseOk(body) {
  return {
    ok: true,
    status: 200,
    async text() {
      return body;
    },
  };
}

test("parseNdjson yields parsed objects per line", async () => {
  const payload = '{"type":"a"}\n{"type":"b","x":1}\n';
  const out = [];

  for await (const row of parseNdjson(responseOk(payload))) {
    out.push(row);
  }

  assert.deepEqual(out, [{ type: "a" }, { type: "b", x: 1 }]);
});

test("parseNdjson throws on non-ok response", async () => {
  const bad = {
    ok: false,
    status: 401,
    async text() {
      return "unauthorized";
    },
  };

  await assert.rejects(async () => {
    for await (const _row of parseNdjson(bad)) {
      // no-op
    }
  }, /401/);
});

test("LichessClient sends auth header for event stream", async () => {
  const calls = [];

  const client = new LichessClient({
    token: "tkn",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return responseOk('{"type":"gameStart","game":{"id":"g1","color":"white"}}\n');
    },
  });

  const rows = [];
  for await (const row of client.streamIncomingEvents()) {
    rows.push(row);
  }

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/stream\/event$/);
  assert.equal(calls[0].options.headers.Authorization, "Bearer tkn");
  assert.equal(rows[0].type, "gameStart");
});

test("LichessClient declines challenge with encoded reason", async () => {
  const calls = [];
  const client = new LichessClient({
    token: "tkn",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return responseOk("");
    },
  });

  await client.declineChallenge("abc123", "timeControl");

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/challenge\/abc123\/decline$/);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.body, "reason=timeControl");
});
