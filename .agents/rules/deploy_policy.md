---
trigger: always_on
---

# Deployment Policy — Approval Every Time, But Make the Ask Complete

## Scope

- **Production is not covered by this file.** Anything touching
  `ground-code.com` / `deploy.ps1` is governed solely by the
  "Production Deployment — HARD RULE" section of `CLAUDE.md`, which is
  unchanged. This policy permits **staging only** (`deploy-staging.ps1`,
  `staging.ground-code.com`).
- **Local environment**: all development, testing, builds, and verification are
  still done in the local checkout (`c:\xampp\htdocs\artists_farm`).

## Read-only inspection needs no approval

Looking at staging is not deploying to it. No approval needed for:

- `ssh … git rev-parse` / `git log` / `git status` on the staging checkout
- reading file presence, permissions, or contents there
- `SELECT` queries against the staging database
- fetching a staging URL

Anything that **writes** to staging needs approval, every time: deploy scripts,
`git checkout` / `reset` / `pull` on the server, editing or creating files,
`INSERT` / `UPDATE` / `DELETE`.

The line is mutation, not the transport. An SSH session that only reads is fine;
a one-line `echo … > file` over the same session is not.

## Run the checks BEFORE asking

An approval is only meaningful if it is informed. These are all local or
read-only, so they never need permission — run them first, every time:

1. `git status` — working tree state
2. current branch, and the commits it is ahead of what staging is running
3. `npx tsc --noEmit -p tsconfig.json`
4. `npm run build`
5. `php -l` on every changed PHP file
6. gitignored prerequisites present on the target (`php/config/db_pass.php`,
   `channex_config.json`, `.env`, `php/uploads/`) — these do not travel with a
   deploy and their absence has caused real outages twice

A failing check does not block the ask. It goes **into** the ask, so the decision
is made with it visible.

## The ask

One message, containing everything needed to answer. Do not deploy on a "yes"
given before this was presented.

```
Deploy <branch> → staging?

  N commit(s) ahead of staging (<staging commit>):
    <sha> <subject>
  Files: <count> changed
  tsc: <result>   build: <result>   php -l: <result>
  Prerequisites on target: <ok / missing X>

  Reply yes to deploy.
```

State plainly when something is already broken on staging, or when a check fails
and the deploy is still worth doing. "21 type errors, pre-existing, not made
worse by this commit" is the kind of thing that belongs in the ask.

## What a "yes" authorizes

One approval covers the **whole pipeline for that one deploy**:

- committing the custom-CSS override if it changed (the script does this)
- `git push` of that branch to GitHub
- `npm run build`
- `git checkout -f -B <branch>` on the staging server
- packaging and swapping `dist/`

Do not stop mid-pipeline to re-ask for a step that is part of it.

**Approval never carries to the next deploy.** Ask again, with a fresh check
block, every time — including for a redeploy of the same branch minutes later.

## Never deploy proactively

Only in direct response to a request to deploy, and only after explicit approval.
Finishing a task is not a reason to deploy it.

## Rollback is pre-authorized

Redeploying the immediately-previous known-good commit to **staging**, to recover
from a deploy that has just failed or broken it, does not need a fresh approval.
Do it, then report it immediately — what broke, what was restored, and the commit
now running.

This covers recovery only. Any other deploy, including a fix-forward, follows the
normal ask.

## Verify on the server afterward

The script's own success line is not evidence. After every deploy, confirm on the
target and report:

- branch and commit are what was approved (`git rev-parse` over SSH)
- the served bundle hash actually changed
- one real endpoint answers

If any of those disagree with expectation, say so before saying the deploy
succeeded.

## Script behaviour worth knowing

- `-Branch` defaults to the branch checked out locally, so the normal case is a
  bare `.\deploy-staging.ps1`. It refuses to run when `-Branch` and the local
  checkout disagree, because `dist/` is built from the working tree and a
  mismatch ships a frontend against the wrong backend.
- The script stashes uncommitted work before building and restores it in a
  `finally`, so a failed build cannot strand it.
- `-DryRun` runs the checks and the build with no push and no remote writes. It
  is the right way to answer "would this deploy cleanly?" without approval.
