# Global Options

Key flags available on every `vercel` command:

- `--help` / `-h` — show help for the command
- `--debug` / `-d` — enable debug output
- `--cwd DIR` — override working directory
- `--scope SCOPE` — set team context
- `--team SLUG` — deprecated alias for `--scope`; avoid in new commands
- `--token TOKEN` — auth token (prefer `VERCEL_TOKEN` env var instead)
- `--api URL` — override the API base URL (defaults to the public Vercel API)
- `--non-interactive` — suppress interactive prompts (auto-set when an agent is detected and stdin is not a TTY)

`--yes` / `-y` is **not** a global flag. It is declared per command on the subset that confirm mutations (`env rm`, `domains rm`, `blob delete-store`, `routes delete`, etc.). Always check the command's help to see whether `--yes` is accepted.

`--non-interactive` is auto-set only when an agent is detected and stdin is not a TTY. Plain CI without agent detection does **not** get this default; pass `--non-interactive` explicitly when scripting. Use `--non-interactive=false` to override the agent default.

Even with `--non-interactive`, commands that perform a confirmed mutation still require `--yes` separately.

For machine-readable output, prefer `--format json` where a command documents it; the boolean `--json` is deprecated on commands that also support `--format`.

Prefer `VERCEL_TOKEN` env var over `--token` to avoid leaking secrets in shell history.
