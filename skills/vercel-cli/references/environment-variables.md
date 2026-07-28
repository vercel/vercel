# Environment Variables

> Exact syntax: `vercel env --help`, `vercel pull --help`

- Env vars are scoped to production, preview (can be branch-specific), and development. Sensitive variables are encrypted and not readable after creation; plain values may appear in `vercel env ls --format json` output.
- `environment` is a **positional argument** to `env` subcommands, not a flag.
- In non-interactive / agent mode, `env add` and `env update` require the value via `--value` or stdin.
- `vercel env run` injects env vars into a subprocess without writing to a file. The `--` separator is required before the command.
- `vercel pull` downloads project settings **and** env vars to `.env.local`; `vercel env pull` downloads only env vars.
