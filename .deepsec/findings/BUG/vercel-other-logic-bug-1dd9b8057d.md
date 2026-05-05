# [BUG] basePath prefix match doesn't enforce path boundary

**File:** [`packages/next/src/edge-function-source/get-edge-function.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/next/src/edge-function-source/get-edge-function.ts#L60-L64) (lines 60, 61, 62, 63, 64)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `lolzatu2@gmail.com` _(via last-committer)_

## Finding

The basePath stripping logic uses `pathname.startsWith(basePath)` without checking that the next character is `/` or end-of-string. With basePath=`/admin`, a request to `/administrators` matches the prefix and gets transformed to `'istrators'` (no leading slash) via `pathname.replace(basePath, '')`. The resulting malformed pathname is then used for static/dynamic route matching, which could produce incorrect `pageMatch` results. Security impact is limited because the original `request.url` is passed unchanged to the middleware (so middleware using `request.nextUrl.pathname` for auth checks is unaffected), but middleware that relies on the computed `pageMatch.name` for routing decisions could be misled.

## Recommendation

Verify path boundary, e.g. `pathname === basePath || pathname.startsWith(basePath + '/')`. Use a regex anchored at the boundary or a helper that strips only when the basePath is a proper path prefix.

## Recent committers (`git log`)

- Janka Uryga <lolzatu2@gmail.com> (2024-11-26)
- Nathan Rajlich <n@n8.io> (2022-05-18)
