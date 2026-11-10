# Manage schedules locally

Use `vc schedules --local` to manage schedules in a running `vc dev` session without changing cloud schedules. Local schedule commands don't require login or a linked Vercel project. `vc` is the alias for `vercel`.

## Start a local session

In your project directory, start the development server in terminal 1. Use `--local` to start an unlinked project:

```bash
vc dev --local
```

Wait for the server to be ready and leave it running. In terminal 2, open the same project directory:

```bash
vc schedules create daily-cleanup --local --cron "0 2 * * *" --topic scheduled-cleanup
vc schedules list --local
vc schedules inspect daily-cleanup --local --json
vc schedules update daily-cleanup --local --cron "0 3 * * *"
vc schedules disable daily-cleanup --local
vc schedules enable daily-cleanup --local --for 1h
vc schedules invoke daily-cleanup --local
vc schedules delete daily-cleanup --local --yes
```

The list includes `daily-cleanup`, and `inspect --json` returns its schedule data. `invoke` dispatches immediately to the local queue topic; configure a local consumer for `scheduled-cleanup` to process the message. Inspect the `vc dev` output for local executions.

Local mode supports `list`, `inspect`, `create`, `update`, `enable`, `disable`, `invoke`, and `delete`. The aliases `ls` and `rm` also work; `get` remains a deprecated alias for `inspect`. Use `--local` or `-L` before or after the subcommand, including after other options. For example, `vc schedules -L list` and `vc schedules list --local` select the same session. Without either flag, cloud behavior is unchanged.

Deletion still requires confirmation. `--yes` skips the interactive prompt and is required for non-interactive deletion.

## Select the project directory

All `vc dev` modes publish session metadata at `.vercel/dev/schedules/<uuid>.json` under the canonical project directory, including sessions started without `--local`. Schedule commands discover the session from their current directory, or from `--cwd`:

```bash
vc schedules list --local --cwd /path/to/project
```

The directory must match the exact root used by `vc dev`. A symlink resolving to that root works, but a child directory doesn't: discovery never searches ancestor directories.

The CLI discovers the actual Schedules resource port, even when the default port is unavailable. You can pin the server port with `vc dev --schedules-port`, but schedule commands don't need a port. There is no `--port`, `--environment`, or track selector for local schedules.

Use `--namespace` to select a namespace within the local scheduler (default `default`), not a different session or environment.

## Keep local changes separate from configuration

Local schedules live in memory and reset when you stop or restart `vc dev`. Static schedules load again from your project configuration and framework-generated definitions.

CLI and API mutations change only the running session, not your source files. As when deployed, a static schedule can only be enabled or disabled; updating or deleting it fails. Edit the static source to change it.

The local scheduler follows the deployed service's rules: one-time schedules use minute precision and can't be changed once their time arrives, `enable --until` and `--for` disable the schedule again at that time, payloads are limited to 8 KiB, and cron occurrences missed while your computer was asleep are skipped once the next one is due.

## Handle errors and script output

- **Missing, stale, or incompatible session:** Start or restart `vc dev` in the intended project directory, then run the command from that exact root or use `--cwd`. If an error identifies an invalid metadata file, stop `vc dev`, remove the identified file, and restart.
- **Multiple active instances:** Stop the extra `vc dev` instances in that directory. The CLI reports an error rather than choosing one; there is no port selector.
- **Cloud options:** Explicit `--scope`, `--team`, and `--token` flags are incompatible with `--local`. Local commands ignore ambient cloud credentials and `VERCEL_SCHEDULE_BASE_URL`.
- **Execution history:** `vc schedules executions list --local` is deliberately unsupported. Use the `vc dev` output instead; the command never falls through to cloud history.

Local requests check the session identity on every request. They don't follow redirects or fall back to the cloud if discovery or a request fails.

Use `--json` for machine-readable output. JSON data goes to stdout; local connection context and diagnostics go to stderr, keeping stdout clean for scripts.

Help (`--help` or `-h`) exits with code `0`, including `vc schedules executions list --local --help`. Invalid arguments exit with code `2`. Unsupported local execution history and local session failures exit with code `1`.
