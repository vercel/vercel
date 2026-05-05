# [BUG] Duplicate `transfer-encoding` entry in NONOVERRIDABLE_HEADERS

**File:** [`packages/cli/src/util/dev/headers.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/util/dev/headers.ts#L27-L29) (lines 27, 29)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-duplicate-set-entry`

## Owners

**Suggested assignee:** `130414394+erikareads@users.noreply.github.com` _(via last-committer)_

## Finding

The `NONOVERRIDABLE_HEADERS` Set contains `'transfer-encoding'` twice (line 27 and line 29). Sets dedupe so this is a no-op behaviorally, but it indicates a copy-paste error and likely a missing header (perhaps `'expect'` or another connection-management header) that the author intended to include.

## Recommendation

Remove the duplicate entry. Audit which Hop-by-hop / connection-management headers should also be in the set (e.g., `expect`, `proxy-authorization`).

## Recent committers (`git log`)

- Erika Rowland <130414394+erikareads@users.noreply.github.com> (2024-11-20)
- Seiya Nuta <nuta@seiya.me> (2022-10-27)
- Nathan Rajlich <n@n8.io> (2022-06-27)
