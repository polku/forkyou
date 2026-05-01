#!/usr/bin/env node
"use strict";

const fs = require("fs");

function usage() {
  console.error("Usage: node benchmarks/endgames/verify-replay.js <run1.json> <run2.json> <run1.log> <run2.log> [output.json]");
  process.exit(64);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function readText(p) {
  return fs.readFileSync(p, "utf8");
}

function gateVerdict(logText) {
  if (logText.includes("[GATE PASS]")) return "PASS";
  if (logText.includes("[GATE FAIL]")) return "FAIL";
  return "UNKNOWN";
}

function deterministicShape(report) {
  return {
    positions: report.positions.map((p) => ({
      id: p.positionId,
      hit: p.hitCount,
      miss: p.missCount,
      error: p.errorCount,
      timeout: p.timeoutCount,
      unavailable: p.unavailableCount,
      correctStatusRate: p.correctStatusRate,
      expectedStatus: p.expectedStatus,
    })),
    aggregate: {
      totalRuns: report.aggregate.totalRuns,
      overallFailureRate: report.aggregate.overallFailureRate,
      overallUnexpectedFailureRate: report.aggregate.overallUnexpectedFailureRate,
      overallCorrectStatusRate: report.aggregate.overallCorrectStatusRate,
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 4) usage();

  const [run1Path, run2Path, log1Path, log2Path, outPath] = args;
  const run1 = readJson(run1Path);
  const run2 = readJson(run2Path);
  const verdict1 = gateVerdict(readText(log1Path));
  const verdict2 = gateVerdict(readText(log2Path));

  const sameDeterministicOutcomeShape =
    JSON.stringify(deterministicShape(run1)) === JSON.stringify(deterministicShape(run2));
  const sameGateVerdict = verdict1 === verdict2;

  const result = {
    sameDeterministicOutcomeShape,
    gateVerdictRun1: verdict1,
    gateVerdictRun2: verdict2,
    sameGateVerdict,
  };

  const outputPath = outPath || "benchmarks/endgames/replay-proof/verification.json";
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  if (!sameDeterministicOutcomeShape || !sameGateVerdict) {
    process.exit(1);
  }
}

main();
