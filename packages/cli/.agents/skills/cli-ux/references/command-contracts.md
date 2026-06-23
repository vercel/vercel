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

1. Explicit team: `--scope`/`--team` always wins over local, repository, or global state.
2. Authoritative existing link: an exact environment, `.vercel/project.json`, or unambiguous `.vercel/repo.json` owner-project pair may be reused.
3. Interactive team: when no explicit team exists, TTY asks `Which team?` before project discovery and shows team name, slug, current marker, and SSO lock state.
4. Non-interactive team: accept only an explicit scope or a `currentTeam` proven to come from `vc switch`; login defaults are not intent.
5. Intended project: explicit `--project`, an exact Git repository/root match inside the resolved team, or an interactive existing-project choice. Folder-name matches are never non-interactive evidence.
6. Interactive creation: only an explicit `Create new project` choice enters project settings and creation. Non-interactive creation uses `vc project add <name> --scope <team>` before `vc link`.
7. Mutations: write the resolved link, update `.gitignore`, optionally connect Git for an explicitly created project, then refresh `VERCEL_OIDC_TOKEN` in `.env.local`.

Rules:

- Before mutation, know whether linking existing project or creating a new one.
- Ask `Which team?` before project discovery in TTY mode. An explicit `--scope` skips this prompt and restricts all lookup to that team.
- Team choices show both display name and slug, identify the current team, and mark teams that require SSO.
- The `Which team?` picker supports substring search by team name and slug.
- Non-TTY and `--non-interactive` never prompt, search across teams, infer a team from login defaults, select by folder name, or create a project.
- `--yes` accepts defaults only after team/project identity is resolved. It cannot supply team or project intent and cannot enable project creation.
- In non-interactive mode, `vc link --scope <team> --project <project>` is sufficient; `--yes` is unnecessary but may remain as a redundant compatibility flag.
- A successful prior local/repository link may be reused without flags. A team saved by `vc switch` may scope an explicit project or exact Git repository/root match.
- Missing or ambiguous evidence returns structured `action_required` output with commands for `teams list`, `project list`, `project add`, and an explicit `link` retry.
- Resolve and validate the replacement target before overwriting an existing local link.
- Running `vc link` is setup intent; do not ask a vague setup-intent prompt.
- Do not ask `Link to existing project?` when no concrete project is shown. Ask `Project?` with `Create new project` and `Link existing project` choices instead.
- Do not create a project from a user-supplied `--project` value that was not found.
- Project discovery after team selection is restricted to that team.
- Existing-project matches show `Directory` once as setup state, then `Found existing project` as a status heading and aligned `Project` before confirmation. If no setup-state `Directory` row exists, include `Directory` in the found-project block instead.
- Repository matches show `Found existing project`, then aligned `Project` and `Source` rows before confirmation.
- Ask for the link action after preview rows: `Link directory to project?` or `Link repository to project?`. Do not ask `Link to this project?` after the values are already visible.
- Use `requires SSO` / `teams that require SSO`; do not use `SSO-protected` in new human copy.
- User-facing copy uses `team`; command examples use the preferred `--scope` flag.
- Use `Which team?`, `Name?`, `Customize settings?`, and `Loading teams…`.
- Ask `Code directory?` only for real root ambiguity.
- Compress framework detection: `Detected Next.js` for defaults; include parenthesized build/output details only when non-default, non-obvious, or needed for the next decision.
- Print aligned result rows with `printAlignedLabel()`: `Linked`, `Created`, `Added`, and optional follow-up state.
- Link/setup primary completed-phase rows use `✓`: `✓ Linked`, `✓ Created`, `✓ Added`. Discovery, preview, progress, and secondary rows such as `Found existing project`, `Detected`, `Project`, `Directory`, `Config`, `Settings`, and `Source` keep the blank two-space gutter. Never use `▲` for setup/link rows.
- Default human success output prints the user-facing completion receipt, such as `✓ Linked acme/web` or `✓ Created acme/web`.
- Do not print `.vercel/project.json`, `.vercel/repo.json`, or a repeated `Directory` row in default human success output when the local target was already shown. Verify link files in tests and expose them through machine/debug/help surfaces when needed.
- After every successful direct `vc link`, fetch a fresh `VERCEL_OIDC_TOKEN`. Replace the existing token assignment or append exactly one assignment when absent. Remove stale token assignments when the pull returns no token. Preserve every other `.env.local` entry and do not copy other remote Environment Variables into the file. A token refresh failure warns without changing the successful link exit code.

Compatibility notes:

- `--team` remains accepted; new examples and remediation commands use `--scope`.
- `--yes` remains accepted with a fully resolved target but has no target-selection authority.
- Non-interactive reason codes remain `missing_scope`, `missing_project`, `ambiguous_project`, and `project_not_found` for compatibility.

Link prompt map:

| State                        | Human prompt/output                                                                                        | Non-interactive                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Team not explicit            | `Which team?` before project discovery                                                                     | explicit scope, trusted `vc switch`, or `missing_scope`      |
| Exact explicit project       | link inside the selected team                                                                              | link; no `--yes` required                                    |
| One existing project match   | `Directory`, `Found existing project`, aligned `Project`, then `Link directory to project?`                | link only for authoritative local/repo or exact Git evidence |
| One repository project match | `Directory`, `Found existing project`, aligned `Project`/`Source`, then `Link repository to project?`      | link only inside the resolved team                           |
| Multiple project matches     | `Which project?` inside the selected team                                                                  | `action_required: ambiguous_project`                         |
| No project match             | `Project?` with `Create new project` / `Link existing project`, then `Name?` only after create is selected | `action_required: missing_project`                           |
| Explicit project missing     | `project_not_found` with list/create/retry commands                                                        | same structured error                                        |
| Root choices exist           | `Code directory?` after explicit create choice                                                             | create separately with explicit command                      |
| Settings differ              | `Customize settings?` after explicit create choice                                                         | create separately with explicit command                      |
| OIDC token refresh           | Refresh exactly one `VERCEL_OIDC_TOKEN` assignment after a successful direct link                          | refresh after a successful deterministic link                |
| Existing valid link          | explicit interactive relink flow                                                                           | reuse and refresh OIDC                                       |

Link acceptance matrix:

- already linked no-op / relink behavior
- stale/deleted project link
- one team and many teams, with the team prompt first
- explicit `--scope` precedence and deprecated `--team` compatibility
- trusted `vc switch` team versus login-inferred `currentTeam`
- explicit valid and missing `--project`
- exact repo-root matches inside one resolved team
- folder-name and cross-team matches rejected as non-interactive evidence
- no match plus explicit interactive create choice
- monorepo/root-directory selection
- non-TTY and `--non-interactive`
- JSON-only stdout
- `--yes` alone never selects or creates a project
- existing `.env.local` content remains unchanged except for `VERCEL_OIDC_TOKEN`
- missing, existing, exported, and duplicate `VERCEL_OIDC_TOKEN` assignments
- LF and CRLF `.env.local` files, including files without a final newline
- OIDC refresh failure after a successful link
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
