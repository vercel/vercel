# Global Options

Key flags available on every `vercel` command:

- `--help` / `-h` — show help for the command
- `--debug` / `-d` — enable debug output
- `--cwd DIR` — override working directory
- `--scope SCOPE` — set team context
- `--team SLUG` — deprecated alias for `--scope`; avoid in new commands
- `--token TOKEN` — auth token (prefer `VERCEL_TOKEN` env var instead)
- `--yes` / `-y` — confirm prompts for commands that ask for confirmation
- `--non-interactive` — suppress interactive prompts (auto-detected for agents/CI)

`--non-interactive` is auto-detected when stdin is not a TTY, so agents and CI get this behavior by default.
Some commands still require `--yes` in non-interactive mode when they perform a confirmed mutation.

Prefer `VERCEL_TOKEN` env var over `--token` to avoid leaking secrets in shell history.
