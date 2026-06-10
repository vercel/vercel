---
'vercel': patch
---

Fix `vercel upgrade` crashing with `ENOENT: no such file or directory, realpath '…/.pkg-staging/pkg.js'`
in the native binary. The command tried to `realpath` `process.argv[1]`, which points into the binary's
virtual filesystem snapshot. Native installs now detect the package manager (npm, pnpm, or yarn) from
the binary's real install location and suggest the matching global upgrade command.
