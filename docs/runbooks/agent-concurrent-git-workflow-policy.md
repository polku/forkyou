# Agent Concurrent Git Workflow Policy (FOR-222)

## Purpose
Prevent multi-agent commit collisions and accidental staging of unrelated changes when several agents work in parallel.

## Required Policy
1. Assume other agents may modify the same repository at any time.
2. Use an isolated worktree per assigned issue.
3. Stage only in-scope paths after checking `git status --short`.
4. Do not revert or delete unrelated changes blindly.
5. Coordinate when two active issues touch the same files.
6. Resolve only issue-relevant conflict hunks and rerun minimal verification.
7. Do not use destructive cleanup commands (`git reset --hard`, `git checkout -- .`) unless explicitly instructed.
8. Push immediately after successful scoped commits and include branch/SHA in heartbeat updates.

## Runtime Rollout Scope
This policy has been inserted into each active runtime agent instruction file at:
- `/home/jmaurice/.paperclip/instances/default/companies/efc63cdc-90d2-4193-9e36-bf3aa97ac145/agents/*/instructions/AGENTS.md`

## Verification
- Confirm section exists: `rg -n "^## Concurrent Git Workflow" /home/jmaurice/.paperclip/instances/default/companies/efc63cdc-90d2-4193-9e36-bf3aa97ac145/agents/*/instructions/AGENTS.md`
- Confirm shared key constraints exist (worktree, scoped staging, no destructive cleanup).

## Ownership
CTO owns this policy; role-specific instruction files must continue to include this section.

## Definition of Done Addendum (PR Workflow)
With branch + PR workflow enabled, DoD is satisfied only when:
1. In-scope changes are committed.
2. Commits are pushed to the remote branch.
3. A pull request is opened from the working branch to the target base branch.
4. Heartbeat/update comment includes commit SHA(s), branch, and PR link.

If push or PR creation is blocked by permissions/policy, the issue must be marked blocked with unblock owner and action.
