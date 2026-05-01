/**
 * FOR-39 — Endgames benchmark harness
 * Measures p50/p95/p99 latency and failure-rate against EndgamesAdapter (FOR-38 contract).
 *
 * Usage:
 *   npx ts-node benchmarks/endgames/run-benchmark.ts [--gate <ci_gate|release_gate>] [--runs <n>] [--timeoutMs <ms>]
 *
 * Default: stub adapter (no real tablebase needed), 100 runs per position, 200 ms timeout, ci_gate profile.
 * Wire a real adapter by setting ENDGAMES_ADAPTER_MODULE env var to a module path that
 * default-exports an object implementing EndgamesAdapter.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

// ── Contract types (from FOR-38) ─────────────────────────────────────────────

export type EndgamesProviderId = "tablebase_local" | "tablebase_remote" | string;

export type EndgamesQuery = {
  fen: string;
  maxPieces?: number;
  timeoutMs: number;
  requestId: string;
};

export type EndgamesStatus = "hit" | "miss" | "timeout" | "unavailable" | "error";

export type EndgamesMove = {
  uci: string;
  dtz?: number;
  dtm?: number;
  wdl?: -2 | -1 | 0 | 1 | 2;
};

export type EndgamesErrorCode =
  | "INVALID_FEN"
  | "UNSUPPORTED_POSITION"
  | "NOT_INITIALIZED"
  | "TIMEOUT"
  | "UPSTREAM_4XX"
  | "UPSTREAM_5XX"
  | "TRANSPORT"
  | "RATE_LIMITED"
  | "INTERNAL";

export type EndgamesDomainError = {
  code: EndgamesErrorCode;
  message: string;
  retryable: boolean;
  cause?: unknown;
};

export type EndgamesResult = {
  providerId: EndgamesProviderId;
  status: EndgamesStatus;
  move?: EndgamesMove;
  latencyMs: number;
  traceId: string;
  error?: EndgamesDomainError;
};

export interface EndgamesAdapter {
  resolveBestMove(query: EndgamesQuery): Promise<EndgamesResult>;
}

// ── Stub adapter (mimics realistic local Syzygy latency) ────────────────────

function fenPieceCount(fen: string): number {
  const board = fen.split(" ")[0] ?? "";
  return (board.match(/[pnbrqkPNBRQK]/g) ?? []).length;
}

function isValidFen(fen: string): boolean {
  if (!fen || fen.trim() === "") return false;
  const parts = fen.trim().split(" ");
  if (parts.length < 2) return false;
  const board = parts[0];
  const ranks = board.split("/");
  if (ranks.length !== 8) return false;
  const hasWhiteKing = board.includes("K");
  const hasBlackKing = board.includes("k");
  return hasWhiteKing && hasBlackKing;
}

class StubEndgamesAdapter implements EndgamesAdapter {
  constructor(private readonly providerId: EndgamesProviderId = "tablebase_local") {}

  async resolveBestMove(query: EndgamesQuery): Promise<EndgamesResult> {
    const t0 = performance.now();
    const traceId = crypto.randomUUID();

    // Simulate I/O — local disk read: base 1ms + jitter up to 8ms
    const simulatedLatency = 1 + Math.random() * 8;
    await delay(simulatedLatency);

    if (!isValidFen(query.fen)) {
      return {
        providerId: this.providerId,
        status: "error",
        latencyMs: performance.now() - t0,
        traceId,
        error: {
          code: "INVALID_FEN",
          message: `FEN validation failed: "${query.fen}"`,
          retryable: false,
        },
      };
    }

    const pieces = fenPieceCount(query.fen);
    if (pieces > 6) {
      return {
        providerId: this.providerId,
        status: "miss",
        latencyMs: performance.now() - t0,
        traceId,
        error: {
          code: "UNSUPPORTED_POSITION",
          message: `Position has ${pieces} pieces — outside 6-piece tablebase range`,
          retryable: false,
        },
      };
    }

    // Hit: return a plausible best move
    return {
      providerId: this.providerId,
      status: "hit",
      move: { uci: "e1e2", dtz: 10, wdl: 2 },
      latencyMs: performance.now() - t0,
      traceId,
    };
  }
}

// ── Dataset manifest loader ──────────────────────────────────────────────────

interface PositionEntry {
  id: string;
  fen: string;
  description: string;
  halfmoveClock: number;
  expectedStatus?: string;
  expectedWdl?: string;
}

interface CategoryEntry {
  id: string;
  label: string;
  expectedStatus?: string;
  positions: PositionEntry[];
}

interface PositionsManifest {
  version: string;
  categories: CategoryEntry[];
}

function loadManifest(manifestPath: string): PositionEntry[] {
  const raw = fs.readFileSync(manifestPath, "utf-8");
  const manifest: PositionsManifest = JSON.parse(raw);
  const positions: PositionEntry[] = [];
  for (const cat of manifest.categories) {
    for (const pos of cat.positions) {
      positions.push({
        ...pos,
        expectedStatus: pos.expectedStatus ?? cat.expectedStatus,
      });
    }
  }
  return positions;
}

// ── Percentile calculation ───────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

// ── Benchmark runner ─────────────────────────────────────────────────────────

interface PositionResult {
  positionId: string;
  fen: string;
  runs: number;
  hitCount: number;
  missCount: number;
  errorCount: number;
  timeoutCount: number;
  unavailableCount: number;
  failureRate: number;
  p50: number;
  p95: number;
  p99: number;
  mean: number;
  min: number;
  max: number;
  correctStatusRate: number | null;
  expectedStatus: string | undefined;
}

interface BenchmarkReport {
  runAt: string;
  contractRef: string;
  manifestVersion: string;
  providerId: string;
  runsPerPosition: number;
  timeoutMs: number;
  positions: PositionResult[];
  aggregate: {
    totalRuns: number;
    overallFailureRate: number;
    overallCorrectStatusRate: number;
    p50: number;
    p95: number;
    p99: number;
    mean: number;
  };
}

async function runBenchmark(
  adapter: EndgamesAdapter,
  positions: PositionEntry[],
  runsPerPosition: number,
  timeoutMs: number,
  providerId: string
): Promise<BenchmarkReport> {
  const positionResults: PositionResult[] = [];

  for (const pos of positions) {
    const latencies: number[] = [];
    const statusCounts: Record<string, number> = {
      hit: 0, miss: 0, error: 0, timeout: 0, unavailable: 0,
    };

    for (let i = 0; i < runsPerPosition; i++) {
      const requestId = `bench-${pos.id}-${i}`;
      let result: EndgamesResult;

      try {
        const racePromise = adapter.resolveBestMove({
          fen: pos.fen,
          timeoutMs,
          requestId,
        });
        result = await Promise.race([
          racePromise,
          delay(timeoutMs).then((): EndgamesResult => ({
            providerId,
            status: "timeout",
            latencyMs: timeoutMs,
            traceId: requestId,
            error: { code: "TIMEOUT", message: "Benchmark timeout", retryable: true },
          })),
        ]);
      } catch (err) {
        result = {
          providerId,
          status: "error",
          latencyMs: timeoutMs,
          traceId: requestId,
          error: { code: "INTERNAL", message: String(err), retryable: false },
        };
      }

      latencies.push(result.latencyMs);
      statusCounts[result.status] = (statusCounts[result.status] ?? 0) + 1;
    }

    latencies.sort((a, b) => a - b);
    const failureCount = statusCounts.error + statusCounts.timeout + statusCounts.unavailable;
    const correctStatusCount =
      pos.expectedStatus != null
        ? (statusCounts[pos.expectedStatus] ?? 0)
        : null;

    positionResults.push({
      positionId: pos.id,
      fen: pos.fen,
      runs: runsPerPosition,
      hitCount: statusCounts.hit,
      missCount: statusCounts.miss,
      errorCount: statusCounts.error,
      timeoutCount: statusCounts.timeout,
      unavailableCount: statusCounts.unavailable,
      failureRate: failureCount / runsPerPosition,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      mean: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      min: latencies[0] ?? 0,
      max: latencies[latencies.length - 1] ?? 0,
      correctStatusRate:
        correctStatusCount !== null ? correctStatusCount / runsPerPosition : null,
      expectedStatus: pos.expectedStatus,
    });

    process.stdout.write(".");
  }

  process.stdout.write("\n");

  const allLatencies = positionResults.flatMap((pr) =>
    Array(pr.runs).fill(pr.p50)
  ).sort((a, b) => a - b);

  const totalRuns = positionResults.reduce((s, p) => s + p.runs, 0);
  const totalFailures = positionResults.reduce(
    (s, p) => s + (p.errorCount + p.timeoutCount + p.unavailableCount),
    0
  );
  const correctStatusPositions = positionResults.filter(
    (p) => p.correctStatusRate !== null
  );
  const overallCorrectStatus =
    correctStatusPositions.length > 0
      ? correctStatusPositions.reduce((s, p) => s + (p.correctStatusRate ?? 0), 0) /
        correctStatusPositions.length
      : 1;

  return {
    runAt: new Date().toISOString(),
    contractRef: "EndgameContract v1 (FOR-37 / FOR-38)",
    manifestVersion: "1.0.0",
    providerId,
    runsPerPosition,
    timeoutMs,
    positions: positionResults,
    aggregate: {
      totalRuns,
      overallFailureRate: totalFailures / totalRuns,
      overallCorrectStatusRate: overallCorrectStatus,
      p50: percentile(allLatencies, 50),
      p95: percentile(allLatencies, 95),
      p99: percentile(allLatencies, 99),
      mean: allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length,
    },
  };
}

// ── Threshold gate check ─────────────────────────────────────────────────────

const ALLOWED_GATE_KEYS = ["ci_gate", "release_gate"] as const;
type GateKey = (typeof ALLOWED_GATE_KEYS)[number];

interface Thresholds {
  maxFailureRate: number;
  maxP50Ms: number;
  maxP95Ms: number;
  maxP99Ms: number;
  minCorrectStatusRate: number;
}

type ThresholdsDocument = Record<string, Thresholds | unknown> & {
  version?: string;
  contractRef?: string;
};

function checkGates(report: BenchmarkReport, thresholds: Thresholds): boolean {
  const agg = report.aggregate;
  const failures: string[] = [];

  if (agg.overallFailureRate > thresholds.maxFailureRate)
    failures.push(
      `failure-rate ${(agg.overallFailureRate * 100).toFixed(2)}% > ${(thresholds.maxFailureRate * 100).toFixed(2)}%`
    );
  if (agg.p50 > thresholds.maxP50Ms)
    failures.push(`p50 ${agg.p50.toFixed(1)}ms > ${thresholds.maxP50Ms}ms`);
  if (agg.p95 > thresholds.maxP95Ms)
    failures.push(`p95 ${agg.p95.toFixed(1)}ms > ${thresholds.maxP95Ms}ms`);
  if (agg.p99 > thresholds.maxP99Ms)
    failures.push(`p99 ${agg.p99.toFixed(1)}ms > ${thresholds.maxP99Ms}ms`);
  if (agg.overallCorrectStatusRate < thresholds.minCorrectStatusRate)
    failures.push(
      `correct-status-rate ${(agg.overallCorrectStatusRate * 100).toFixed(2)}% < ${(thresholds.minCorrectStatusRate * 100).toFixed(2)}%`
    );

  if (failures.length > 0) {
    console.error("\n[GATE FAIL] Thresholds violated:");
    failures.forEach((f) => console.error(`  ✗ ${f}`));
    return false;
  }

  console.log("\n[GATE PASS] All thresholds satisfied.");
  return true;
}

// ── Output formatter ─────────────────────────────────────────────────────────

function printSummary(report: BenchmarkReport): void {
  const agg = report.aggregate;
  console.log("\n=== Endgames Benchmark Results ===");
  console.log(`Provider:    ${report.providerId}`);
  console.log(`Run at:      ${report.runAt}`);
  console.log(`Contract:    ${report.contractRef}`);
  console.log(`Total runs:  ${agg.totalRuns} (${report.runsPerPosition}/position)`);
  console.log(`Timeout:     ${report.timeoutMs}ms\n`);
  console.log("Aggregate latency:");
  console.log(`  p50=${agg.p50.toFixed(2)}ms  p95=${agg.p95.toFixed(2)}ms  p99=${agg.p99.toFixed(2)}ms  mean=${agg.mean.toFixed(2)}ms`);
  console.log(`  failure-rate=${(agg.overallFailureRate * 100).toFixed(2)}%`);
  console.log(`  correct-status-rate=${(agg.overallCorrectStatusRate * 100).toFixed(2)}%\n`);
  console.log("Per-position summary:");
  console.log("  ID".padEnd(12) + "p50".padStart(8) + "p95".padStart(8) + "p99".padStart(8) + "fail%".padStart(8) + "ok%".padStart(8));
  for (const p of report.positions) {
    const ok = p.correctStatusRate !== null ? `${(p.correctStatusRate * 100).toFixed(0)}%` : " n/a";
    console.log(
      `  ${p.positionId.padEnd(10)}${p.p50.toFixed(1).padStart(8)}${p.p95.toFixed(1).padStart(8)}${p.p99.toFixed(1).padStart(8)}${(p.failureRate * 100).toFixed(1).padStart(8)}${ok.padStart(8)}`
    );
  }
}

// ── Entrypoint ───────────────────────────────────────────────────────────────

function parseArgs(): { runsPerPosition: number; timeoutMs: number; outputJson: string; gate: GateKey } {
  const args = process.argv.slice(2);
  let runsPerPosition = 100;
  let timeoutMs = 200;
  let outputJson = "benchmarks/endgames/results-latest.json";
  let rawGate = "ci_gate";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--runs" && args[i + 1]) runsPerPosition = parseInt(args[++i], 10);
    if (args[i] === "--timeoutMs" && args[i + 1]) timeoutMs = parseInt(args[++i], 10);
    if (args[i] === "--output" && args[i + 1]) outputJson = args[++i];
    if (args[i] === "--gate" && args[i + 1]) rawGate = args[++i];
  }

  if (!(ALLOWED_GATE_KEYS as ReadonlyArray<string>).includes(rawGate)) {
    console.error(
      `[ERROR] Invalid --gate value "${rawGate}". Allowed values: ${ALLOWED_GATE_KEYS.join(", ")}.`
    );
    process.exit(1);
  }

  return { runsPerPosition, timeoutMs, outputJson, gate: rawGate as GateKey };
}

async function main(): Promise<void> {
  const { runsPerPosition, timeoutMs, outputJson, gate } = parseArgs();

  const manifestPath = path.resolve(__dirname, "positions-manifest.json");
  const thresholdsPath = path.resolve(__dirname, "thresholds.json");

  console.log(`Loading manifest: ${manifestPath}`);
  const positions = loadManifest(manifestPath);
  console.log(`Loaded ${positions.length} positions.`);

  let adapter: EndgamesAdapter;
  const adapterModule = process.env["ENDGAMES_ADAPTER_MODULE"];
  if (adapterModule) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    adapter = require(path.resolve(adapterModule)).default as EndgamesAdapter;
    console.log(`Using adapter from: ${adapterModule}`);
  } else {
    adapter = new StubEndgamesAdapter("tablebase_local");
    console.log("Using stub adapter (set ENDGAMES_ADAPTER_MODULE for real adapter).");
  }

  console.log(`\nRunning ${runsPerPosition} iterations per position (gate: ${gate})…`);
  const report = await runBenchmark(adapter, positions, runsPerPosition, timeoutMs, "tablebase_local");

  printSummary(report);

  // Load thresholds, select gate profile, and check gates
  if (fs.existsSync(thresholdsPath)) {
    const allThresholds: ThresholdsDocument = JSON.parse(fs.readFileSync(thresholdsPath, "utf-8"));
    const gateProfile = allThresholds[gate] as Thresholds | undefined;

    if (gateProfile == null) {
      console.error(
        `[ERROR] Gate key "${gate}" not found in thresholds.json. Available keys: ${Object.keys(allThresholds).filter((k) => !k.startsWith("_") && k !== "version" && k !== "contractRef").join(", ")}.`
      );
      process.exit(1);
    }

    console.log(`\n[GATE] Profile: ${gate}`);
    console.log(`  maxP50Ms=${gateProfile.maxP50Ms}ms  maxP95Ms=${gateProfile.maxP95Ms}ms  maxP99Ms=${gateProfile.maxP99Ms}ms`);
    console.log(`  maxFailureRate=${(gateProfile.maxFailureRate * 100).toFixed(2)}%  minCorrectStatusRate=${(gateProfile.minCorrectStatusRate * 100).toFixed(2)}%`);

    const passed = checkGates(report, gateProfile);
    if (!passed) process.exitCode = 1;
  } else {
    console.warn("\n[WARN] No thresholds.json found — skipping gate check.");
  }

  // Write JSON report
  const outPath = path.resolve(outputJson);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nReport written to: ${outPath}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
