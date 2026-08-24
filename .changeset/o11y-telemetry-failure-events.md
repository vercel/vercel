---
'vercel': patch
---

Record structured failure telemetry: error codes for all users, argument parse errors, unknown command tokens (literal only when a did-you-mean suggestion confirms command intent), dispatcher-confirmed unknown subcommands, and sanitized crash reports — gated behind `VERCEL_CLI_TELEMETRY_V2`. Also stops recording the directory name as the `command:deploy` value for `vercel <dir>` deploys (now `DIRECTORY`).
