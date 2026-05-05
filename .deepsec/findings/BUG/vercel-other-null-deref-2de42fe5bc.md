# [BUG] envParam.getName() called before existence check

**File:** [`packages/remix/src/hydrogen.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/remix/src/hydrogen.ts#L67-L69) (lines 67, 68, 69)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-null-deref`

## Owners

**Suggested assignee:** `n@n8.io` _(via last-committer)_

## Finding

Line 68 calls `envParam.getName()` immediately after `const envParam = parameters[1]`, then line 69 checks `if (envParam)`. If a Hydrogen `server.ts` defines a fetch method with fewer than 2 parameters, `parameters[1]` is undefined and line 68 throws a TypeError before the guard on line 69 can take effect. Unlikely to fire in practice (the Hydrogen template always has at least `request, env, executionContext`) but the existence check is in the wrong order.

## Recommendation

Move `getName()` inside the `if (envParam)` guard, e.g. `if (envParam) { const envParamName = envParam.getName(); ... }`.

## Recent committers (`git log`)

- Nathan Rajlich <n@n8.io> (2023-08-14)
