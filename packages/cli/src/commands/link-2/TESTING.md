# link-2 testing notes

Unit tests for the link-2 command live in `packages/cli/test/unit/commands/link-2/`.

## What’s covered

- **`collect-baseline.test.ts`** – `collectLinkBaseline()` only (no API): detection, repo.json/project.json reading, no client.
- **`index.test.ts`** – Full command with mocked Vercel APIs:
  - `--help`
  - `--json`: baseline output (repo + potentialProjects) when in repo with API; when no repo root is found, null `rootPath` and `repo`.
  - **When no repo root is found:** With `--yes`, runs directory-only link (same as current `vc link`): select org, create/link project, write `.vercel/project.json`. Without `--yes`, exits 0 and logs "not in a repo" (no scope prompt).
  - Non-interactive (`--yes`):
    - At repo root: one repo project (link_many); two repo projects (link_many, 2× project.json); single root project (link_one, project at root); zero repo projects (skip); not in repo (exit 0, message).
    - From subfolder: repo has matching project (prompt_link_existing → link that project); potentialProjects name match only (suggest_potential → link + connect repo + PATCH rootDirectory); no repo project, framework detected (offer_create → create project + connect).
  - Interactive:
    - At repo root with one repo project: scope prompt, then link, pull prompt.
    - From subfolder with repo project (prompt_link_existing): scope → “Link to X?” → y → pull n; asserts linked.
    - From subfolder with potential project (suggest_potential): scope → “Link to existing project X?” → y → “Connect this repo?” → y → “Set Root Directory?” → y → pull n; asserts linked.
    - From subfolder with no repo project (offer_create): scope → “Create new project X?” → y → pull n; asserts created and linked.
    - prompt_link_existing decline: “Link to X?” → n; asserts no .vercel written.
  - Edge: non-TTY and no `--yes` when a confirm would be needed (e.g. offer_create) → exit 1 and message mentioning `--yes` / TTY.

## API mocks

- **GET /v9/projects**  
  - With `repoUrl` query: return `{ projects: Project[], pagination: { count, next: null, prev: null } }` (repo-linked projects).  
  - With `limit=100` (or no repoUrl): used for potentialProjects (folder-name match).  
  Same route handles both; handler branches on `req.query.repoUrl`.

- **Scope / org**  
  `useUser()`, `useTeams(teamId)`, `useUnknownProject()` from `test/mocks/` so `selectOrg` and project fetch/create/link work.

- **Env pull**  
  `vi.mock('../../../../src/commands/env/pull')` and `mockPull.mockResolvedValue(0)`.

## Friction / plan gaps surfaced by tests

1. **--json output stream**  
   Baseline JSON is printed with `output.print()` → goes to **stderr**, not stdout. Tests read `client.stderr.getFullOutput()` for `--json`. Plan doesn’t specify stream; worth documenting for consumers of `--json`.

2. **Path normalization**  
   Baseline `cwd` / `rootPath` can be realpath’d (e.g. macOS `/private/var/...` vs `/var/...`). Tests use `realpathSync(tmpDir)` when asserting equality. Callers that compare these paths to other fs paths may need to normalize.

3. **Non-interactive error assertion**  
   When the command exits with 1 and prints an error, the message is written then the process exits. Tests assert on `client.stderr.getFullOutput()` after `await link2(client)`; using `await expect(client.stderr).toOutput('...')` can time out because no new output arrives. So for “exit 1 + message” we assert on the full stderr string (e.g. `toContain('non-interactive')`, `toContain('--yes')`).

4. **Plan §8 / API semantics**  
   Tests assume a single mock for GET `/v9/projects` that returns the same team’s projects for both `repoUrl` and `limit=100`. Plan notes that `/v9/projects?repoUrl=...` may be scoped to current team or cross-team; pagination is unspecified. If the real API is per-team, tests would need to call the mock per team or document that we only test single-team here.

5. **Multiple teams**  
   Plan §6: “same workspace, multiple teams” behavior is not defined. Tests use one team only. Adding multi-team scenarios (e.g. two teams with projects for same repo) would require deciding expected behavior first.

6. **Tabled: multi-project at root, link root to project not named like folder**  
   Plan §8: at repo root, linking the root directory to a project whose name doesn’t match the folder is tabled. No test covers that; would need an explicit flag or flow to test later.
