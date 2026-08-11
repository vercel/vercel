---
'vercel': patch
---

Improved `vercel upgrade` for native binary installs: the suggested update command now targets the correct install method instead of assuming a package manager, and self-updates are resilient to `/tmp` being on a different filesystem than the install directory.
