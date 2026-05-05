# [BUG] JSDoc rewrite example has broken template literal interpolation

**File:** [`packages/functions/src/middleware.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/functions/src/middleware.ts#L74) (lines 74)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-doc-template-literal-bug`

## Owners

**Suggested assignee:** `josefrancisco.verdu@gmail.com` _(via last-committer)_

## Finding

The JSDoc example at line 74 reads `url.pathname = \`/experimental{url.pathname}\`;` — the `$` sigil is missing before `{url.pathname}`, so this template literal evaluates to the literal string `/experimental{url.pathname}` rather than concatenating the original pathname. Developers following this example would unintentionally rewrite all matching requests to a static path, breaking the routing logic the example is meant to illustrate.

## Recommendation

Change to `url.pathname = \`/experimental${url.pathname}\`;` so the original pathname is interpolated.

## Recent committers (`git log`)

- Kiko Beats <josefrancisco.verdu@gmail.com> (2024-12-18)
