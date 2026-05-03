# Version-Control Baseline (FOR-55)

Date: 2026-05-01
Workspace: /home/jmaurice/.paperclip/instances/default/projects/efc63cdc-90d2-4193-9e36-bf3aa97ac145/fa925ea0-67ac-4349-aa5c-9c9eea6b13ff/_default

## Baseline topology
- Git repository: yes (`git rev-parse --is-inside-work-tree` => `true`)
- Primary branch: `master`
- HEAD commit: `ba2eac70b1b35ca625dd270591615e20589f6e69`
- Canonical remote (`origin`): `git@github.com:polku/forkyou.git`

## Branch / commit / push expectations
- Create a dedicated worktree per issue from `master` before any edits: `git worktree add ../wt-<issue> master`.
- Create feature branches from `master` inside that worktree using `feature/<issue-or-scope>` naming.
- Keep commits scoped and reference issue identifiers in commit messages (example: `feat(bot): add opening book loader (FOR-123)`).
- Do not push directly from dirty worktrees with unrelated untracked files; first stage only intended paths.
- Push workflow:
  1. `git checkout -b feature/<scope>`
  2. `git push -u origin feature/<scope>`

## Verification snapshot
- `git rev-parse --is-inside-work-tree`
  - `true`
- `git remote -v`
  - `origin git@github.com:polku/forkyou.git (fetch)`
  - `origin git@github.com:polku/forkyou.git (push)`
- `git branch --all --verbose --no-abbrev`
  - `* master ba2eac70b1b35ca625dd270591615e20589f6e69 feat(scripts): add bootstrap_test_env.sh for zero-dep Node.js environment check (FOR-134)`

## Risk noted
- The workspace currently contains many untracked files. Before creating baseline commits, define intended inclusion set and stage paths explicitly.
