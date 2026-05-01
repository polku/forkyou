# FOR-52 QA/Infra Handoff: CI Gate Profiles + Replay Proof

Date: 2026-05-02
Issue: FOR-52 (FOR-42B Wire CI gate profiles and replay proof)

## Handoff Contract
1. Objective
- Wire deterministic CI gate execution to explicit profiles (`ci_gate` for PR/merge path, `release_gate` for main/manual release path) and add replay-proof verification as a CI artifact.

2. Acceptance criteria
- CI workflow exists and runs explicit gate profile commands.
- Replay job runs benchmark twice under same config and validates deterministic outcome shape plus consistent gate verdict.
- Evidence artifacts are uploaded by CI jobs.

3. Blocker
- None for repo-level implementation.
- Note: TypeScript runner (`benchmarks/endgames/run-benchmark.ts`) is ESM-style and does not execute directly in current CommonJS package mode without a TS execution path; workflow currently uses the JS runner (`run-benchmark.js`) for reliability.

4. Next action and owner
- Owner: Engineering/Repo maintainer.
- Next action: Push branch and run GitHub Actions to capture job IDs and uploaded artifacts for final closure evidence on FOR-52.

## Implementation Added
- Workflow: `.github/workflows/endgames-gates.yml`
  - `ci-gate` job: runs `node benchmarks/endgames/run-benchmark.js --gate ci_gate ...`
  - `release-gate` job: runs `node benchmarks/endgames/run-benchmark.js --gate release_gate ...` on `main` or manual dispatch
  - `replay-proof` job: runs two `ci_gate` passes and verifies deterministic replay via script below
- Verifier script: `benchmarks/endgames/verify-replay.js`
  - Compares deterministic outcome shape from two result JSON files.
  - Asserts gate verdict consistency based on run logs.
  - Emits `verification.json` and exits non-zero on mismatch.

## Local Verification Evidence
Repro steps:
1. `node benchmarks/endgames/run-benchmark.js --gate ci_gate --runs 20 --timeoutMs 200 --output benchmarks/endgames/replay-proof/run1.json | tee benchmarks/endgames/replay-proof/run1.log`
2. `node benchmarks/endgames/run-benchmark.js --gate ci_gate --runs 20 --timeoutMs 200 --output benchmarks/endgames/replay-proof/run2.json | tee benchmarks/endgames/replay-proof/run2.log`
3. `node benchmarks/endgames/verify-replay.js benchmarks/endgames/replay-proof/run1.json benchmarks/endgames/replay-proof/run2.json benchmarks/endgames/replay-proof/run1.log benchmarks/endgames/replay-proof/run2.log benchmarks/endgames/replay-proof/verification.json`
4. `node benchmarks/endgames/run-benchmark.js --gate release_gate --runs 20 --timeoutMs 200 --output benchmarks/endgames/replay-proof/release.json | tee benchmarks/endgames/replay-proof/release.log`

Expected vs actual:
- Expected: both replay runs produce identical deterministic status/correctness outcome shape and same gate verdict.
- Actual: `verification.json` shows:
  - `sameDeterministicOutcomeShape: true`
  - `gateVerdictRun1: "PASS"`
  - `gateVerdictRun2: "PASS"`
  - `sameGateVerdict: true`
- Expected: release gate run passes with current stub baseline.
- Actual: `release_gate` run emitted `[GATE PASS]`.

Evidence files:
- `benchmarks/endgames/replay-proof/run1.json`
- `benchmarks/endgames/replay-proof/run2.json`
- `benchmarks/endgames/replay-proof/run1.log`
- `benchmarks/endgames/replay-proof/run2.log`
- `benchmarks/endgames/replay-proof/verification.json`
- `benchmarks/endgames/replay-proof/release.json`
- `benchmarks/endgames/replay-proof/release.log`

Smallest unblock recommendation:
- Merge this workflow + verifier as-is, then capture first green Action run artifact links and job IDs in the FOR-52 issue comment for closure.

## Remote CI Verification (Post-push)
- Workflow run: `25237065430`
- Run URL: `https://github.com/polku/forkyou/actions/runs/25237065430`
- Head SHA: `89bb8ba`
- Branch: `master`
- Conclusion: `success`

Jobs:
- `74005415875` — STC ci_gate — success
  - URL: `https://github.com/polku/forkyou/actions/runs/25237065430/job/74005415875`
  - Step evidence: `Run ci_gate benchmark` succeeded.
- `74005415876` — LTC release_gate — success
  - URL: `https://github.com/polku/forkyou/actions/runs/25237065430/job/74005415876`
  - Step evidence: `Run release_gate benchmark` succeeded.
- `74005415877` — Deterministic replay proof — success
  - URL: `https://github.com/polku/forkyou/actions/runs/25237065430/job/74005415877`
  - Step evidence: both replay runs + `Verify replay outcomes` succeeded.

Artifacts:
- `ci-gate-results` (id `6758402200`): `https://api.github.com/repos/polku/forkyou/actions/artifacts/6758402200/zip`
- `release-gate-results` (id `6758402473`): `https://api.github.com/repos/polku/forkyou/actions/artifacts/6758402473/zip`
- `deterministic-replay-proof` (id `6758402751`): `https://api.github.com/repos/polku/forkyou/actions/artifacts/6758402751/zip`

Note on log access:
- Public API confirms step/job success and artifact publication.
- Direct raw job-log download endpoint is admin-scoped (`403 Must have admin rights to Repository`) from this environment.

## Revalidation After Evidence Commit
- Workflow run: `25237095252`
- Run URL: `https://github.com/polku/forkyou/actions/runs/25237095252`
- Head SHA: `d7944d0`
- Branch: `master`
- Conclusion: `success`
