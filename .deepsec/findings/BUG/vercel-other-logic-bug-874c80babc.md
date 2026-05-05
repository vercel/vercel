# [BUG] Non-null assertion on optional namedRegex field

**File:** [`packages/next/src/edge-function-source/get-edge-function.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/next/src/edge-function-source/get-edge-function.ts#L45-L51) (lines 45, 51)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-logic-bug`

## Owners

**Suggested assignee:** `lolzatu2@gmail.com` _(via last-committer)_

## Finding

`route.namedRegex!` is used at lines 45 and 51 even though the type definition declares `namedRegex?: string` as optional. If a route in the manifest is missing `namedRegex`, `new RegExp(undefined!)` is invoked which evaluates to `new RegExp('undefined')` — a regex that matches the literal substring 'undefined' anywhere in the input. This would cause requests containing 'undefined' in the path (e.g. `/foo/undefined`) to match the affected route, producing incorrect `pageMatch` assignment. Not exploitable in practice since Next.js's manifest generator always populates `namedRegex`, but it is a fragile assumption.

## Recommendation

Either narrow the type so `namedRegex` is required at this layer, or guard with `if (!route.namedRegex) continue;` before constructing the RegExp.

## Recent committers (`git log`)

- Janka Uryga <lolzatu2@gmail.com> (2024-11-26)
- Nathan Rajlich <n@n8.io> (2022-05-18)
