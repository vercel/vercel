# [MEDIUM] Protection bypass secret accepted via CLI flag (--protection-bypass <SECRET>)

**File:** [`packages/cli/src/commands/curl/command.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/curl/command.ts#L29-L62) (lines 29, 30, 31, 32, 33, 34, 35, 36, 37, 62)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `other-secret-via-cli-flag`

## Owners

**Suggested assignee:** `25040341+brookemosby@users.noreply.github.com` _(via last-committer)_

## Finding

The command exposes a `--protection-bypass <SECRET>` flag (L29–37) and the help/example text (L62) suggests passing the secret directly on the command line. This violates the project's own AGENTS.md guidance: 'Never accept secrets via flags. Flags leak into ps output and shell history. Accept tokens and credentials via environment variables, config files, or stdin instead.'

Real-world impact: any other process on the same host that can read /proc (or run `ps -ef`) sees the secret in the command line. Shell history (~/.bash_history, ~/.zsh_history) typically retains it on disk. CI systems often log invoked commands. If the user ever runs the command with `set -x` enabled, or pastes the command into a shared screen/log, the secret is leaked.

The codebase already supports the safer alternative — VERCEL_AUTOMATION_BYPASS_SECRET environment variable (bypass-token.ts:97) — so removing the flag would not break primary use cases.

## Recommendation

Remove the `--protection-bypass` flag and require the secret to be supplied via the VERCEL_AUTOMATION_BYPASS_SECRET environment variable (or read from stdin). At minimum, add a deprecation warning when the flag is used, and update examples to show the env-var approach. Update the example on L62 to use `VERCEL_AUTOMATION_BYPASS_SECRET=... vercel curl ...` instead of `--protection-bypass <secret>`.

## Recent committers (`git log`)

- Brooke <25040341+brookemosby@users.noreply.github.com> (2026-02-13)
- Dimitri Mitropoulos <dimitrimitropoulos@gmail.com> (2025-11-10)
