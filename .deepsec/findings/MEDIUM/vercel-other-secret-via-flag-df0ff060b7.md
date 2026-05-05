# [MEDIUM] Protection bypass secret accepted as CLI flag

**File:** [`packages/cli/src/commands/project/protection.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/project/protection.ts#L208-L341) (lines 208, 209, 210, 306, 335, 336, 341)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-secret-via-flag`

## Owners

**Suggested assignee:** `25040341+brookemosby@users.noreply.github.com` _(via last-committer)_

## Finding

The `--protection-bypass-secret` flag accepts a sensitive bypass secret directly on the command line (lines 208-210, used at lines 335-336 and 341). The project's own AGENTS.md explicitly states: 'Never accept secrets via flags. Flags leak into ps output and shell history. Accept tokens and credentials via environment variables, config files, or stdin instead.' A user invoking `vercel project protection disable --protection-bypass --protection-bypass-secret <secret>` will leak this secret to: (1) shell history files (~/.bash_history, ~/.zsh_history), (2) process listings via `ps aux` visible to other users on the same host, (3) CI/CD audit logs that capture invoked commands, and (4) terminal scrollback / screen recordings. The bypass secret allows callers to bypass deployment protection (SSO/password) — an attacker who recovers it from any of those sinks can access protected deployments. For `disable`, the secret is required (line 306), so users have no in-band alternative; for `enable`, providing a custom secret is optional but the same flag is used.

## Recommendation

Read the secret from a safer source: (a) read from stdin when not a TTY (or via an `--protection-bypass-secret-stdin` flag), (b) accept an env var like `VERCEL_PROTECTION_BYPASS_SECRET`, or (c) prompt with masked input when interactive. If keeping the flag for backwards compatibility, document the leak risk and prefer the alternatives in help text.

## Recent committers (`git log`)

- Brooke <25040341+brookemosby@users.noreply.github.com> (2026-04-08)
