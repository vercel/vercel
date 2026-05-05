# [BUG] Imprecise homedir prefix check can mis-format unrelated paths

**File:** [`packages/cli/src/util/humanize-path.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/util/humanize-path.ts#L7-L8) (lines 7, 8)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-display-bug`

## Owners

**Suggested assignee:** `CommanderRoot@users.noreply.github.com` _(via last-committer)_

## Finding

humanizePath uses `resolved.indexOf(_homedir) === 0` to detect paths inside the user's home directory, but does not verify that the next character after the homedir prefix is a path separator (or that the path equals homedir exactly). If the homedir is `/home/user`, a resolved path like `/home/userprivate/secret` will start with the homedir string and be transformed into `~private/secret`, which both looks like and reads as a path inside the user's home directory. This is a display-only issue (not a security vulnerability) but could mislead users in CLI output.

## Recommendation

Replace the indexOf check with a separator-aware comparison, e.g. `resolved === _homedir || resolved.startsWith(_homedir + path.sep)`, so unrelated directories that share a prefix with the homedir are not transformed.

## Recent committers (`git log`)

- CommanderRoot <CommanderRoot@users.noreply.github.com> (2022-03-24)
- ernestd <lapapelera@gmail.com> (2021-03-06)
