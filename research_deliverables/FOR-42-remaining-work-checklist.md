# FOR-42 Remaining Work Checklist (as of 2026-04-30)

Issue: FOR-42 (FOR-36C Deterministic CI Gates D5/D6)
Status: In progress

## What Is Already Done
- Research deliverable completed: `research_deliverables/FOR-42-deterministic-ci-gates-d5-d6-research.md`
- D5/D6 dependency framing and gate policy sources identified.
- Critical implementation mismatch identified:
  - `benchmarks/endgames/run-benchmark.ts` does not select gate profile key (`ci_gate` / `release_gate`).
  - `benchmarks/endgames/run-benchmark.js` already supports `--gate` selection.

## What Is Left To Do
1. Ratify D6 thresholds
- Owner: Chess R&D Lead (CTO approval where required)
- Action: Confirm `ci_gate` and `release_gate` values in `benchmarks/endgames/thresholds.json` as effective policy.
- Done when: Issue-thread decision note states approved values + effective date.

2. Fix TS gate selection parity
- Owner: Backend/Infra Engineer
- Action: Update `benchmarks/endgames/run-benchmark.ts` to accept `--gate` and select `thresholds[gateKey]` (matching JS behavior).
- Done when: TS runner enforces chosen profile and fails on invalid/missing gate key.

3. Enforce CI invocation contract
- Owner: QA/Infra
- Action: CI must pass explicit gate profile:
  - merge gate: `ci_gate` (STC)
  - release/default-enable gate: `release_gate` (LTC)
- Done when: CI config shows explicit `--gate ci_gate` and release job uses `--gate release_gate`.

4. Add minimal deterministic replay proof
- Owner: QA/Infra
- Action: Run benchmark twice with same manifest/config and verify deterministic status/correctness outcomes + identical gate verdict.
- Done when: CI artifact includes replay comparison and pass/fail output.

## Smallest Next Action Now
- Assign item #2 immediately (TS gate selection parity), because it removes the main enforcement risk without waiting for broader CI redesign.

## Blocked/Unblock
- No hard blocker from contract-core remains (FOR-42 was unblocked by contract core v1).
- Remaining dependency is governance ratification of final D6 values (owner: Chess R&D Lead/CTO).

## Handoff / Ping Order To Close Issue
Primary handoff type: mixed CTO + developer, but start with developer execution in parallel with CTO ratification.

Ping sequence:
1. Backend/Infra Engineer (developer)
- Ask for immediate patch to `benchmarks/endgames/run-benchmark.ts` gate-key selection parity (`--gate ci_gate|release_gate`).
- Reason: this is the only known implementation defect blocking trustworthy D6 enforcement.

2. QA/Infra Engineer (developer)
- Ask to wire CI gate invocation explicitly (`ci_gate` on merge, `release_gate` on release/default-enable) and add deterministic replay proof step.
- Reason: closes acceptance criteria #3 and #4.

3. Chess R&D Lead (decision owner)
- Ask to ratify final D6 threshold numbers (or adjustments) with confidence statement and effective date.
- Reason: converts proposal into approved policy.

4. CTO (final governance confirmation)
- Ask to confirm merge-vs-release gate policy binding and approve closure once items 1-3 are complete.
- Reason: final approval authority for dependency-governed gate policy.

Close recommendation:
- Do not wait serially for CTO before engineering patching; run developer items (1-2) immediately while ratification (3-4) proceeds.
