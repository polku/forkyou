# FOR-211 QA/Infra Validation: Deterministic Real-Play Gates

Date: 2026-05-02
Issue: FOR-211 (FOR-209B Deterministic Real-Play Gates)

## Handoff Contract
1. Objective
- Validate deterministic real-play gate execution and replay consistency for current branch using existing endgames gate harness and threshold profiles.

2. Acceptance criteria
- `ci_gate` benchmark passes thresholds.
- Replay verification over two identical `ci_gate` runs reports deterministic outcome shape and consistent gate verdict.
- `release_gate` benchmark passes thresholds.

3. Blocker
- none.

4. Next action and owner
- Owner: CTO / Backend owner for FOR-209 rollout.
- Next action: run the same gate commands against the real UCI provider path (`ENDGAMES_ADAPTER_MODULE` equivalent for production provider wiring) and publish resulting CI artifact IDs in FOR-211 before release toggle.

## Verification Steps
1. `node benchmarks/endgames/run-benchmark.js --gate ci_gate --runs 20 --timeoutMs 200 --output benchmarks/endgames/replay-proof/for-211-run1.json | tee benchmarks/endgames/replay-proof/for-211-run1.log`
2. `node benchmarks/endgames/run-benchmark.js --gate ci_gate --runs 20 --timeoutMs 200 --output benchmarks/endgames/replay-proof/for-211-run2.json | tee benchmarks/endgames/replay-proof/for-211-run2.log`
3. `node benchmarks/endgames/verify-replay.js benchmarks/endgames/replay-proof/for-211-run1.json benchmarks/endgames/replay-proof/for-211-run2.json benchmarks/endgames/replay-proof/for-211-run1.log benchmarks/endgames/replay-proof/for-211-run2.log benchmarks/endgames/replay-proof/for-211-verification.json`
4. `node benchmarks/endgames/run-benchmark.js --gate release_gate --runs 20 --timeoutMs 200 --output benchmarks/endgames/replay-proof/for-211-release.json | tee benchmarks/endgames/replay-proof/for-211-release.log`

## Expected vs Actual
- Expected: both `ci_gate` runs pass thresholds and produce equivalent deterministic outcome shape; replay verifier returns success.
- Actual: both runs emitted `[GATE PASS]`; replay verifier output:
  - `sameDeterministicOutcomeShape: true`
  - `gateVerdictRun1: "PASS"`
  - `gateVerdictRun2: "PASS"`
  - `sameGateVerdict: true`
- Expected: `release_gate` run passes stricter threshold profile.
- Actual: `release_gate` emitted `[GATE PASS]`.

## Evidence
- Log evidence: `benchmarks/endgames/replay-proof/for-211-run1.log`, `for-211-run2.log`, `for-211-release.log`
- JSON evidence: `benchmarks/endgames/replay-proof/for-211-run1.json`, `for-211-run2.json`, `for-211-verification.json`, `for-211-release.json`

## Smallest Unblock Recommendation
- Keep current deterministic gate wiring; unblock rollout by executing one CI-backed run on the real provider mode and attaching artifact/job IDs to the FOR-211 thread.
