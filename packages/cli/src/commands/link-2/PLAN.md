# link-2: Plan and baseline state

High-level plan for the new link flow: single source of truth, cross-team awareness, and backwards compatibility with existing repo.json + project.json setups. **Intent:** link-2 will **replace** the current `vc link` command (not coexist long-term).

---

## 1. Baseline data sources

We gather five inputs before deciding what’s linked and what to write:

| Id | Source | Meaning |
|----|--------|--------|
| **(a)** | Framework detection | Potential **new** projects (directories + frameworks that could be created). From `detectProjects(rootPath)` → `Map<directory, Framework[]>` (directory can be `''` for root). |
| **(b)** | Repo detection (API) | **Authoritative** list of existing projects attached to this repo. From API: “projects linked to this repo” for **any team the token can access**. |
| **(c)** | Folder name detection | Existing project we might want to link: lookup by folder/project name to suggest or pre-fill. Use **detected project directories from (a)** as the folder names to look up (e.g. `apps/web`, `packages/api`, or repo root), not only the current cwd or repo name. Optional / best-effort. **Exclude** any project that is already git-linked to a **different** repo (only include it here if it’s linked to this repo or not repo-linked). |
| **(d)** | Existing `repo.json` | Whatever the repo root’s `.vercel/repo.json` says is linked (legacy/local state). |
| **(e)** | All existing `project.json` | Every `.vercel/project.json` under the repo (one per directory that was ever linked). |

**Finding (e):** Discover all project.json files under the repo using Node (e.g. glob or recursive readdir); stay in Node rather than shelling out.

**Folder name (c) rule:** Use the same directory set as (a) — detected project folders — when doing “find by folder name.” When including a project found that way, skip it if that project is already git-linked to **another** repo. Only include projects that are either linked to **this** repo or have no repo link. (Avoids suggesting a project that “matches” the folder but belongs elsewhere.)

---

## 2. Authority and reconciliation

- **(b) is authoritative** for “is this project still linked to this repo?”
- For every project id in **(d)** (and implied by **(e)**): if that project id is **not** in **(b)**, treat it as **unlinked** (e.g. project was disconnected from the repo in the dashboard). We should **not** keep writing it into repo.json / project.json.
- So: **final set of “linked” projects = (b)**, possibly merged with **new** projects we create from **(a)** in this run. Local files **(d)** and **(e)** are inputs to build that set and to preserve backwards compat, but **(b)** overrides when there’s a conflict (present in d/e, missing in b → drop).

---

## 3. Canonical state shape

- **In-memory / logical shape:** Same as today’s **repo.json** shape (`RepoProjectsConfig`: `remoteName`, `projects: RepoProjectConfig[]`), with **project.json**-level data (e.g. `projectId`, `orgId`, `projectName`) merged in per project so we have one consistent structure.
- **On disk (backwards compat):** We always write:
  - One **repo.json** at the repo root (`.vercel/repo.json`).
  - One **project.json** per linked project directory (e.g. `.vercel/project.json` at that directory). For the first iteration we can keep “repo root has both repo.json and a project.json per project” so every linked project has a project.json at its root directory; root may have multiple if we ever store multiple there, but typically one project.json per directory that has a linked project.
- So: **always build the full “repo + projects” shape**, then **always persist repo.json + all project.json files** so existing code paths that read only project.json or only repo.json still work.

**project.json content variability:** Several code paths write to project.json (e.g. `vc build` pulls project settings and writes them). When the project is linked via repo.json, a project folder (e.g. `apps/web`) can have a project.json with **project settings only** and **no** projectId/orgId — the link identity lives in repo.json. So when gathering **(e)** we may find project.json files with no identifying info; that’s expected and we must handle it (treat as “this directory is linked via repo.json” and infer identity from **(d)**). **Going forward,** link-2 will always write full project.json files (projectId, orgId, projectName, etc.), which cleans up those partial project.json files. Existing readers already support “project.json has no id, resolve from repo.json” so this should still work.

**Future / redundancy:** We may end up with redundant data (same link info in repo.json and in each project.json). Eventually we might consolidate to a single root-level file; that could be repo.json, though the name is misleading for non-git projects. For now we keep both for backwards compat.

---

## 4. First iteration scope

- **Single repo root:** One repo.json at repo root; project.json files for each linked project (including one at repo root when the root is a project).
- **Goal:** Correctly pick up **existing** setups (repo.json + scattered project.json) and reconcile with **(b)** so we never persist projects that are no longer linked. No need to over-optimize layout (e.g. “only one project at root”) in v1.

---

## 5. “Add” subcommand

- If the main link flow is correct (reconcile from (b), merge (a), write repo + all project.json), **add** may reduce to “run the same flow with a prompt to add more projects” rather than a separate code path. Defer until main flow is solid.

---

## 6. Cross-team

- **(b)** must include projects attached to this repo for **any** team the token has access to, not only the current team.
- **Implied work:**
  - Confirm whether `/v9/projects?repoUrl=...` is already cross-team or scoped to current team. If scoped, we need to either call per team or use an API that returns all.
  - When writing project.json / repo.json we have `orgId` per project; when suggesting or creating new projects we still need org selection (e.g. current behavior of `selectOrg`).
  - No change to the **shape** of repo.json/project.json (already per-project orgId); just ensure we **read** from all teams when building **(b)**.

**Note — same workspace, multiple teams:** We need to be mindful of the scenario where there are projects in **two (or more) teams** that the token has access to, for the **same workspace** (e.g. same directory path or same repo). Deciding what to write, which project to link, or how to present choices is not yet defined; we need to figure out what’s best (e.g. prefer one team, prompt, or support multiple project.json shapes).

---

## 7. Implementation order (suggested)

1. **Data gathering**
   - Implement collection of (a)–(e): detectProjects, API repo projects (cross-team if needed), find all `.vercel/project.json`, read repo.json at root. Consider also having **all workspaces** (even when no framework is detected) — see below.
2. **Reconciliation**
   - Compute “authoritative linked set” from (b); drop from (d)/(e) any project not in (b). Merge in new projects from (a) if we create/link any in this run.
3. **Canonical shape**
   - Build single in-memory structure (repo.json shape + project.json fields merged per project).
4. **Persistence**
   - Write repo.json at repo root; write project.json for each project directory. Ensure existing readers (getProjectLink, getRepoLink, etc.) still work.
5. **UX**
   - When to prompt (e.g. no link yet, or add more), and how to present “unlinked” projects that we removed from local config (optional message).
6. **Add**
   - Revisit “add” once the main flow is stable; possibly just re-run the same flow with “add more” intent.

---

## 8. Open questions

These are **unknowns or decisions** that will need to be resolved before or during implementation. They’re documented here so we don’t lose them; they’re not directed at you unless you want to weigh in.

**Unknowns (resolve by checking API, code, or docs):**

- **API semantics for repo-linked projects:** We need to confirm how `/v9/projects?repoUrl=...` behaves: Is the result scoped to the current team/org or does it return projects for all teams the token can access? How does pagination work? The answer determines whether we need to call it per team or can rely on a single cross-team response for **(b)**.

- **Subfolder cwd behavior:** When the user runs link from a subfolder (not repo root), we already have `findProjectsFromPath` and the plan is “resolve repo root first, then apply the same canonical shape and writes.” **Main requirement:** we must *not* prompt for project selection when cwd already maps to a single project (we already do this). Also verify that writing project.json at each project directory keeps `getProjectLink(client, cwd)` and deploy/build correct.

**Decisions (product / your call if you want to lock them in):**

- **Folder name (c) scope:** We use detected projects’ folder names (from (a)) for (c). Remaining decision: should (c) only run when we’re at repo root, or also when we’re in a subfolder? Your earlier note suggested “only repo root” for v1 is acceptable. If we don’t need to decide now, we can implement (c) at repo root only and expand later.

---

**Tabled / known problem:**

- **Multi-project at repo root: link root to a project not named like the folder.** In the multi-project flow we don't offer "Link to existing project?" / type project name. So if the user is at repo root and wants to link the **root directory** to an existing project whose name doesn't match the repo/folder name, there's no way to do it in that flow. We might address this later with a more explicit arg (e.g. a flag or subcommand); not decided. Tabled for now.

---

## 8b. Non-interactive / --yes: never create a project (implemented)

**Decision:** For `--yes` or any non-interactive invocation, link-2 **never creates a new project**. If the outcome would be **offer_create** (create new project with detected framework) or the **suggest_potential** branch where the user declines "Connect this repo?" and we would create a new project by name — we exit with an error: "Project creation requires interactive mode. Run without --yes or run in a TTY."

This differs from current `vc link --yes`, which does create a project when no match is found. **Implemented:** the offer_create path and the suggest_potential "new project name" branch both check `if (yes || !client.stdin.isTTY)` and return 1 with the above message before calling `createProject`.

---

## 9. No-framework directory + new-project flow

**Current behavior (to reconsider):** If you run `vc link` from a directory where we didn’t detect a framework (e.g. `/apps` with no package.json or app there), we still let you go through the “new project” flow even when there’s a repo.json at the root. That’s confusing: we have a linked repo but we’re offering to create a new project in a non-project folder.

**Proposed direction:** When entering the new-project flow from `vc link`, if we **don’t** detect a framework in that directory, we should reconsider this behavior — e.g. don’t offer new project creation there, or guide the user to a directory that has a detected framework. Using framework detection to infer intent is a bit risky (we might miss valid cases) but worth trying.

**Framework detection nuance:** Does detection distinguish (1) a workspace that’s just a static HTML app (would be “Other”) from (2) a directory that’s not any kind of workspace (e.g. `apps/` with only subdirs)? In the current code: **“Other” has no `detectors`** in `@vercel/frameworks`, so it never auto-matches; it’s only chosen when the user explicitly picks it. **`detectProjects`** works like this: `getWorkspaces` finds workspace *roots* (dirs with package.json + lockfile, or pnpm-workspace.yaml, etc.); when no manager is found at a path, it recurses into children. So **`apps/`** with no package.json is never a workspace root — we recurse into it and only register its children that have a workspace manager. **`apps/my-static-site/`** is only considered if it (or a parent) is a workspace and it appears as a *package path*; `getWorkspacePackagePaths` resolves paths by globbing for `package.json` under the workspace, so a folder with only static HTML and **no package.json** is never a package path. So we get **no** map entry for `apps/` and **no** entry for `apps/my-static-site/` when that folder has no package.json. We only get entries for directories that (1) are a workspace root or a workspace package path and (2) contain a `package.json` and (3) have at least one framework that matches. So: “not a workspace / no package.json” ⇒ not in the map (both `apps/` and `apps/my-static-site/` in the “bare or static-only” case); “workspace or package path with package.json and a detected framework” ⇒ in the map. “Other” is never auto-detected.

**Exposing all workspaces (with or without framework):** For link-2 we may want to know every workspace/package path even when no framework matched there (e.g. to offer “link existing project” by folder name, or to avoid offering new project in a non-workspace). Two options: (1) a **new function** that returns all workspace/package paths (no framework filtering), or (2) an **additional argument or return value** on `detectProjects` that also returns the raw list of workspaces we considered, so callers get both “path → frameworks” and “all workspace paths.” Either way, link-2 could use this for (a)/(c) and for the “no framework in cwd” behavior in §9.

---

## 10. New-project name collision

We detect **potential projects** by folder name and rule out ones that are git-linked to **other** repos. That same information tells us when a **proposed new project name** would collide with an existing project (e.g. one linked to another repo, or one in another team we can see). We should use that to **suggest a different name** (exact UX TBD) and must **never** let the user go through “create new project” and then have creation fail due to a name collision. Avoiding that failure is a requirement; the current behavior (create can fail on collision) should not happen in link-2.

---

## 11. Interactive mode (prompts)

**Skip first question:** Do not ask “Link Git repository at X to your Project(s)? (Y/n)” — we obviously want to link. Same for plain `vc link`; the question is redundant.

**Scope:** Do not ask for team/scope up front. Prompt for scope only when creating a new project (`selectOrg` with a create-specific message). Listing “other projects to link” uses the `accountId` of the project already in context (or the first ambiguous root project’s team for “find or create”).

**Flow (after finding repo root, linked projects, and framework detection):**

1. **Not at repo root** (cwd !== rootPath):
   - If there is an **existing project match** for current folder (by git repo + rootDirectory, or project name same as folder name): ask “Link to &lt;project name&gt;?” with **Y** auto-selected. If yes → link flow → ask pull env vars (**N** default). If they say yes: **one** linked project → run `env pull` for that app directory; **multiple** linked projects → checkbox (all checked by default) to choose which apps to pull for. If no → (no existing match path or offer create if framework detected).
   - If **framework detected** at cwd: offer to **create new project** with folder name suggested as project name and framework shown. **Do not ask “which directory”** — we know it (current folder). (We only ask “which directory” when user is at repo root or there is no repo root.)
   - Otherwise: no match, no framework → guide or skip.

2. **At repo root** (cwd === rootPath), or no repo root:
   - If there are **existing projects** attached (from API):
     - If **exactly one** and its root dir is `"."`: link that project and we’re done (then write, optionally ask pull env — **N** default; **Y** runs pull for that project without a second chooser).
     - If **multiple** (even if one is root match): link all repo projects (we always link the list we have; no checkbox at link time). Show a summary of what was linked. Env pull: **N** default; **Y** then checkbox over linked projects (all checked by default). With `link-2 --yes`, pull runs for every linked project without prompts.
   - If no existing projects / we need to offer create: **only here** do we ask “which directory” (with strong recommendation e.g. `apps/web`), then project name (folder name suggested), then create. So: **we only ask “which directory” when the user is at the repo root or there is no repo root.**

**Repo-only flow (`--repo` or add):** Don’t consider folder name; show the whole list of found projects regardless of cwd. Don’t offer to create (that’s what the `add` subcommand is for).

---

**"Link to existing project?" / type project name — single-directory only:** The current link flow lets the user type a project name when we don't find a match by folder name ("Link to existing project?" then name input or list). We should **keep** that flow for **single-directory** link (when cwd is one folder: subfolder or repo root with a single project). We should **not** offer it in the **multi-project** (repo-wide) flow: when at repo root with multiple projects we just link the repo's projects (or the list we have); if the user needs to link a project that wasn't in the list, they **cd to that directory** and run link there, where they get the single-directory flow and can "Link to existing project?" / type the name. So: type-by-name fallback exists when you're linking **one** directory; for multi-project setup we don't add that flow — user changes directory and links from there.

---

## 12. directory vs workPath and inference gotchas

A project's **Root Directory** setting on the API (`rootDirectory`, stored in repo.json as `directory`) may be `"."` or otherwise **not** reflect where that project's app actually lives in the repo. Common case: the project was set up by running link or deploy from a subfolder (e.g. `cd apps/web && vc deploy`), so the API has `rootDirectory: "."` even though the app is at `apps/web`. That's a mismatch between "project setting" and "actual location," but it's **not an error** — we must support it and not break those setups.

We therefore keep two concepts in repo.json:

- **`directory`** — The project's Root Directory **setting** (from the API). May be `"."` for the cases above.
- **`workPath`** — The path in the repo where this project's `.vercel` and app code actually live (same concept as build `workPath`, but relative to repo root). Used for resolving "which project is at path X," writing project.json, and deploy/build path resolution.

When `directory` does not reflect actual location, we **infer** `workPath` so we still know where to write and how to resolve. Inference is best-effort:

1. **Existing project.json (e):** If we find a `.vercel/project.json` with this project's `projectId`, we use that file's directory as `workPath`.
2. **Detected folder name (a):** If the project's **name** matches the **folder name** of a detected project path (e.g. project `web-21` → detected path `apps/web-21`), we use that path as `workPath`.

**Potential gotchas (we must account for these):**

- **Wrong or ambiguous inference:** Two detected folders could share the same last segment (e.g. `apps/web` and `packages/web`); we pick one (e.g. exact name match or first). The inferred path might not be what the user intended.
- **No inference:** If there's no existing project.json and no detected folder name match, we fall back to `directory` (e.g. `"."`). We then write project.json at repo root; multiple such projects would all write to root and overwrite each other unless we improve this later.
- **Not an error:** A project with `rootDirectory: "."` that actually lives in a subfolder is a valid, existing use case. We must not treat it as invalid; we infer `workPath` when we can and document that inference is best-effort.
- **Backwards compat:** Old repo.json files have no `workPath`; we use `directory` when `workPath` is missing. New writes always set both.
