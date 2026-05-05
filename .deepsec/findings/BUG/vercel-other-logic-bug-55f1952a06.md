# [BUG] Broken unique-app deduplication filter (shadowing + per-row Set)

**File:** [`packages/cli/src/commands/list/index.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/list/index.ts#L385-L464) (lines 385, 386, 387, 388, 389, 455, 456, 457, 458, 459, 460, 461, 462, 463, 464)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `53410236+Melkeydev@users.noreply.github.com` _(via last-committer)_

## Finding

The `.filter(app => app === null ? filterUniqueApps() : () => true)` block at L385-389 is broken in three ways: (1) the inner `app` shadows the outer `app` argument and is actually each row array, so `app === null` is never true; (2) the truthy branch returns the function literal `() => true` rather than calling it, so the filter callback always returns a truthy function and keeps every row; (3) even if the comparison were correct, `filterUniqueApps()` is invoked per row, creating a fresh `Set` each call and preventing any state from persisting across rows. The net effect is that running `vercel list` (no app argument) does not collapse multiple deployments per project as intended — all rows are rendered. Not a security issue, but it directly defeats the documented behavior described by the comment immediately above the filter.

## Recommendation

Hoist the dedup decision out of the per-row callback. Example: `const filterFn = app ? () => true : filterUniqueApps(); ... .filter(filterFn)` — using the outer `app` variable (the user-supplied argument, captured before the filter chain) and instantiating the stateful filter once.

## Recent committers (`git log`)

- MelkeyDev <53410236+Melkeydev@users.noreply.github.com> (2026-03-30)
- Thomas Knickman <tom.knickman@vercel.com> (2026-02-19)
- Austin Merrick <onsclom@onsclom.net> (2025-12-03)
- Swarnava Sengupta <swarnavasengupta@gmail.com> (2025-10-02)
