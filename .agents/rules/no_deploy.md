# Local-First — Deploy Only On Explicit Request

- **Local-first (default)**: All routine development, testing, builds, and verification happen in the local environment (`c:\xampp\htdocs\artists_farm`). Don't deploy as a side effect of finishing a task.
- **Staging deploys** (`deploy-staging.ps1` → staging.ground-code.com): allowed, but only when the user explicitly asks for a deploy in the current conversation, and only after `tsc --noEmit` and `npm run build` both pass clean. One request authorises one deploy — it does not carry forward to later turns.
- **Production**: never. CLAUDE.md's "Production Deployment — HARD RULE" is unchanged and absolute; nothing here loosens it, and only the user's own manual edit of that CLAUDE.md section can.
- **No ad-hoc remote sync**: don't run one-off `rsync` / `scp` / `ssh` filesystem operations against any server — the deploy scripts are the only sanctioned path, used only per the rules above.

_(Softened 31 Aug 2026 at the user's explicit request — previously a blanket "never deploy anything." Staging-with-approval now matches CLAUDE.md's stated policy; production stays hard-locked.)_
