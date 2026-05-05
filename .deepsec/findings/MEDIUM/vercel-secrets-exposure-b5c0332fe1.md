# [MEDIUM] Blob Read-Write Token accepted as CLI flag (--rw-token)

**File:** [`packages/cli/src/commands/blob/command.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/blob/command.ts#L447-L454) (lines 447, 448, 449, 450, 451, 452, 453, 454)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `secrets-exposure`

## Owners

**Suggested assignee:** `marcosgrappeggia@gmail.com` _(via last-committer)_

## Finding

The `blobCommand` definition exposes a `--rw-token` flag (lines 447-454) that accepts a sensitive Read-Write Token as a command-line argument. Secrets passed via flags are exposed through the OS process list (`ps -ef`), shell history files, container/orchestration logs, and process accounting subsystems. Any local user on a multi-tenant system can read another user's argv. The project's own AGENTS.md guidance explicitly calls this out as a forbidden pattern: 'Never accept secrets via flags. Flags leak into ps output and shell history. Accept tokens and credentials via environment variables, config files, or stdin instead.' A leaked rw-token grants full read/write access to the user's Blob store contents.

## Recommendation

Remove the `--rw-token` flag and require the token to be supplied via an environment variable (e.g., BLOB_READ_WRITE_TOKEN) or read from stdin/config file. If backwards compatibility requires keeping the flag, emit a deprecation warning that recommends the env-var path, and ensure the token is never echoed back in error messages or logs.

## Recent committers (`git log`)

- Marcos Grappeggia <marcosgrappeggia@gmail.com> (2026-04-13)
- Vincent Voyer <vincent@codeagain.com> (2026-04-13)
- Steven <steven@ceriously.com> (2026-01-15)
