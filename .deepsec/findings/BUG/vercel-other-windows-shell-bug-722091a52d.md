# [BUG] Windows `start` command always misparses the deep-link URL because of unescaped `&`

**File:** [`packages/cli/src/commands/mcp/mcp.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/mcp/mcp.ts#L347-L469) (lines 347, 469)
**Project:** vercel
**Severity:** BUG  •  **Confidence:** high  •  **Slug:** `other-windows-shell-bug`

## Owners

**Suggested assignee:** `25040341+brookemosby@users.noreply.github.com` _(via last-committer)_

## Finding

On line 347 (`execSync(`start ${oneClickUrl}`)`) and line 469, the cursor:// and vscode: deep-link URLs are passed unquoted to `start`. The URLs always contain `&` (between `name=` and `config=`, or in the encoded JSON), and `&` is a cmd.exe command separator. As a result, cmd.exe splits the line into multiple commands at every `&`, breaking the one-click installer on Windows even with non-malicious inputs. The user typically falls through to the catch block and sees the manual instructions, but the deep link never works on Windows for either Cursor or VS Code.

## Recommendation

Quote the URL on Windows (`start "" "${oneClickUrl}"`) or use `execFile('cmd', ['/c', 'start', '', oneClickUrl])` to avoid shell interpretation. Note: the empty `""` after `start` is required as the optional window title.

## Recent committers (`git log`)

- Brooke <25040341+brookemosby@users.noreply.github.com> (2026-03-11)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-04)
