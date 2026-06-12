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
- Do not ask `Link to existing project?` when no concrete project is shown. Ask `Project?` with `Create new project` and `Link existing project` choices instead.
- Do not create a project from a user-supplied `--project` value that was not found.
- Folder-name matches across teams are lower confidence than repo-root or explicit matches.
- Cross-team matches need visible team/search context before linking.
- Print searched-team scope only when search scope affects interpretation, such as multiple teams or manual SSO fallback. Keep it dim and compact: `Searched 13 teams`, not a wrapped list of team slugs. Do not add it to a one-team happy path.
- Existing-project matches show `Directory` once as setup state, then `Found existing project` as a status heading and aligned `Project` before confirmation. If no setup-state `Directory` row exists, include `Directory` in the found-project block instead.
- Repository matches show `Found existing project`, then aligned `Project` and `Source` rows before confirmation.
- Ask for the link action after preview rows: `Link directory to project?` or `Link repository to project?`. Do not ask `Link to this project?` after the values are already visible.
- When without-SSO team search finds no match, show `Searched {count} teams available without SSO`, then `No matching projects found`, then ask `Select teams that require SSO`.
- Use a manual team multiselect for the SSO fallback because each selected team may require the user to log in through SSO.
- Keep checkbox instructions inline, dim, and unwrapped: `<space> select, <enter> confirm, <a> toggle all, <i> invert`.
- Use `requires SSO` / `teams that require SSO`; do not use `SSO-protected` in new human copy.
- `--scope` may remain compatibility input; user-facing copy uses `team`.
- Use `Which team?`, `Name?`, `Customize settings?`, and `Loading teams…`.
- Ask `Code directory?` only for real root ambiguity.
- Compress framework detection: `Detected Next.js` for defaults; include parenthesized build/output details only when non-default, non-obvious, or needed for the next decision.
- Print aligned result rows with `printAlignedLabel()`: `Linked`, `Created`, `Added`, and optional follow-up state.
- Link/setup primary completed-phase rows use `✓`: `✓ Linked`, `✓ Created`, `✓ Added`. Discovery, preview, progress, and secondary rows such as `Found existing project`, `Detected`, `Project`, `Directory`, `Config`, `Settings`, and `Source` keep the blank two-space gutter. Never use `▲` for setup/link rows.
- Default human success output prints the user-facing completion receipt, such as `✓ Linked acme/web` or `✓ Created acme/web`.
- Do not print `.vercel/project.json`, `.vercel/repo.json`, or a repeated `Directory` row in default human success output when the local target was already shown. Verify link files in tests and expose them through machine/debug/help surfaces when needed.
- Offer `Pull development environment variables into .env.local?` after linking when TTY and safe.

Current gaps to migrate incrementally:

- `vc link` currently may overwrite existing local link. Preserve current behavior unless explicitly migrating relink/no-op semantics with tests.
- Some non-interactive payloads still emit `missing_scope`. Keep compatibility tests while migrating messages/reason codes toward `missing_team`.
- Full `schemaVersion`/`cwd`/`mode`/`resolved`/`candidates`/`sideEffects` payloads are target state for rewritten link payload paths.
- Explicit missing `--project` should fail with `project_not_found`.
- Multiple cross-team matches in non-interactive mode should become `ambiguous_project`.

Link prompt map:

| State                              | Human prompt/output                                                                                                                | Non-interactive                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Multiple teams                     | `Which team?`                                                                                                                      | `action_required: missing_team`        |
| One existing project match         | `Directory`, `Found existing project`, aligned `Project`, then `Link directory to project?`                                        | link only for explicit/repo-root match |
| One repository project match       | `Directory`, optional search-status rows, `Found existing project`, aligned `Project`/`Source`, then `Link repository to project?` | link only for explicit/repo-root match |
| Multiple project matches           | aligned `Projects` summary, then `Project?`                                                                                        | `action_required: ambiguous_project`   |
| No without-SSO match, SSO required | `Searched {count} teams available without SSO`, `No matching projects found`, then `Select teams that require SSO`                 | skip unless explicitly requested       |
| No project match                   | `Project?` with `Create new project` / `Link existing project`, then `Name?` when creating                                         | require `--yes` or `project_not_found` |
| Root choices exist                 | `Code directory?`                                                                                                                  | require root flag/config/payload       |
| Settings differ                    | `Customize settings?`                                                                                                              | require flags/config/payload           |
| Optional env pull                  | `Pull development environment variables into .env.local?`                                                                          | skip unless explicitly requested       |
| Stale/deleted link                 | show stale link, then concrete relink choice                                                                                       | `action_required: stale_link`          |

Link acceptance matrix:

- already linked no-op / relink behavior
- stale/deleted project link
- one team and many teams
- explicit `--team`
- explicit valid and missing `--project`
- repo-root and folder-name matches
- multiple project matches across teams
- no match in teams available without SSO, then manual selection/search for teams that require SSO
- no match plus create project
- monorepo/root-directory selection
- non-TTY and `--non-interactive`
- JSON-only stdout
- `--yes` default path creates no duplicate resources on retry
- primary completed-phase gutter: `✓ Linked`, `✓ Created`, or `✓ Added`; no `▲` on setup/link rows

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
rg -n "Link to existing project\\?|Link to different existing project\\?|Link to this project\\?|Found project .*Link to it\\?|Which SSO-protected teams should be searched\\?|Which SSO-required teams should be searched\\?|SSO-protected|SSO-required|available in your current session|Press <space> to select|to proceed|Select teams to search|Select teams that require SSO to search|Link File|Config\\s+\\.vercel/(project|repo)\\.json" <paths>
```

## Env Add Flow Contract

`vc env add` target resolution order:

1. Variable name: positional `name`, otherwise `Name?`.
2. Variable-key safety: public-prefix warnings, rename/keep/re-enter choice.
3. Project: existing `.vercel/project.json` link; fail with link next command when missing.
4. Existing targets: current Environment Variables plus custom Environments.
5. Sensitivity: explicit `--sensitive`/`--no-sensitive`, Development restrictions, team sensitive-variable policy, otherwise `Store as sensitive?`.
6. Value: stdin, `--value`, or `Value?`. Mask sensitive values; leave non-sensitive typed values visible; never repeat the value after entry.
7. Environment targets: positional target or `Environments?` multiselect.
8. Preview branch: optional third arg, or `Git branch?` when adding only to Preview.
9. Mutation: save variable, optional force overwrite.
10. Result: aligned receipt rows with variable, project, environments, branch, and type.

Rules:

- Do not print a default preview block before sensitivity, value, or environment questions. The variable name is already visible in argv or the `Name?` answer.
- Show linked `Project` context only when it changes the next decision or prevents real ambiguity. Prefer no preview over a block that repeats already-known values.
- Never repeat the Environment Variable value after entry in human output, JSON, debug logs, telemetry, warnings, errors, or suggested commands. Sensitive values must not be visible at all.
- Do not include actual `--value` contents in agent `next` commands. Use quoted `"<value>"` placeholders in shell commands, even if the user provided a value.
- Use masked input for sensitive interactive `Value?` prompts. Use visible text input for non-sensitive `Value?` prompts so users can catch typos before saving.
- Use `Name?`, `Store as sensitive?`, `Value?`, `Environments?`, and `Git branch?`.
- Use `Variable name?` for public-prefix warning choices; use `Value?` for value-warning choices.
- Public-prefix and value warnings use the warning gutter: `! The NEXT_PUBLIC_ prefix will make API_KEY visible to anyone visiting your site`. Do not use `WARNING!` as a column-0 label.
- Keep the sensitive-value explanation as dim inline context on the prompt: `Store as sensitive? Sensitive values cannot be read later`. Do not wrap the hint in parentheses, add trailing punctuation, or print it as a separate row above the prompt.
- Use checkbox instructions for `Environments?`: `<space> select, <enter> confirm, <a> toggle all, <i> invert` on the prompt line when it fits, with no parentheses.
- Do not offer Development when the value is sensitive. Do not offer Production/Preview for non-sensitive values when the team policy requires sensitive values there.
- If the user declines sensitivity under a team policy, state the resulting constraint before environment selection.
- Result rows use `✓` for the primary `Added` or `Overrode` receipt. `Project`, `Environments`, optional `Branch`, and `Type` keep the blank gutter.
- Omit timestamps from default success output unless the command family has a support/debug reason to show one.
- Keep `--force` semantics as overwrite/upsert, not generic confirmation bypass.
- Keep non-interactive output stdout-clean JSON/action payloads. Human preview/result rows stay on stderr.

Env add prompt map:

| State                        | Human prompt/output                                                                      | Non-interactive                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Missing variable name        | `Name?`                                                                                  | `action_required: missing_requirements`              |
| Public-prefix risky name     | warning, then `Variable name?` with keep/rename/re-enter choices                         | `action_required: env_key_sensitive` when applicable |
| Linked project resolved      | no default preview; optional compact `Project` context only when ambiguous               | use linked project or `error: not_linked`            |
| Missing sensitivity decision | `Store as sensitive?` with dim inline sensitive-value explanation                        | infer from flags/policy/defaults                     |
| Missing value                | `Value?`; masked when sensitive, visible when non-sensitive                              | require stdin or `--value`                           |
| Value warning                | warning, then `Value?` with keep/re-enter/trim choices                                   | warning only, no post-prompt value echo              |
| Missing environment target   | `Environments?` checkbox                                                                 | `action_required: missing_environment`               |
| Preview branch unresolved    | `Git branch?` with empty meaning all Preview branches                                    | omit branch for all Preview branches                 |
| Save succeeds                | aligned `✓ Added`/`✓ Overrode`, `Project`, `Environments`, optional `Branch`, and `Type` | exit 0, no post-prompt value echo                    |

Env add acceptance matrix:

- name passed and prompted
- project linked and not linked
- `--value`, stdin, and interactive value input
- sensitive masked input and non-sensitive visible input
- Development-only target
- Production/Preview target
- mixed target selection
- custom Environment target
- Preview with a branch and all Preview branches
- team sensitive-variable policy on/off
- public-prefix name warnings with keep, rename, and re-enter
- value warnings with keep, re-enter, and trim
- `--force` overwrite receipt
- `--yes`, `--sensitive`, and `--no-sensitive`
- non-interactive missing name/value/environment
- non-interactive next commands preserve safe globals and never include actual secret values
- primary completed-phase gutter: `✓ Added` or `✓ Overrode`; secondary rows keep the blank gutter

Env add stale-string sweep:

```bash
rg -n "What's the name of the variable\\?|What's the value of|Is the value a sensitive secret\\?|How to proceed\\?|Add .* to which Environments \\(select multiple\\)\\?|Added Environment Variable|Overrode Environment Variable|✅|successfully" <paths>
```
