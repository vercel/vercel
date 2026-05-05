# [BUG] findProjectInfo validation logic uses && instead of validating each field

**File:** [`packages/oidc/src/token-util.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/oidc/src/token-util.ts#L147-L152) (lines 147, 148, 149, 150, 151, 152)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `39992+gr2m@users.noreply.github.com` _(via last-committer)_

## Finding

`findProjectInfo` at L147 has the check `if (typeof prj.projectId !== 'string' && typeof prj.orgId !== 'string')` — this only throws when BOTH fields are non-strings. If `projectId` is missing/undefined but `orgId` is a string (or vice versa), the validation passes silently, and the function returns `{ projectId: undefined, teamId: <string> }`. Downstream URL construction would then produce `https://api.vercel.com/v1/projects/undefined/token`. The error message specifically says 'Expected a string-valued projectId property,' indicating the intent was to validate `projectId`. The condition should likely be `||` (or each field checked independently). The bug is partially masked by the caller in token.ts checking `if (!projectId)` afterward — but the failure mode and error message are then misleading.

## Recommendation

Validate each field separately: `if (typeof prj.projectId !== 'string') throw new TypeError('Expected a string-valued projectId property...');` and the same for orgId if it's required. The error message should match what's actually missing.

## Recent committers (`git log`)

- Gregor Martynus <39992+gr2m@users.noreply.github.com> (2026-02-10)
- Alice <105500542+alice-wondered@users.noreply.github.com> (2026-01-05)
- Casey Gowrie <casey.gowrie@vercel.com> (2025-11-19)
