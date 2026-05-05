# [BUG] Dev shim template does not escape user-controlled substitutions

**File:** [`packages/python/src/start-dev-server.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/python/src/start-dev-server.ts#L660-L664) (lines 660, 661, 662, 663, 664)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-template-injection`

## Owners

**Suggested assignee:** `30984749+ricardo-agz@users.noreply.github.com` _(via last-committer)_

## Finding

createDevShim() reads templates/vc_init_dev.py and replaces __VC_DEV_MODULE_NAME__, __VC_DEV_ENTRY_ABS__, __VC_DEV_FRAMEWORK__, and __VC_DEV_VARIABLE_NAME__ without escaping. The values come from user-controlled sources: qualifiedModule is derived from the entrypoint filename, entryAbs is join(workPath, entry), and variableName is the user's WSGI variable. If any of these contain Python string delimiters (e.g. a file named with a " or '), the replacement breaks out of the template's string literals and the generated Python source becomes invalid or even injects code. In the `vercel dev` threat model this is self-injection in the user's own dev session (not a security boundary crossing), but it's a fragile pattern that can cause confusing build failures and would become a real vulnerability if these values ever flow from a less-trusted source.

## Recommendation

Use JSON.stringify to safely embed string values in the Python source (JSON strings are a strict subset of Python string literals), or use a proper template engine with escaping. Alternatively, pass these as command-line args / env vars and read them from os.environ/sys.argv inside the shim.

## Recent committers (`git log`)

- Ricardo Gonzalez <30984749+ricardo-agz@users.noreply.github.com> (2026-04-16)
- Michael J. Sullivan <sully@msully.net> (2026-04-15)
- dnwpark <dnwpark@protonmail.com> (2026-04-13)
- Greg Schofield <greg.c.schofield@gmail.com> (2026-04-11)
