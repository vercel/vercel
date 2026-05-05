# [BUG] execSync uses shell-interpolated command string instead of argv

**File:** [`packages/python/src/uv.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/python/src/uv.ts#L69-L72) (lines 69, 70, 71, 72)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-shell-string`

## Owners

**Suggested assignee:** `greg.c.schofield@gmail.com` _(via last-committer)_

## Finding

listInstalledPythons() builds a shell command string with `${this.uvPath} python list --only-installed --output-format json` and passes it to execSync, which invokes /bin/sh -c. In the Vercel build image uvPath is a known path (/usr/local/bin/uv), so this is not exploitable in production. However, findUvBinary() will accept paths derived from `python -c 'import sysconfig; print(sysconfig.get_path("scripts"))'` output or from which.sync('uv'). On a developer's local machine, if that output contained shell metacharacters (whitespace, $, `, ;) the command would break or execute unintended code. No shell interpolation is needed here — the arguments are static.

## Recommendation

Use execFileSync or execa-style array args: execFileSync(this.uvPath, ['python', 'list', '--only-installed', '--output-format', 'json'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }). This removes the shell entirely and makes path-with-spaces safe as well.

## Recent committers (`git log`)

- Greg Schofield <greg.c.schofield@gmail.com> (2026-04-13)
- Michael J. Sullivan <sully@msully.net> (2026-03-20)
