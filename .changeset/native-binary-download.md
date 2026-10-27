---
'vercel': minor
---

When the native binary's optional dependency is missing on macOS or Linux, the launcher now downloads the binary for its exact version from npm into the CLI cache once, checks it against the registry's sha512 integrity and that it starts, and runs it, for every command including `--version` and `--help`. It never downloads for opted-out users or from a repository checkout, and uses the JS CLI quietly when the cache can't be written. A failed download falls back to the JS CLI and is retried after 24 hours. Telemetry reports `launcher_source` (`download`, `cache`) and the `download_failed` fallback reason.
