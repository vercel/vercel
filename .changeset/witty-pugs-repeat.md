---
'vercel': patch
---

Run `vercel upgrade` interactively when installed via pnpm so users can approve dependency build scripts (e.g. esbuild's postinstall) instead of the install silently hanging or skipping them. Unattended automatic updates remain non-interactive with stdin detached.
