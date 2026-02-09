---
'vercel': patch
---

Fixed help flag (`-h`, `--help`) to exit with status code 0 instead of 2. Displaying help is a successful operation and should return a success exit code. This follows standard Unix conventions and improves compatibility with scripts and CI pipelines that check exit codes.
