# [MEDIUM] False positive triage for scanner flag

**File:** [`packages/cli/src/commands/env/run.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/env/run.ts#L47-L117) (lines 47, 117)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `other-info-disclosure`

## Owners

**Suggested assignee:** `julianbenegas99@gmail.com` _(via last-committer)_

## Finding

Scanner flagged L47 `missing-auth: HTTP entry point: default export handler`. This is a CLI subcommand handler for `vercel env run`, not an HTTP endpoint. The function uses `execa(userCommand[0], userCommand.slice(1), {...})` (line 117) where `userCommand` is provided by the user themselves (everything after `--` in their own CLI invocation). This is the documented, intended behavior — there is no external attacker that can supply `userCommand`. `execa`'s array form does not invoke a shell, so there is no shell-injection vector even if the env var values are attacker-controlled. The env precedence (`...records.env, ...localEnv, ...process.env`) is by-design (process.env wins for explicit user overrides). No security issue.

## Recommendation

Mark as triaged false positive. CLI command default-exports that wrap `execa` with the user's own argv after `--` are not RCE sinks in the threat model.

## Recent committers (`git log`)

- Julian Benegas <julianbenegas99@gmail.com> (2026-02-09)
