# FOR-146 RCA and Stabilization Report (FOR-55 Churn)

Date: 2026-05-01

## 1) Timeline and Root Cause
Observed pattern: 13 runs and 12 assignee comments in roughly one hour on FOR-55-linked productivity flow.

Concise timeline pattern:
1. Initial productivity wake arrived and produced valid first-pass analysis work.
2. Subsequent wakes repeated with little or no new board/user decision delta.
3. Status toggles (`blocked`/`in_progress`/`done`) happened multiple times without new acceptance evidence.
4. Unblock handling was fragmented across multiple comments instead of one persistent unblock thread.
5. Equivalent wakes re-triggered equivalent summaries, creating comment/run amplification.

Self-induced triggers:
- Posting heartbeat comments on no-delta wakes.
- Re-stating completion narratives without new acceptance artifacts.
- Re-opening or re-blocking without net execution change.
- Duplicating unblock interactions for the same dependency.

Required/legitimate triggers:
- First execution on new productivity review wake.
- Explicit reassignment or adapter-recovery handoff.
- True unblock signal with new owner/action state.

## 2) Guardrails Implemented
Runbook source: `docs/runbooks/anti-churn-guardrails-for-55.md`

Implemented controls:
1. No-delta wake rule: no comment when there is no decision/evidence delta.
2. Single-open-unblock rule: one active unblock interaction per missing input.
3. Evidence-first completion rule: `done` only with explicit acceptance checklist evidence.
4. Churn circuit breaker: at >=3 low-delta assignee comments within 30 minutes, switch to `blocked` and hold.
5. Closure mode rule: close immediately for already-done source issues unless a concrete dependency justifies a 24h snooze.

## 3) Stabilization Evidence
FOR-146 runtime context at recovery:
- Prior two runs failed from adapter usage-limit, not from issue-content ambiguity.
- Dependency recovery/handoff then reassigned execution path to an active runtime.
- No further blocker-dependent no-op comments are required; execution should proceed directly to closure artifacts.

Stabilization target for FOR-55-linked loop:
- Final state should remain stable after posting this RCA + guardrails artifact.
- Any additional wake without decision/evidence delta should produce no assignee comment.

## 4) Recommendation
For this issue class, default to immediate closure once:
1. RCA is posted.
2. Guardrails are documented.
3. No active unblock dependency remains.

Use snooze only when a named dependency owner/action exists and a concrete wake is expected within 24 hours.

## 5) FOR-147 Enforcement Addendum
To prevent recurrence, guardrails now include a strict execution gate:
1. No-delta gate: no comment and no interaction mutation when there is no decision/evidence/state-correction delta.
2. Single-unblock invariant: exactly one active unblock interaction per blocker key (`<issueId>:<ownerRole>:<missingInputKind>`).
3. Deterministic idempotency: unblock interaction create calls use `unblock:{issueId}:{ownerRole}:{missingInputKind}`.

Expected effect:
- Equivalent wakes become no-op thread behavior.
- Duplicate unblock interactions are structurally prevented.
- Blocked updates remain stable until real unblock input arrives.
