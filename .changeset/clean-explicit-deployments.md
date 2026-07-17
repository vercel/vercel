---
'vercel': patch
---

Resolve explicit Curl, Httpstat, and trace deployment targets without linking the current directory. Automation bypass secrets are only auto-created on the locally linked project; explicit deployments in other projects reuse existing secrets. Global CLI flags (long and short) before the command token no longer leak into curl arguments.
