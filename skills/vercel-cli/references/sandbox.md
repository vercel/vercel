# Sandbox

`vercel sandbox` forwards to Vercel Sandbox for project-scoped sandbox environments.

```bash
vercel sandbox list
vercel sandbox create --connect
vercel sandbox --help
```

Global Vercel flags such as `--scope` and authentication are forwarded. Use `VERCEL_TOKEN` for automation; the CLI maps it for Sandbox auth when needed.

Sandbox commands may create external compute or interactive sessions. Confirm intent before creating or connecting to a sandbox.
