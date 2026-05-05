# [MEDIUM] False positive triage for scanner flag

**File:** [`packages/cli/src/commands/env/index.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/env/index.ts#L37) (lines 37)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `other-info-disclosure`

## Owners

**Suggested assignee:** `53410236+Melkeydev@users.noreply.github.com` _(via last-committer)_

## Finding

Scanner flagged L37 `missing-auth: HTTP entry point: default export handler`. This is a CLI subcommand dispatcher for `vercel env`, not an HTTP handler. It dispatches to `ls`, `add`, `rm`, `pull`, `run`, `update` based on subcommand parsing. Authentication for backend API calls happens via the Vercel token loaded by `Client`. No security issue here. The handler also does no untrusted execution — it only calls trusted internal subcommand functions and `autoInstallVercelPlugin` on success. Reviewed for parameter pollution, race conditions, and prototype pollution in `parseArguments`/`getSubcommand`; none apparent in this file's scope.

## Recommendation

Mark as triaged false positive. CLI default-export handlers should be excluded from the HTTP-entry-point pattern unless inside an Express/Next route.

## Recent committers (`git log`)

- MelkeyDev <53410236+Melkeydev@users.noreply.github.com> (2026-04-16)
- Julian Benegas <julianbenegas99@gmail.com> (2026-01-12)
- Daniel Roe <daniel@roe.dev> (2025-09-18)
- Erika Rowland <130414394+erikareads@users.noreply.github.com> (2025-01-03)
