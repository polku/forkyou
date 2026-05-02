# FOR-146 Anti-Churn Guardrails for FOR-55-Class Work

## Scope
Issue class: execution loops where status pings, repeated blocked/done flips, and low-delta comments generate high run churn without advancing acceptance criteria.

## Close vs Snooze Policy
For productivity-review issues where the source issue is already complete:
- Close immediately when:
  - Source issue is `done` and acceptance evidence is already durable in thread/docs.
  - No open unblock dependency exists.
- Snooze (fixed window: 24 hours) only when:
  - A specific external dependency is still unresolved (owner and unblock action named).
  - There is a concrete wake condition expected inside the window.
- Do not keep these issues in `in_progress` without an active execution path.

## RCA (2026-05-01)
1. Heartbeat comments were posted even when no user/board delta existed.
2. Issue status was repeatedly toggled (`blocked`/`done`) with no net execution change.
3. Unblock requests were split across multiple comments and interactions, causing re-wakes and duplicated summaries.
4. Decision capture was not idempotent, so equivalent wakes re-produced nearly identical thread updates.

## Guardrails
1. No-delta wake rule
- If no new board/user decision exists and no new acceptance evidence is produced, do not add a new comment.
- Only mutate status when it is currently incorrect.

2. Single-open-unblock rule
- Keep exactly one active unblock interaction per missing input.
- Reuse the same interaction until answered; do not mint a replacement unless invalidated.

3. Evidence-first completion rule
- `done` requires explicit acceptance-evidence checklist in one durable comment.
- If acceptance is unchanged, avoid re-posting completion narratives.

4. Churn circuit breaker
- If issue has >=3 assignee comments within 30 minutes and no acceptance delta, switch to `blocked` with:
  - Unblock owner
  - Unblock action
  - Next wake condition
- Then hold silent until wake condition is met.

5. Sensitive-data hygiene
- Never paste secrets/tokens into issue comments.
- If a secret appears in thread input, record only that credential input was received and rotate/scrub externally.

## Enforced Procedure (FOR-147)
Apply these checks in order on every wake before posting comments or creating interactions:

1. Compute delta state from last assignee action
- `hasDecisionDelta`: new board/user decision since last assignee comment.
- `hasEvidenceDelta`: new acceptance artifact produced in this heartbeat.
- `hasStateCorrection`: current issue status is objectively incorrect.

2. Apply no-delta gate
- If `hasDecisionDelta=false`, `hasEvidenceDelta=false`, and `hasStateCorrection=false`:
  - Do not post a heartbeat comment.
  - Do not create/replace interactions.
  - Exit with no thread mutation.

3. Enforce single-unblock interaction
- When missing input is the only blocker, allow exactly one active interaction for that blocker.
- Before creating a new unblock interaction, check existing active interactions and reuse the open one when blocker key matches.
- Blocker key format: `<issueId>:<ownerRole>:<missingInputKind>`.
- Replace an interaction only when invalidated (owner changed, question materially changed, or previous interaction resolved/closed).

4. Idempotency for interaction creation
- Interaction create calls must include deterministic idempotency key:
  - `unblock:{issueId}:{ownerRole}:{missingInputKind}`
- Comment updates that summarize unchanged blocker state must be suppressed by the no-delta gate.

5. Blocked-status contract
- If blocked, comment must include exactly:
  - Unblock owner
  - Unblock action
  - Wake condition
- Re-posting the same blocked contract without delta is disallowed.

## Operational Checklist (applies to CTO and specialists)
Before posting on a wake:
- Is there a new user/board decision since the last assignee comment?
- Is there new acceptance evidence?
- Is there exactly one unresolved blocker and one unblock owner/action?

If all answers are no:
- Skip comment.
- Keep state stable.

## Verification Metrics
Track on the next 5 comparable issues:
1. Assignee comments per issue while blocked <= 2.
2. Status flips without acceptance delta = 0.
3. Duplicate unblock interactions per issue = 0.
4. Productivity `high_churn` trigger count for this pattern reduced by >=80% week-over-week.

## Implementation Streams
A. Workflow enforcement in issue execution policy and heartbeat templates.
B. Churn detector automation for status/comment loop signals.
C. Retroactive closure hygiene for FOR-55/FOR-145 linked flow.

## Retroactive Closure Hygiene Procedure (FOR-149)
Objective: normalize already-processed FOR-55/FOR-145 linked issues so they do not re-enter churn via no-delta wakes.

1. Build candidate set
- Include linked issues whose source deliverable is already `done`.
- Exclude issues with unresolved `blockedByIssueIds` or active review-stage participants.

2. Verify closure readiness per issue
- Confirm one durable acceptance artifact exists (doc, commit, or evidence comment).
- Confirm latest assignee comment includes unblock owner/action when status is `blocked`.
- Confirm there is no duplicate active unblock interaction for the same blocker key.

3. Normalize thread state
- If readiness checks pass, post one final closure-hygiene comment with:
  - Objective worked
  - Verification performed
  - Blocker (`none` or explicit owner/action)
  - Next action and owner
- Set status to `done` in the same heartbeat.

4. Suppress no-delta follow-ups
- If a later wake has no decision/evidence/state-correction delta, perform no thread mutation.
- Do not create replacement unblock interactions unless the blocker key changed.

5. Audit trail requirement
- Any closure-normalization heartbeat must cite the evidence artifact path and exact verification command(s) used.
