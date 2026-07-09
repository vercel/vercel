---
'vercel': major
---

Require an explicit team signal when linking without a TTY. In non-interactive
mode or without a terminal, `vercel link` (and other commands that set up a
link) no longer fall back to the globally selected team from `vc switch` or the
login default, and `--yes` no longer guesses a team. The team now resolves only
from `--scope`/`--team`, the `scope` property in `vercel.json`,
`VERCEL_ORG_ID`, or a single available team; otherwise the command fails with
`action_required: missing_scope` (JSON in non-interactive mode) before any
project discovery runs, before a new project is created, and before the
existing `.vercel/project.json` is deleted. This also removes the slow
all-teams project search from non-interactive `vercel link` runs.
