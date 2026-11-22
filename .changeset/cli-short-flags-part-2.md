---
'vercel': minor
---

Accept the standard short flags wherever their option exists: `-p` for `--project`, `-n` for `--limit`, `-a` for `--all` (on `ai-gateway setup`, `setup gateway`, and `token-pass`), and `-o` for `--output` (on `vercel build`). Each one works exactly like its long name, including in suggested commands. `integration resource disconnect` and `storage disconnect` no longer show `-a`, because disconnecting every project takes `--all` spelled out; `-a` still works there and prints a deprecation warning. `vercel flags create`, `flags segments create`, and `flags segments update` now save a description passed with `-d` after the command's arguments, instead of dropping it and turning on debug output. `vercel blob put` and `blob copy` with `-t <content-type>` still fail, and the error now says to use `--content-type`.
