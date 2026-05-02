"use strict";

const { spawn } = require("node:child_process");
const { DecisionSource, assertValidDecisionResult } = require("./contract");

class UciEngineError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "UciEngineError";
    this.code = code;
  }
}

class UciEnginePolicy {
  constructor(options = {}) {
    this.enginePath = options.enginePath || process.env.UCI_ENGINE_PATH || "stockfish";
    this.moveTimeMs = Number(options.moveTimeMs || process.env.UCI_MOVE_TIME_MS || "100");
    this.startTimeoutMs = Number(options.startTimeoutMs || 2000);
    this.commandTimeoutMs = Number(options.commandTimeoutMs || 1000);
    this.now = options.now || (() => Date.now());
    this.spawnFn = options.spawnFn || spawn;
    this.logger = options.logger || { info: () => {}, warn: () => {} };
    this.randomFallback = options.randomFallback !== undefined ? Boolean(options.randomFallback) : true;
    this.rng = options.rng || Math.random;

    this.proc = null;
    this.buffer = "";
    this.lineQueue = [];
    this.waiters = [];
    this.pending = Promise.resolve();
    this.starting = null;
  }

  async decide(context) {
    const start = this.now();

    try {
      await this.#ensureStarted();
      const move = await this.#withLock(async () => this.#queryBestMove(context.fen));
      if (!move || !context.legalMoves.includes(move)) {
        throw new UciEngineError(`engine returned illegal/empty move: ${move || "empty"}`, "illegal_move");
      }

      const result = {
        move,
        latencyMs: Math.max(0, this.now() - start),
        source: DecisionSource.UCI,
      };
      assertValidDecisionResult(result);
      return result;
    } catch (err) {
      this.logger.warn(`[uci-engine] falling back to random legal move: ${err.message}`);
      return this.#fallbackDecision(context, start);
    }
  }

  async close() {
    if (!this.proc) {
      return;
    }
    const proc = this.proc;
    this.proc = null;

    try {
      proc.stdin.write("quit\n");
    } catch (_err) {
      // Ignore write failures while shutting down.
    }

    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (!proc.killed) {
          proc.kill("SIGKILL");
        }
        resolve();
      }, 500);
      proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  #fallbackDecision(context, start) {
    const moves = context?.legalMoves;
    if (!Array.isArray(moves) || moves.length === 0) {
      throw new Error("UciEnginePolicy requires non-empty legalMoves array");
    }
    const move = this.randomFallback
      ? moves[Math.floor(this.rng() * moves.length)]
      : moves[0];
    const result = {
      move,
      latencyMs: Math.max(0, this.now() - start),
      source: DecisionSource.UCI_FALLBACK,
    };
    assertValidDecisionResult(result);
    return result;
  }

  #withLock(fn) {
    const run = this.pending.then(fn, fn);
    this.pending = run.catch(() => {});
    return run;
  }

  async #ensureStarted() {
    if (this.proc) {
      return;
    }
    if (this.starting) {
      return this.starting;
    }
    this.starting = this.#startProcess();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async #startProcess() {
    const proc = this.spawnFn(this.enginePath, [], { stdio: ["pipe", "pipe", "pipe"] });
    this.proc = proc;
    this.buffer = "";
    this.lineQueue = [];
    this.waiters = [];

    proc.stdout.on("data", (chunk) => this.#onStdout(chunk.toString("utf8")));
    proc.stderr.on("data", () => {});
    proc.on("error", (err) => {
      this.logger.warn(`[uci-engine] process error (path=${this.enginePath}): ${err.message}`);
      this.proc = null;
    });
    proc.on("exit", (code) => {
      if (this.proc === proc) {
        this.logger.warn(`[uci-engine] process exited unexpectedly (code=${code})`);
        this.proc = null;
      }
      while (this.waiters.length > 0) {
        const waiter = this.waiters.shift();
        waiter.reject(new UciEngineError("engine process exited", "unavailable"));
      }
    });

    try {
      await this.#write("uci\n");
      await this.#waitForLine((line) => line === "uciok", this.startTimeoutMs, "uci handshake timeout");
      await this.#write("isready\n");
      await this.#waitForLine((line) => line === "readyok", this.startTimeoutMs, "ready handshake timeout");
    } catch (err) {
      // Ensure the zombie proc doesn't block future restarts.
      if (this.proc === proc) {
        this.proc = null;
      }
      try { proc.kill(); } catch (_) {}
      throw err;
    }
  }

  async #queryBestMove(fen) {
    if (typeof fen !== "string" || fen.trim() === "") {
      throw new UciEngineError("missing fen for UCI query", "invalid_input");
    }
    await this.#write(`position fen ${fen}\n`);
    await this.#write(`go movetime ${this.moveTimeMs}\n`);
    const line = await this.#waitForLine(
      (value) => value.startsWith("bestmove "),
      this.commandTimeoutMs + this.moveTimeMs,
      "bestmove timeout"
    );
    return line.split(/\s+/)[1] || null;
  }

  async #write(command) {
    if (!this.proc || !this.proc.stdin) {
      throw new UciEngineError("engine process unavailable", "unavailable");
    }
    await new Promise((resolve, reject) => {
      this.proc.stdin.write(command, (err) => {
        if (err) {
          reject(new UciEngineError(`engine write failed: ${err.message}`, "unavailable"));
          return;
        }
        resolve();
      });
    });
  }

  #onStdout(text) {
    this.buffer += text;
    while (true) {
      const idx = this.buffer.indexOf("\n");
      if (idx < 0) {
        break;
      }
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (line.length === 0) {
        continue;
      }
      this.#pushLine(line);
    }
  }

  #pushLine(line) {
    if (this.waiters.length > 0) {
      const waiter = this.waiters[0];
      if (waiter.matcher(line)) {
        this.waiters.shift();
        clearTimeout(waiter.timer);
        waiter.resolve(line);
        return;
      }
    }
    this.lineQueue.push(line);
  }

  #waitForLine(matcher, timeoutMs, timeoutMessage) {
    for (let i = 0; i < this.lineQueue.length; i += 1) {
      if (matcher(this.lineQueue[i])) {
        return Promise.resolve(this.lineQueue.splice(i, 1)[0]);
      }
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.resolve === resolve);
        if (idx >= 0) {
          this.waiters.splice(idx, 1);
        }
        reject(new UciEngineError(timeoutMessage, "timeout"));
      }, timeoutMs);

      this.waiters.push({ matcher, resolve, reject, timer });
    });
  }
}

module.exports = {
  UciEnginePolicy,
  UciEngineError,
};
