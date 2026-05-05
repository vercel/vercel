# [MEDIUM] Recursive results-dir walker may follow symlinks outside the input directory

**File:** [`packages/cli/evals/scripts/transform-agent-eval-to-canonical.js`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/evals/scripts/transform-agent-eval-to-canonical.js#L33-L136) (lines 33, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 132, 133, 134, 135, 136)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** low  •  **Slug:** `other-symlink-traversal`

## Owners

**Suggested assignee:** `tom.knickman@vercel.com` _(via last-committer)_

## Finding

`listFilesRecursively` (L33-52) walks `--results-dir` recursively and uploads every file it finds. While `readdir({ withFileTypes: true })` returns entries based on `d_type` (which generally distinguishes symlinks from regular files on systems supporting it), the subsequent `readFile(fullPath)` at L136 follows symlinks transparently. If the results directory contains a symlink that `Dirent.isFile()` happens to identify as a regular file (e.g., on filesystems where `d_type` returns `DT_UNKNOWN` and Node falls back to `stat` rather than `lstat`), arbitrary host files reachable by the symlink target could be read and uploaded. Additionally, `path.relative(resultsDir, fullPath)` will produce `..` segments for any path outside the root, and those are then sent verbatim as the upload filename. The threat model is limited (the script trusts its input directory), but a malicious or compromised eval-runner that controls the contents of `--results-dir` could exfiltrate host files via this path.

## Recommendation

Use `lstat` (or `readdir` with explicit symlink filtering) and skip any entry that is a symlink. Reject (or normalize) any computed `relativePath` that contains `..` segments before adding to FormData.

## Recent committers (`git log`)

- Thomas Knickman <tom.knickman@vercel.com> (2026-03-05)
- Jeff See <jeffsee.55@gmail.com> (2026-02-27)
