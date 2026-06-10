---
"vercel": patch
---

Replace the `git-last-commit` dependency with direct `git` commands for collecting deployment Git metadata. The old library chained `git log`, `git rev-parse`, and `git tag --contains HEAD` with `&&` and treated any stderr output as a fatal error, which caused Git metadata to silently disappear whenever `git` printed a warning (e.g. on newer Git versions, repos with many tags, or missing notes refs). The CLI now runs only the two commands it needs (`git log` and `git rev-parse`) independently via `execFile`, so a warning on one command does not suppress all metadata. Fixes #15577.
