---
"vercel": patch
---

Add global non-interactive mode and deterministic flags for `vercel env add`:

- Global flag: `--non-interactive` (also auto when no TTY or `VERCEL_NON_INTERACTIVE=1`).
- `env add` flags: `--target` (repeatable), `--git-branch`, `--value`, `--value-file`, `--value-stdin` (raw bytes), and `--replace` (alias for `--force`).
- In non-interactive mode, commands fail fast with clear errors when required inputs are missing.

