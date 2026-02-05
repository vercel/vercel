---
'vercel': patch
---

Add support for `VERCEL_TOKEN` environment variable

The CLI now reads the `VERCEL_TOKEN` environment variable as an alternative to the `--token` flag. This allows for easier scripting and CI/CD integration without needing to pass the token as a command-line argument.

The `--token` flag takes precedence over the environment variable when both are provided.
