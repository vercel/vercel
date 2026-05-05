# [BUG] Token written to .bashrc/.profile is unsafe inside double quotes

**File:** [`packages/cli/evals/setup/auth-and-config.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/evals/setup/auth-and-config.ts#L28-L32) (lines 28, 32)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-shell-injection-on-rc-file`

## Owners

**Suggested assignee:** `elvis@vercel.com` _(via last-committer)_

## Finding

Lines 28 and 32 build rc-file lines via `printf 'export VERCEL_TOKEN="%s"\n' '${shellEscape(token)}'`. The `shellEscape` helper only escapes single quotes, which protects the printf argument while bash is parsing it — but the printf *output* (which is then redirected into ~/.bashrc and ~/.profile) places the raw token inside a double-quoted bash string. If VERCEL_TOKEN ever contains `$`, `` ` ``, `\`, or `"`, those characters will be interpreted (including `$( ... )` command substitution) the next time the rc file is sourced inside the sandbox shell. This is a test/eval setup file and VERCEL_TOKEN is a trusted secret env var supplied by the CI runner (not attacker-controlled input), so this is a robustness bug rather than an exploitable vulnerability — but a malformed/copy-pasted token could silently corrupt the rc files or execute unintended commands inside the sandbox shell. The same risk does NOT apply to the JSON config writes earlier in the function, which use single-quoted `printf '%s'` and never reinterpret the value.

## Recommendation

Either (a) write the export line via `printf 'export VERCEL_TOKEN=%s\n' "$(printf %q "$TOKEN")"` so the token is shell-quoted, or (b) source the value from auth.json at runtime instead of writing it into the rc file, or (c) extend shellEscape to also escape `"`, `\`, `$`, and `` ` `` before the output is placed inside double quotes.

## Recent committers (`git log`)

- Elvis Pranskevichus <elvis@vercel.com> (2026-04-29)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-04)
- Brooke <25040341+brookemosby@users.noreply.github.com> (2026-02-25)
- Jeff See <jeffsee.55@gmail.com> (2026-02-24)
