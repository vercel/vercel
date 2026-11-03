---
'@vercel/build-utils': patch
'@vercel/next': patch
---

Skip a custom installCommand in @vercel/next when VERCEL_INSTALL_COMPLETED is scoped to the project's package.json, matching the skip in runNpmInstall and runCustomInstallCommand. This stops vc build's pre-compilation install from running a second time in @vercel/next. Export installCompletedCovers from @vercel/build-utils so builders can share the check. A pathless marker does not skip a custom command, since it cannot show this package.json was the one installed.
