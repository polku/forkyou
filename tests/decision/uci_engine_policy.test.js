"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");

const { UciEnginePolicy } = require("../../src/decision/uci_engine_policy");
const { DecisionSource } = require("../../src/decision/contract");

function createFakeEngine({ bestmove = "e2e4", neverBestmove = false, failWrite = false } = {}) {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.killed = false;
  proc.kill = () => {
    proc.killed = true;
    proc.emit("exit", 0);
  };
  proc.stdin = {
    write(command, cb) {
      if (failWrite) {
        cb(new Error("write failed"));
        return;
      }
      const trimmed = command.trim();
      if (trimmed === "uci") {
        setImmediate(() => proc.stdout.emit("data", Buffer.from("uciok\n")));
      } else if (trimmed === "isready") {
        setImmediate(() => proc.stdout.emit("data", Buffer.from("readyok\n")));
      } else if (trimmed.startsWith("go movetime ") && !neverBestmove) {
        setImmediate(() => proc.stdout.emit("data", Buffer.from(`bestmove ${bestmove}\n`)));
      }
      cb(null);
    },
  };
  return proc;
}

test("UciEnginePolicy returns engine move on success", async () => {
  const policy = new UciEnginePolicy({
    spawnFn: () => createFakeEngine({ bestmove: "e2e4" }),
    commandTimeoutMs: 50,
    moveTimeMs: 1,
  });

  const result = await policy.decide({
    fen: "startpos",
    legalMoves: ["e2e4", "d2d4"],
  });

  assert.equal(result.move, "e2e4");
  assert.equal(result.source, DecisionSource.UCI);
  await policy.close();
});

test("UciEnginePolicy falls back on bestmove timeout", async () => {
  const policy = new UciEnginePolicy({
    spawnFn: () => createFakeEngine({ neverBestmove: true }),
    commandTimeoutMs: 20,
    moveTimeMs: 1,
  });

  const result = await policy.decide({
    fen: "startpos",
    legalMoves: ["g1f3", "d2d4"],
  });

  assert.equal(result.move, "g1f3");
  assert.equal(result.source, DecisionSource.UCI_FALLBACK);
  await policy.close();
});

test("UciEnginePolicy falls back when engine is unavailable", async () => {
  const policy = new UciEnginePolicy({
    spawnFn: () => createFakeEngine({ failWrite: true }),
    commandTimeoutMs: 20,
    moveTimeMs: 1,
  });

  const result = await policy.decide({
    fen: "startpos",
    legalMoves: ["c2c4", "e2e4"],
  });

  assert.equal(result.move, "c2c4");
  assert.equal(result.source, DecisionSource.UCI_FALLBACK);
  await policy.close();
});
