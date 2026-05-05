# [MEDIUM] Bearer token and bypass secret accepted via CLI flags

**File:** [`packages/cli/evals/scripts/transform-agent-eval-to-canonical.js`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/evals/scripts/transform-agent-eval-to-canonical.js#L85-L146) (lines 85, 86, 146)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `secrets-exposure`

## Owners

**Suggested assignee:** `tom.knickman@vercel.com` _(via last-committer)_

## Finding

The script accepts the ingest API token via `--token` (used at L146 as `Authorization: Bearer ${args.token}`) and the protection bypass secret via `--protection-bypass-secret` (L85). CLI flags are visible to other users on the same host via `ps aux` / `/proc/<pid>/cmdline` and may be captured in shell history, CI run logs, and process accounting. The repository's own `packages/cli/AGENTS.md` explicitly states: "Never accept secrets via flags. Flags leak into ps output and shell history. Accept tokens and credentials via environment variables, config files, or stdin instead." While this is an internal CI/eval script (not the user-facing CLI), shared CI runners and post-mortem log archives can still expose these credentials.

## Recommendation

Read `--token` and `--protection-bypass-secret` exclusively from environment variables (e.g., `VERCEL_INGEST_TOKEN`, `VERCEL_AUTOMATION_BYPASS_SECRET`) and remove the CLI-flag fallback. If a CLI-flag path must remain for ergonomics, document the leakage risk and prefer reading from stdin.

## Recent committers (`git log`)

- Thomas Knickman <tom.knickman@vercel.com> (2026-03-05)
- Jeff See <jeffsee.55@gmail.com> (2026-02-27)
