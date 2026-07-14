---
'vercel': patch
---

`vercel logs --follow` now falls back to the latest READY production deployment instead of erroring when no deployment can be resolved from the current git branch — whether the branch lookup finds no matching deployments (e.g. deployments created without git metadata), no git branch can be detected (not a git repo, or no commits yet), or `--no-branch` is passed.
