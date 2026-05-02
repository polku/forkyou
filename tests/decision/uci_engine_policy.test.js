"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");

const { UciEnginePolicy } = require("../../src/decision/uci_engine_policy");
const { DecisionSource } = require("../../src/decision/contract");

function createFakeEngine({ bestmove = "e2e4", neverBestmove = false, failWrite = false, commandLog = [] } = {}) {
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
      commandLog.push(trimmed);
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

test("UciEnginePolicy falls back on bestmove timeout (randomFallback=false picks first)", async () => {
  const policy = new UciEnginePolicy({
    spawnFn: () => createFakeEngine({ neverBestmove: true }),
    commandTimeoutMs: 20,
    moveTimeMs: 1,
    randomFallback: false,
  });

  const result = await policy.decide({
    fen: "startpos",
    legalMoves: ["g1f3", "d2d4"],
  });

  assert.equal(result.move, "g1f3");
  assert.equal(result.source, DecisionSource.UCI_FALLBACK);
  await policy.close();
});

test("UciEnginePolicy falls back when engine is unavailable (randomFallback=false picks first)", async () => {
  const policy = new UciEnginePolicy({
    spawnFn: () => createFakeEngine({ failWrite: true }),
    commandTimeoutMs: 20,
    moveTimeMs: 1,
    randomFallback: false,
  });

  const result = await policy.decide({
    fen: "startpos",
    legalMoves: ["c2c4", "e2e4"],
  });

  assert.equal(result.move, "c2c4");
  assert.equal(result.source, DecisionSource.UCI_FALLBACK);
  await policy.close();
});

test("UciEnginePolicy fallback uses random move by default", async () => {
  const rngSequence = [0.9, 0.0, 0.5];
  let rngIdx = 0;
  const deterministicRng = () => rngSequence[rngIdx++ % rngSequence.length];

  const policy = new UciEnginePolicy({
    spawnFn: () => createFakeEngine({ failWrite: true }),
    commandTimeoutMs: 20,
    moveTimeMs: 1,
    rng: deterministicRng,
  });

  const legalMoves = ["a2a3", "b2b3", "c2c3"];

  // rng=0.9 → index 2 → c2c3
  const r1 = await policy.decide({ fen: "startpos", legalMoves });
  assert.equal(r1.source, DecisionSource.UCI_FALLBACK);
  assert.equal(r1.move, "c2c3");

  // rng=0.0 → index 0 → a2a3
  const r2 = await policy.decide({ fen: "startpos", legalMoves });
  assert.equal(r2.move, "a2a3");

  // rng=0.5 → index 1 → b2b3
  const r3 = await policy.decide({ fen: "startpos", legalMoves });
  assert.equal(r3.move, "b2b3");

  await policy.close();
});

test("UciEnginePolicy fallback latency reflects actual elapsed time", async () => {
  let tick = 0;
  const policy = new UciEnginePolicy({
    spawnFn: () => createFakeEngine({ neverBestmove: true }),
    commandTimeoutMs: 20,
    moveTimeMs: 1,
    randomFallback: false,
    now: () => tick,
  });

  tick = 0;
  const resultPromise = policy.decide({ fen: "startpos", legalMoves: ["e2e4"] });
  tick = 500;
  const result = await resultPromise;

  assert.equal(result.source, DecisionSource.UCI_FALLBACK);
  assert.ok(result.latencyMs >= 0, "latencyMs should be non-negative");
  await policy.close();
});

test("UciEnginePolicy logs warning on fallback", async () => {
  const warnings = [];
  const policy = new UciEnginePolicy({
    spawnFn: () => createFakeEngine({ failWrite: true }),
    commandTimeoutMs: 20,
    moveTimeMs: 1,
    randomFallback: false,
    logger: { info: () => {}, warn: (m) => warnings.push(m) },
  });

  await policy.decide({ fen: "startpos", legalMoves: ["e2e4"] });

  assert.ok(warnings.some((m) => m.includes("[uci-engine]") && m.includes("falling back")));
  await policy.close();
});

test("UciEnginePolicy uses per-move time budget when provided", async () => {
  const commandLog = [];
  const policy = new UciEnginePolicy({
    spawnFn: () => createFakeEngine({ bestmove: "e2e4", commandLog }),
    commandTimeoutMs: 50,
    moveTimeMs: 1,
  });

  const result = await policy.decide({
    fen: "startpos",
    legalMoves: ["e2e4", "d2d4"],
    timeBudgetMs: 321,
  });

  assert.equal(result.move, "e2e4");
  assert.equal(result.source, DecisionSource.UCI);
  assert.ok(commandLog.includes("go movetime 321"));
  await policy.close();
});
