# [MEDIUM] False positive triage for scanner flags

**File:** [`packages/cli/src/commands/env/pull.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/env/pull.ts#L73-L268) (lines 73, 227, 268)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `other-info-disclosure`

## Owners

**Suggested assignee:** `elvis@vercel.com` _(via last-committer)_

## Finding

Documenting that the scanner-flagged items on this file are false positives so reviewers don't re-flag them: (1) L73 `missing-auth` — `pull` is a CLI command default export, not an HTTP endpoint; auth happens via the user's local Vercel token loaded by the Client. (2) L227, L268 `insecure-crypto` (weak cipher) — no cipher exists anywhere in this file; line 227 is part of the gitBranch download message (`chalk.cyan(gitBranch)`), and line 268 is `Object.keys(records).sort().filter(...)` building the .env contents. The regex matched on unrelated string patterns.

## Recommendation

Mark these flags as triaged false positives in the scanner's allowlist for env/pull.ts default-export and unrelated lines.

## Recent committers (`git log`)

- Elvis Pranskevichus <elvis@vercel.com> (2026-04-30)
- Felix Haus <472867+ofhouse@users.noreply.github.com> (2026-04-03)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-11)
- Marcos Grappeggia <marcosgrappeggia@gmail.com> (2026-03-10)
- Brooke <25040341+brookemosby@users.noreply.github.com> (2026-02-20)
