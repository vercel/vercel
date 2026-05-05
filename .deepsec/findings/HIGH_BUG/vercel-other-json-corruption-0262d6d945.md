# [HIGH_BUG] JSONparse crashes on env var values ending with backslash, blocking env pull

**File:** [`packages/cli/src/commands/env/pull.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/env/pull.ts#L259) (lines 259)
**Project:** vercel
**Severity:** HIGH_BUG  •  **Confidence:** high  •  **Slug:** `other-json-corruption`

## Owners

**Suggested assignee:** `elvis@vercel.com` _(via last-committer)_

## Finding

Line 259 uses a brittle string transformation to strip embedded quotes from `records` for delta computation: `JSONparse(JSON.stringify(records).replace(/\\"/g, ''))`. The regex `/\\"/g` matches a literal backslash followed by a quote (2 characters). When an env var value contains a trailing backslash (e.g., a Windows path like `C:\Users\foo\`), `JSON.stringify` escapes it to `\\` and adds the closing quote, producing `...\\"`. The regex then matches the final `\"` portion (the second `\` and the closing `"`) and removes them, leaving an unterminated JSON string like `"...foo\\`. `JSONparse` throws an `Unexpected end of JSON input` error.

Because this throws synchronously inside `envPullCommandLogic` with no try/catch around it, the entire pull command aborts AFTER the API has been called but BEFORE `outputFile(fullPath, contents, 'utf8')` (line 273) writes the new file. Result: a user with a single backslash-terminated env var value (extremely common on Windows projects) cannot re-pull when a `.env` file already exists. They will see a cryptic JSON parse error and the local file remains stale.

Reproduction: set any env var to `C:\\Users\\me\\` (single trailing `\`). First pull succeeds (no existing file → JSONparse path skipped). Second pull throws.

A simpler env var value of just `\` (single backslash) reproduces the same crash: `JSON.stringify('\\')` → `"\\\\"` → after `.replace(/\\"/g, '')` → `"\\` → JSONparse throws.

## Recommendation

Replace the brittle string transformation with a structured walk: e.g., `const newEnv = Object.fromEntries(Object.entries(records).map(([k, v]) => [k, typeof v === 'string' ? v.replace(/"/g, '') : v]));`. Or wrap in try/catch and fall back to skipping the diff so the file write still proceeds. Removing embedded quotes by manipulating the JSON string is unsafe for any value that contains `\"`, `\` followed by `"`, or similar patterns.

## Recent committers (`git log`)

- Elvis Pranskevichus <elvis@vercel.com> (2026-04-30)
- Felix Haus <472867+ofhouse@users.noreply.github.com> (2026-04-03)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-11)
- Marcos Grappeggia <marcosgrappeggia@gmail.com> (2026-03-10)
- Brooke <25040341+brookemosby@users.noreply.github.com> (2026-02-20)
