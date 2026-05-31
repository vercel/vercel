# Command-Specific CLI UX Contracts

Command-specific contracts for Vercel CLI flows whose state machines need more than the reusable rules in `core.md`.

Add a command-specific contract only when generic rules are not enough. Keep reusable rules in `core.md`; keep command-only state machines, prompt maps, payload shapes, and acceptance matrices here.

Contract template:

1. Resolution order: how the command determines target, mode, config, and mutation.
2. Rules: command-only UX, safety, compatibility, and output requirements.
3. Prompt map: TTY prompt for each unresolved state plus non-interactive behavior.
4. Acceptance matrix: states that must be tested or manually verified.
5. Stale-string sweep: command-only legacy copy/output to classify.

When adding a durable contract, add a row to `SKILL.md` so agents load it only for that command family.

## Link Flow Contract

`vc link` target resolution order:

1. Local link state: already linked, stale link, repo link, env link.
2. Intended team: explicit `--team`/`--scope`, current config, one safe choice, otherwise ask or fail.
3. Intended project: explicit `--project`, repo-root match, exact folder-name match, selected existing project, or new project.
4. Project root: inferred root, selected root, or cwd.
5. Settings: detected framework/settings, explicit overrides, or defaults.
6. Mutations: create project if needed, write `.vercel/project.json`, update `.gitignore`, optional Git connection, optional env pull.

Rules:

- Before mutation, know whether linking existing project or creating a new one.
- Running `vc link` is setup intent; do not ask a vague setup-intent prompt.
- Do not ask `Link to existing project?` when no concrete project is shown.
- Do not create a project from a user-supplied `--project` value that was not found.
- Folder-name matches across teams are lower confidence than repo-root or explicit matches.
- Cross-team matches need visible team context before linking.
- `--scope` may remain compatibility input; user-facing copy uses `team`.
- Use `Which team?`, `Name?`, `Customize settings?`, and `Loading teams…`.
- Ask `Code directory?` only for real root ambiguity.
- Compress framework detection: `Detected Next.js (Build Command: next build, Output Directory: .next)`.
- Print aligned result rows with `printAlignedLabel()`: `Linked`, `Added`, and optional follow-up state.
- Link/setup rows keep the blank two-space gutter. Do not use `▲` or `✓` for `Linked`, `Project`, `Directory`, `Settings`, or `Source`.
- Offer `Pull environment variables now?` after linking when TTY and safe.

Current gaps to migrate incrementally:

- `vc link` currently may overwrite existing local link. Preserve current behavior unless explicitly migrating relink/no-op semantics with tests.
- Some non-interactive payloads still emit `missing_scope`. Keep compatibility tests while migrating messages/reason codes toward `missing_team`.
- Full `schemaVersion`/`cwd`/`mode`/`resolved`/`candidates`/`sideEffects` payloads are target state for rewritten link payload paths.
- Explicit missing `--project` should fail with `project_not_found`.
- Multiple cross-team matches in non-interactive mode should become `ambiguous_project`.

Link prompt map:

| State                             | Human prompt                                                     | Non-interactive                        |
| --------------------------------- | ---------------------------------------------------------------- | -------------------------------------- |
| Multiple teams                    | `Which team?`                                                    | `action_required: missing_team`        |
| One high-confidence project match | `Found project`, aligned `Project`, then `Link to this project?` | link only for explicit/repo-root match |
| Multiple project matches          | `Which project?`                                                 | `action_required: ambiguous_project`   |
| No project match                  | `Project?` with create/link options, then `Name?`                | require `--yes` or `project_not_found` |
| Root choices exist                | `Code directory?`                                                | require root flag/config/payload       |
| Settings differ                   | `Customize settings?`                                            | require flags/config/payload           |
| Optional env pull                 | `Pull environment variables now?`                                | skip unless explicitly requested       |
| Stale/deleted link                | show stale link, then concrete relink choice                     | `action_required: stale_link`          |

Link acceptance matrix:

- already linked no-op / relink behavior
- stale/deleted project link
- one team and many teams
- explicit `--team`
- explicit valid and missing `--project`
- repo-root and folder-name matches
- multiple project matches across teams
- no match plus create project
- monorepo/root-directory selection
- non-TTY and `--non-interactive`
- JSON-only stdout
- `--yes` default path creates no duplicate resources on retry

## Deploy Flow Contract

`vc` and `vc deploy` are the same deployment flow. Bare `vc` defaults to deploy when no explicit command or path-disambiguated command is present.

Deploy resolution order:

1. Invocation: `vc`, `vc <path>`, `vc deploy`, `deploy init`, or `deploy continue`.
2. Project path: explicit path, cwd, or validated deploy path.
3. Local config: `vercel.json`, project link, root directory, framework, services, env/build env, regions, archive/prebuilt mode.
4. Intended team/project: existing link, explicit `--team`/`--project`, or setup/link flow.
5. Target: `--prod`, `--target`, default preview, `--skip-domain`.
6. Upload/build plan: files, cache/force, public source, logs, `--no-wait`, checks.
7. Result: `Inspect`, `Preview` or `Production`, optional `Aliased`, final status.

Rules:

- Validate local path/config/target before first remote mutation.
- If project is not linked, setup/link, then continue deployment.
- Running `vc` is deployment intent; do not ask `Set up and deploy "<path>"?`.
- Do not upload until team, project, root, target, and project settings are resolved.
- `vc <path>` and `vc deploy <path>` should produce equivalent output after routing.
- `--prod` prints `▲ Production`; preview prints `Preview` without `▲`.
- Production custom-domain alias assignment prints `▲ Aliased` only when assigned.
- `Inspect` prints before deployment URL rows.
- Print aligned result rows with `printAlignedLabel()`: `Inspect`, `Preview`, `Production`, `Aliased`.
- Preview rows keep the blank two-space gutter. `Production` and production `Aliased` rows use the `▲` gutter.
- End completed deploy flows with `✓ Ready in 47s`.
- `--no-wait` may print URLs and still-processing note; no `✓ Ready` unless already `READY`.
- Build/log failures prefer inspect/log commands over blind retry.
- Retry suggestions after upload/build failure must not risk duplicate deployments unless rerun semantics are intentional.
- `deploy init` / `deploy continue` preserve shared URL row, JSON, and ready-status contracts where they share output.

Deploy output map:

| State                        | Human output                                    | Non-interactive / JSON                       |
| ---------------------------- | ----------------------------------------------- | -------------------------------------------- |
| Linked project               | deploy without setup prompts                    | deploy using resolved link                   |
| Unlinked project             | setup/link prompts, then deploy                 | action/error payload with exact next command |
| Path/config invalid          | validation error before remote calls            | JSON error when path owns contract           |
| Preview deployment           | `Inspect`, `Preview`, `✓ Ready` when ready      | deployment object + inspect/promote next     |
| Production deployment        | `Inspect`, `▲ Production`, optional `▲ Aliased` | deployment object + inspect next             |
| `--no-wait` still building   | URLs plus still-processing note                 | no ready claim                               |
| Build/check failure          | short failure plus inspect/log command          | deployment context + inspect/log next        |
| Rate limit/timeout/interrupt | say whether work may still be running           | inspect/status before retry when possible    |

Deploy acceptance matrix:

- bare `vc` and `vc deploy` route equivalence
- explicit deploy path
- linked project deploy without setup prompts
- unlinked project setup/link/create, then deploy
- preview and production URL rows
- production alias row only when assigned
- `--no-wait` still-building output with no ready claim
- build/check failure with inspect/log next step
- invalid local config/path before remote mutation
- non-interactive missing setup input
- JSON-only stdout
- retry guidance after timeout/upload/build failure
- `deploy init` / `deploy continue` shared output contracts

Link/deploy stale-string sweep:

```bash
rg -n "Which scope|Loading scopes|What's your project's name|Want to modify|Customize defaults|Set up and deploy .+\\?|Inspect:|Production:|Preview:|Linked to|\\[[0-9]+s\\]|🔗|🔍|🚀|⏳|⋮⋮|✅" <paths>
rg -n "In which directory is your code located|Do you want to change additional project settings|Would you like to pull environment variables now" <paths>
```
