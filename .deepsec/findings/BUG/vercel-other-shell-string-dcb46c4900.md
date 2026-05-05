# [BUG] execSync uses shell-interpolated command for uv --version

**File:** [`packages/python/src/index.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/python/src/index.ts#L333) (lines 333)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-shell-string`

## Owners

**Suggested assignee:** `greg.c.schofield@gmail.com` _(via last-committer)_

## Finding

Line 333 calls execSync(`${uvPath} --version`), invoking /bin/sh -c with a concatenated command. uvPath here comes from getUvBinaryOrInstall which falls back to path-resolution functions that read output from `python -c`. Although production uvPath is a known safe path, any path containing whitespace or shell metacharacters would either break the command or allow unintended execution.

## Recommendation

Use execFileSync(uvPath, ['--version'], { encoding: 'utf8' }) instead of execSync with a concatenated string.

## Recent committers (`git log`)

- Greg Schofield <greg.c.schofield@gmail.com> (2026-04-21)
- dnwpark <dnwpark@protonmail.com> (2026-04-20)
- Ricardo Gonzalez <30984749+ricardo-agz@users.noreply.github.com> (2026-04-16)
- Nik <nik.sidnev@vercel.com> (2026-04-15)
