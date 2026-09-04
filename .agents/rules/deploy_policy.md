# Deployment Policy — Always Get Approval First

- **Ask before every deploy.** Never run a deployment script or remote
  server-sync command (`deploy-staging.ps1`, etc.) until you have asked the user
  in the current chat and gotten a clear "yes" for that specific deploy.
  Approval for one deploy never carries to the next — ask again every time.
  When you ask, state which branch and what is being shipped.
- **Never deploy automatically or proactively** — only in direct response to a
  request to deploy/publish, and only after the explicit approval above.
- **Production is not covered by this file.** Anything touching
  `ground-code.com` / `deploy.ps1` is governed solely by the
  "Production Deployment — HARD RULE" section of `CLAUDE.md`, which is
  unchanged. This policy permits **staging only** (`deploy-staging.ps1`,
  `staging.ground-code.com`).
- **Local environment**: all development, testing, builds, and verification are
  still done in the local checkout (`c:\xampp\htdocs\artists_farm`).
