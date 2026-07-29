---
'@vercel/backends': patch
---

Fix output directory discovery after the build command: the `dist`/`build`/`output` fallback was unreachable dead code, and `outputDirectory` was only read from `config.outputDirectory`, missing `config.projectSettings.outputDirectory` (the key wrapper builders use).
