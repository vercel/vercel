# Global Options

Key flags available on every `vercel` command:

- `--help` / `-h` — show help for the command
- `--debug` / `-d` — enable debug output
- `--cwd DIR` — override working directory
- `--scope SCOPE` / `--team SLUG` — set team context (both do the same thing)
- `--token TOKEN` — auth token (prefer `VERCEL_TOKEN` env var instead)
- `--yes` / `-y` — skip confirmation prompts (required in CI)
- `--non-interactive` — suppress interactive prompts (auto-detected for agents/CI)

`--non-interactive` is auto-detected when stdin is not a TTY, so agents and CI get this behavior by default.

Prefer `VERCEL_TOKEN` env var over `--token` to avoid leaking secrets in shell history.
