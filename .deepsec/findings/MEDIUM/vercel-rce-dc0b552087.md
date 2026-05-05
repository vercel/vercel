# [MEDIUM] Command injection via linked project name in Cursor deep-link `open`/`xdg-open`

**File:** [`packages/cli/src/commands/mcp/mcp.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/mcp/mcp.ts#L340-L349) (lines 340, 345, 347, 349)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `rce`

## Owners

**Suggested assignee:** `25040341+brookemosby@users.noreply.github.com` _(via last-committer)_

## Finding

Line 340 builds `oneClickUrl = `cursor://anysphere.cursor-deeplink/mcp/install?name=${serverName}&config=${encodedConfig}`` where `serverName = `vercel-${projectName}`` and `projectName` is unencoded. The resulting URL is then wrapped in single quotes and passed to `execSync` on line 345 (`open '${oneClickUrl}'`) and line 349 (`xdg-open '${oneClickUrl}'`). On Windows (line 347, `start ${oneClickUrl}`) the URL is not quoted at all. A `projectName` containing a single quote (e.g., `foo'; evil_cmd; '`) breaks out of the single-quoted argument on macOS/Linux, executing `evil_cmd`. On Windows, `&` in the URL (always present between `name=` and `config=`) and any shell metacharacter in `serverName` is treated as a cmd.exe separator. Note: the VS Code path (lines 462–471) avoids this because `serverName` is placed inside a JSON object then `encodeURIComponent`-encoded into the URL — so single quotes/`&` become `%27`/`%26`. The Cursor path is the only one that includes raw `serverName` directly in the URL.

## Recommendation

Either (a) percent-encode `serverName` with `encodeURIComponent` when building the Cursor URL, OR (b) avoid shell entirely by using `execFile('open', [oneClickUrl])` / `execFile('xdg-open', [oneClickUrl])` / `execFile('cmd', ['/c', 'start', '', oneClickUrl])`. Validate `projectName` against an allowlist regex before any use in command construction.

## Recent committers (`git log`)

- Brooke <25040341+brookemosby@users.noreply.github.com> (2026-03-11)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-04)
