# Command Contracts

Target flows for commands whose behavior is too specific for [guidelines.md](guidelines.md), which still applies in full. `snake_case` names are JSON `reason` codes for errors and warnings ([JSON errors](guidelines.md#json-errors)); `action_required` is a `status`. Source paths are relative to `packages/cli`.

- [Link](#link)
- [Deploy](#deploy)
- [Environment Variables](#environment-variables)
- [Login](#login)
- [Logs](#logs)

## Link

`vercel link` associates a directory with a project. Setup callers (`deploy`, `pull`, `dev`, `git connect`) use the same flow through `src/util/link/ensure-link.ts`. Commands that only require a project never enter this flow.

Resolve in this order before any local or remote effect: existing link or environment pin, team, project, root directory, settings.

### Team

- Follows [team selection](guidelines.md#context-and-authentication). With one team, the project choices omit "Choose a different team".
- Prompts and hints call SSO-protected teams "teams that require SSO".

### Project

- An explicit project name or ID resolves exactly within the team. If it doesn't exist, fail. NEVER create a similarly named project. The one exception is a directory deploy's missing `--project` name, in a terminal or with `--create-if-missing` ([Deploy](#deploy)).
- Otherwise suggest, in order: projects connected to this Git repository at the deepest matching root directory, then exact folder-name matches, then search and create.
- Choices: verified matches, `Search all projects`, `Create a new project`, `Choose a different team`. Search results are followed by a separator and `Back to project options`. When nothing matches, `Back to project options` is the only choice. Back keeps the chosen team.
- Choosers support case-insensitive search. Load up to 100 projects; beyond that, search on the server (20 results per query) and discard stale results.
- `Project name?` for a new project defaults to a creatable name (the folder slug, with a short suffix if taken). Up arrow returns to project options.
- Escape [cancels](guidelines.md#classes) before any mutation.

### Environment pin

With `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` both set, resolve exactly that pair with no prompts, and follow the [environment pin](guidelines.md#environment-variables-and-precedence) rules. It prints the [pinned context](guidelines.md#context-and-authentication) rows, never `✓ Linked` (`outcome: "unchanged"`).

### Presentation

Use the shared [typography](guidelines.md#typography-and-hierarchy), [layout](guidelines.md#layout-primitives), and [semantic color roles](guidelines.md#color-and-glyphs).

- Never ask vague setup intent or `Link to existing project?`. Ask only what's needed: `Which team?`, `Which project?`, `Project name?`, `Customize settings?`. An ambiguous root asks `Root directory?`.
- Show non-default settings only. Detection can be one line (`Detected Next.js`) without restating framework defaults.
- An inferred link shows a `Found existing project` heading and aligned facts, then asks `Link directory to project?`. `Directory` appears once.
- Receipt: `✓ Linked` with the full `team/project`, plus a `Created` row when a new project was made. No `▲`, no rows about `.vercel/` files.
- After linking interactively, MAY offer to pull Development environment variables.

```
$ vercel link
  Found existing project
  Project         acme/acme-web
  Directory       ~/code/acme-web
? Link directory to project? (Y/n) y

✓ Linked          acme/acme-web
```

- Failures: missing project `project_not_found`; stale link (the linked project no longer exists) `stale_link`; no project chosen in non-interactive mode `missing_project`.
- A relink to a different project is `outcome: "linked"` with `previousProjectId`; an existing link to the same project is `outcome: "unchanged"`.
- `--json` returns `{ "link": { "teamId", "projectId", "projectName", "directory" }, "outcome": "linked" | "unchanged", "projectCreated": true | false, "previousProjectId": <id> | null }`. `projectCreated` says whether a new project was made.

**Verify:** one, many, and SSO teams; explicit good and missing project; Git and root versus folder suggestions; large and stale search; back, Up, Escape; environment pin; stale link and relink; nothing mutated on missing input; receipt matches the saved link. Code: `src/util/link/`, `src/util/input/`, `test/unit/commands/link/`.

## Deploy

Bare `vercel`, `vercel <path>`, and `vercel deploy [path]` are the same operation. Resolve path, config, link, root directory, framework, team, project, environment, and build options, then upload.

### Flow

- An unlinked directory goes through the [link flow](#link).
- `--project <PROJECT>` chooses the project for this deploy only and never writes a `.vercel/` link. An existing project is used as is. A missing name is created with exactly that name, in the team the link flow selects ([team selection](guidelines.md#context-and-authentication); otherwise `missing_scope`), after the usual setup questions, and the receipt is `✓ Created team/project`. It is never connected to the Git repository, since every push would then deploy it; `vercel git connect` does that on request.
- Creating a missing name needs a terminal without `--yes`, where the setup questions come first, or `--create-if-missing`. With `--yes`, in CI, or for an agent, a typo would otherwise create a project and report success, so without the option the deploy fails with `project_not_found`: the error suggests one in-team name a single edit away (`Did you mean my-app?`, JSON `data.suggestion`, never in `next`) and offers the command as typed with `--create-if-missing` added as the first `next` step, so the retry is the same deploy (path, `--yes`, `--prebuilt`, and every other option). Options use their canonical long names (`-ye` becomes `--yes --env`, `--confirm` becomes `--yes`), and deprecated options that no longer change the deploy are dropped. Tokens are removed, and Environment Variable values become placeholders (`-e KEY=VALUE` becomes `--env 'KEY=<VALUE>'`), since a bare `KEY` would read a possibly different value from the shell. The placeholders are labeled (`To create it, replace each <VALUE> with the Environment Variable's value:`, and the same note in the JSON `when`), and deploy rejects an unfilled `KEY=<VALUE>` as a usage error (`invalid_arguments`) before anything is created.
- A missing project ID still fails with `project_not_found`. A missing name that would be created while `VERCEL_PROJECT_ID` is set is a [usage error](guidelines.md#environment-variables-and-precedence) (`Can't use --project with VERCEL_PROJECT_ID.`, `invalid_arguments`), since a new project can't be the pinned one. `--dry` creates nothing, and single-file deploys keep the [Project](#project) rule. `--create-if-missing` without `--project`, or with `--dry`, is a usage error; with a single file it is `invalid_file_deployment_option`.
- Environment: Preview by default; `--prod` for Production; `--environment <ENVIRONMENT>` for any standard or custom environment.
- Anonymous deploys (no credentials, eligible project) ask `Deploy temporarily without logging in?` on first use. `--yes` or a valid `.vercel/anonymous.json` counts as consent. Non-interactive without consent fails with `confirmation_required`. CI requires credentials. This behavior belongs to deploy alone.
- `vercel <file>` uploads only that regular file, under its own name, with static settings for that deployment. Link from the file's parent directory, ignore local build config and the project's framework, root directory, and build settings, and suggest the filename without its extension for a new project. `--dry` shows the same one-file manifest. Logged-out `--temporary` accepts only an `.html` file. `--prebuilt`, `--archive`, `--local-config`, `--create-if-missing`, and manual init/continue require a directory.
- The deployed file is public. Reject files that `.vercelignore` or the default ignore list excludes, checked from the file's directory and from the current directory when it contains the file. Hidden files need `--yes` or a TTY confirmation; non-interactive without `--yes` fails with `confirmation_required`. `--dry` skips the prompt.

### Output

Human output follows the shared [typography](guidelines.md#typography-and-hierarchy) and [semantic roles](guidelines.md#color-and-glyphs), and goes to stderr. During work, show a known deployment URL and `Inspect` URL early when they help someone follow it, with an explicit pending status. The final summary leads with the terminal status (`✓ Ready in 41s`), then the primary destination labeled `Preview` or `Production`, then supporting identity and inspection details. Show a production alias as the primary destination only after the API confirms its assignment; otherwise keep the deployment URL and say the alias is pending. The JSON `outcome` stays `deployed`.

```
$ vercel deploy --prod
  Building…
  Deployment      https://acme-web-4f2k9x1-acme.vercel.app
  Inspect         https://vercel.com/acme/acme-web/9x1Kq2

✓ Ready in 41s
▲ Production      https://example.com
  Deployment      https://acme-web-4f2k9x1-acme.vercel.app
  Deployment ID   dpl_9x1Kq2
```

The `Building…` phase labels the early URL as pending. A moving production alias does not identify this deployment permanently: keep the deployment URL (the stdout identifier) and Deployment ID beside it. The final block MAY repeat `Inspect` when logs have pushed the early link out of view. Do not repeat the same URL under both `Production` and `Aliased`. The primary result still uses the [width fallback](guidelines.md#width-and-platform) on narrow terminals.

- The stdout identifier is the deployment URL ([Streams](guidelines.md#streams)).
- While building, a TTY shows a `Building…` spinner that is cleared before the result rows; non-TTY output prints `Building…` once.
- `--no-wait` returns once the deployment is created. It prints the URLs, the Deployment ID, and the status command with that ID (`vercel deployments inspect dpl_9x1Kq2 --wait`), never `✓ Ready`.
- `--json` returns `{ "deployment": { … }, "outcome": "deployed" | "accepted" }` with the API's deployment fields, including `readyState`. `accepted` means `--no-wait`.
- A failed build or check exits `1` (with `--json`, the error's `data.deployment` carries the deployment) with the Deployment ID and a recovery command that prints its build logs (`vercel deployments inspect dpl_9x1Kq2 --logs`). A timeout says the build may still be running and shows how to check it.
- `--verify` loads the URL people open (the production alias, otherwise the deployment URL) once the deployment is ready, and prints an aligned supporting `Verified` row after `✓ Ready`, without a second completion glyph. The row contains the HTTP status, size, and title; include the checked URL when it differs from the primary destination, so a check of the deployment URL never implies the Production alias was checked. With `--verify`, wait for verification before printing the final summary. If verification fails after the deployment becomes ready, lead with the verification error, report the ready deployment and its URL as supporting facts without a success glyph, and exit `1`; never leave `✓ Ready` as the primary result of that failed invocation. State whether the API confirmed the Production alias assignment to this deployment; a failed check does not imply that traffic was rolled back or unchanged. In the target JSON error contract, `reason` is `verification_failed` and `data` carries both `deployment` and `verification`; stdout remains empty. On a protected project, verification may use an already configured Protection Bypass for Automation credential; `--verify` never creates or rotates one, even with `--yes`. If protection prevents verification and no authorized bypass is available, report `verification_failed` with `status: "error"` and `userActionRequired: true`, preserve the deployment's known state, and direct the user to configure the credential explicitly in the project's Deployment Protection settings. Never suggest repeating the deployment to configure access. The secret only goes to the deployment's own origin: redirects are followed by hand (at most 5), and one that leaves the origin is followed without it. `--json` adds `verification: { "url", "ok", "statusCode", "size", "title", "error" }`. A non-2xx response or failed request exits `1` (`verification_failed`) and suggests `vercel curl <URL>`; a pass drops the `vercel curl` next step. With `--no-wait` or `--dry` it's a usage error. It's `--verify`, not `--check`, so it isn't confused with Deployment Checks.

**Current gaps (not implemented by this contract):** `printDeploymentStatus()` already receives a completed verification result, but prints `✓ Ready` before a verification failure and adds a second tick on success. Its verification helper still calls `getOrCreateDeploymentProtectionToken()`, which can create a durable bypass credential; migrate that to read-only credential resolution separately with protection/redirect regression coverage. Its `--no-wait` path can print Ready when the API already reports READY, contrary to the accepted-only target above. Deploy's JSON failure paths still use the existing stdout/envelope behavior; the error contract requires a dedicated migration. `Output.print()` still routes no-color writes through `removeEmoji()`, which trims leading whitespace, and `Output.spinner()` checks only TTY state rather than plain or accessible presentation; fix those centrally rather than in deploy alone.

### Next steps

- Suggest `vercel git connect`, benefit first (`Deploy automatically on every push:`), only after a verified deployment from a local Git repository whose project has no Git connection (verified, not assumed).
- Suppress Git advice when the state is unknown, mismatched, or already connected; for unsupported providers; for anonymous deploys; and in non-interactive mode when the remote is ambiguous. A failed lookup never fails the deployment.
- Suggestions keep the path argument along with the context in [Examples and suggestions](guidelines.md#examples-and-suggestions).

**Verify:** equivalence of bare, path, and `deploy`; linked, unlinked, anonymous, and CI paths; existing and missing `--project` (name versus ID, terminal versus `--yes` and agent, with and without `--create-if-missing`, suggestion and create command, `--dry`, no `.vercel/` written); single-file uploads, ignored and hidden files; Preview, Production, and alias rows; READY versus accepted versus failed; URL on stdout versus `--json`; guidance eligibility, opt-out, and lookup failure. Code: `src/commands/deploy/`, `src/util/deploy/`, `test/unit/commands/deploy/`.

## Environment Variables

### Add and update

```
vercel env add [name] [--environment <ENVIRONMENT>]... [--git-branch <BRANCH>] [--type <TYPE>] [--value <VALUE> | --value -] [--force] [--yes]
```

Order:

1. Reject conflicting options.
2. Resolve the name, project, and team policy.
3. Validate supplied environments; prompt for missing environments, then the Preview branch.
4. Resolve the type (it depends on the environments), then the value (masking depends on the type).
5. Save and report.

Don't repeat a preview block before every question.

- **Type.** Human copy says `Config` or `Secret`; the API and JSON field stays `visibility`. `--type <TYPE>` (`config` or `secret`) is canonical. `--visibility`, `--sensitive`, and `--no-sensitive` are hidden deprecated aliases that warn once; a conflicting combination is a usage error before any prompt or request.
- **Classification.** A record is Secret if `visibility === 'secret'` or its legacy `type === 'sensitive'`. Every env command uses the same predicate.
- **Default type.** An explicit type wins. Otherwise, if the only environment is Development, the default is Config; any other set defaults to Secret (the `isDevelopmentOnlyTarget` check in `src/commands/env/add.ts`). A Development Secret is valid when explicit. Never offer Production or Preview Config when team policy forbids it; explain the policy before environment selection.
- **Value** comes from `--value`, `--value -` (stdin), or `Value?`. Config entry is visible and editable; Secret entry is masked. Values follow the [secrets](guidelines.md#files-stdin-and-secrets) rules.
- **Browser exposure.** A name with a public prefix is exposed to the browser.
  - Public prefixes: the global ones, the linked project's framework and custom prefixes, and a local SvelteKit `publicPrefix` (including an empty one). Never apply another framework's prefixes.
  - A secret-looking public name with no explicit type asks `How should this variable be stored?`: rename it without the public prefix and store it as a Secret, keep it as Config, or re-enter the name. `--yes` never answers this; non-interactive mode fails with `env_key_sensitive`.
  - An explicit `--type config` warns and proceeds where policy allows.
  - Record where the type came from (option, prompt, inference, default) so each signal is evaluated once and never asked twice.
- **Environments.** `--environment` takes standard and custom environments. Custom slugs normalize to IDs; values are trimmed and deduplicated; unknown values fail locally with `invalid_environment`. The result is one entry that spans all of them. A positional environment is accepted as a hidden deprecated alias and warns once.
- **Branch.** `--git-branch` is valid only when Preview is the only environment (otherwise `branch_requires_preview_only`). A positional branch is accepted as a hidden deprecated alias; passing both is a usage error. In non-interactive mode, no branch means all Preview branches.
- **Prompts**, in order: `Name?`, `Environments?`, `Git branch?`, `Environment variable type?`, `Value?`. The type question is asked only in interactive mode with no `--type`, with the computed default preselected.
- **Overwrite.** `--force` overwrites an existing entry and, since the name is in argv, counts as consent. Without it, an existing name is a conflict.
- **Receipt:** a `Project` context row before the first prompt when the project came from the link. Then `✓ Added` with the name, a `Replaced` row when `--force` overwrote a value (JSON `outcome: "added"`, `replaced: true`), `Environments`, `Branch` when set, and exactly one `Type` row. No values or timestamps.

```
$ vercel env add API_TOKEN --environment production --environment preview --type secret
  Project         acme/acme-web
? Value? ************

✓ Added           API_TOKEN
  Environments    Production, Preview
  Type            Secret
```

- **Missing input** in non-interactive mode fails with `action_required` and `reason` `missing_name`, `missing_value`, or `missing_environment`. `next` preserves the supplied options and uses `--value -` for the value, never a real value. Human recovery shows the same command with the missing options as `<UPPER_CASE>` placeholders (`--value -` for the value), never `--yes`.

### Pull and run

These are [requested delivery](guidelines.md#files-stdin-and-secrets) commands. Both are project required: an unlinked directory fails with `not_linked` (exit `2`) and never enters the link flow.

- Write the actual values the API returns, including nonempty Development Secrets.
- A Secret the API doesn't return never erases a usable local value: keep the local value if there is one, otherwise write the reserved file literal `[SENSITIVE]` and say how to fill it in locally. Say the value "was not returned", not that it can never be pulled.
- `[SENSITIVE]` is never injected into a child process, even when metadata is missing or the API later returns a real value.
- If metadata lookup fails, use the values that were returned, omit placeholders, and report only verified risks.
- `env run` precedence, highest first: process environment, local env files, remote values. Its help states this order. [Injected variables](guidelines.md#child-processes-and-local-servers) are filtered.
- `env run -- <command>` follows [child process](guidelines.md#child-processes-and-local-servers) rules.
- `env pull` replaces a file it created. A file it didn't create is refused with `env_file_exists` (Conflict, exit `1`) unless `--force` is given. With `--force` and the filename in argv, it replaces the file; with `--force` and the default filename, it asks `Overwrite <file>?` (default No) interactively and needs `--yes` non-interactively, otherwise `confirmation_required`. The receipt names the file written. `--json` returns `{ "envFile": { "path", "variables": [<names>] }, "outcome": "pulled" }`; values stay in the file, never in JSON. A Secret that wasn't returned adds a `secret_not_returned` warning.

**Verify:** masked versus visible entry; no value echoes; public-prefix decisions including empty SvelteKit prefixes; team policy; explicit, inferred, and default types; Development, Preview, Production, custom, and mixed environments; branch conflicts; deprecated type aliases; overwrite; missing input; current and legacy Secret shapes; unavailable values and placeholders; child argv and exit codes. Code: `src/commands/env/`, `src/util/env/`, `test/unit/commands/env/`.

## Login

- One interactive flow: OAuth Device Authorization. Print the verification URL and code, open the browser only as [Browser](guidelines.md#browser) allows, and wait with a bounded timeout. `--github`, `--oob`, `--future`, `--gitlab`, and `--bitbucket` are hidden deprecated aliases of that flow.
- An email or team positional is not part of the target interface; team selection happens after login, with `vercel teams switch`.
- Receipt: `✓ Logged in` with the username, then a `Team` row for the default team.
- Already logged in: say who and exit `0` (`outcome: "unchanged"`). `--force` runs the flow again and replaces the stored credential.
- In non-interactive mode, the `login_required` error says to set `VERCEL_TOKEN`.
- `vercel logout` revokes the token on the server when possible, deletes it locally, and reports both results separately.

Code: `src/commands/login/`, `src/util/login/`, `test/unit/commands/login/`.

## Logs

`vercel logs [runtime|requests]` shows observability events for the linked project. `runtime` (the default) returns individual runtime log entries; `requests` returns CDN request records, excluding background function executions like the dashboard does.

- **Snapshot only.** Returns up to `--limit` (default 100, max 10,000; larger values are clamped with `limit_clamped`) records from the last 30 minutes, newest first, then exits `0`. `--follow` is a hidden deprecated option: it warns (a `deprecated` line in JSONL) and runs the same bounded query.
- **Time range:** `--since` and `--until` resolve once against command start. An omitted `--since` is 30 minutes before the end: before command start, or before `--until` when it's given, so `--until 1h` alone searches the 30 minutes ending one hour ago. An empty or reversed range is a usage error (`2`) before any request.
- **Filters:** `-q, --query` takes the observability API's KQL-inspired expression for the selected source. `--deployment` and `--environment` are compiled into parenthesized predicates joined with `AND`, so a user `OR` cannot bypass them. `--query` replaces the old grouped-request search syntax. The API validates fields and syntax. The CLI shows its `error.issues` messages and points to the source's help. The removed options `--search`, `--level`, `--source`, `--status-code`, `--request-id`, `--branch`, `--expand`, `--no-follow`, and `--no-branch` print their replacement.
- **Help** for `logs`, `logs runtime`, and `logs requests` lists the common `--query` fields offline. These lists document fields; they are not an allowlist. Help states that quotes work only in field values and shows how to search several message words without them, because the API rejects quoted bare text.
- **Human output** is one row per record. Runtime rows show the time, level, service (or source), and the full message, with continuation lines indented. Request rows show the time, status, method, cache result, the full request ID (usable in a `requestId:"…"` filter), and host and path.
- **`--json`** emits [JSONL](guidelines.md#jsonl-streams), and `--non-interactive` implies it. The old `-j` shorthand is removed and prints its replacement. Lines are `{"type":"log"|"request","data":<unchanged API event>}`, `warning` lines (`deprecated`, `limit_clamped`, `stream_gap` for excluded intervals), and one final `summary` with `recordsReturned`, `timeRange`, `pagination: { hasMore, next }`, and `excludedIntervals` (always an array, matching the `stream_gap` lines). An empty result prints only warnings and the summary. stderr stays empty on success.
- **`--next <cursor>`** continues from a summary's `pagination.next`. The versioned token wraps the API cursor with the event, team, project, absolute window, composed filter, and order, so the source and team come from the token, not the link or current team. `--project`, `--deployment`, `--environment`, `--query`, `--since`, and `--until` conflict with it, as do a mismatched data source and an explicit `--scope` for another team (usage errors before the events query). `--limit` may change. Human output prints `Next page:` with the command. A `vercel.json` scope is still resolved by the entry point first.
- **Paging is best-effort** for both sources: records sharing a timestamp at a page boundary can repeat or be skipped, so `recordsReturned` is exact only for one page. The CLI never requests more than it prints, so it never skips records by over-fetching.
- Pages are printed as they arrive. If a later page fails, the records already printed stay on stdout and the exit code is `1`. Human mode says the output is incomplete and prints a command that retries the failed page; with `--json`, stderr gets one error document whose `data` has `recordsReturned`, `outputIncomplete`, `pagination`, and `excludedIntervals`.
- **JSON errors** are one compact document on stderr, written by the logs-local `writeJsonError()` (`status`, `reason`, `message`, `data`; API validation issues in `data.issues`). API filter and retention rejections are usage errors (`2`). Failures before `vercel logs` runs (login, `--token`, `--scope` resolution) keep the entry point's behavior.
- A closed stdout pipe ends the command quietly with `0`.
- An empty result names the window on stderr and suggests an earlier `--since`.

Code: `src/commands/logs/`, `test/unit/commands/logs/`.

## Traces Search

`vercel traces search` searches spans across the team, or one project with `--project`, through the same observability events API as [Logs](#logs).

- **Snapshot only.** Returns up to `--limit` (default 100, max 1,000) spans from the last hour, newest first. `--limit` is the total: the CLI pages internally, through the shared pager in `src/util/observability/events.ts`.
- **`--json`** emits [JSONL](guidelines.md#jsonl-streams), and `--non-interactive` implies it. Lines are `{"type":"span","data":<unchanged API event>}` and one final `summary` with `recordsReturned`, `timeRange`, `pagination: { hasMore, next }`, and `excludedIntervals`, the same shape as Logs. An empty result prints only the summary.
- **`--next <cursor>`** continues from a summary's `pagination.next`, with the same token as Logs (`src/util/observability/continuation.ts`). The team, project, filter, and absolute window come from the token, so every filter option, `--project`, `--since`, and `--until` conflict with it, as does an explicit `--scope` for another team (usage errors before any request). `--limit` may change.
- **Human output** is a table on stdout. When more spans match, stderr gets `Next page:` with a command that keeps `--limit` and `--columns`. Excluded intervals print one warning that points to `--json`.
- If a later page fails, spans already received stay in the output and the exit code is `1`. Human mode says the output is incomplete and prints a command that retries the failed page. With `--json`, stdout keeps only span lines and stderr gets one compact error document (`writeJsonError()` in `src/util/observability/jsonl.ts`, shared with Logs) whose `data` has `recordsReturned`, `outputIncomplete`, `pagination`, and `excludedIntervals`, and whose `next` has the retry command.
- **Known gaps:** a failure before any span is printed still goes through `outputAgentError()`, which writes to stdout in non-interactive mode instead of stderr like Logs. A `--limit` above 1,000 is a usage error instead of being clamped.

Code: `src/commands/traces/search.ts`, `src/commands/traces/query.ts`, `test/unit/commands/traces/`.

## Feedback

`vercel feedback [note] [--field <KEY=VALUE>]...` sends bugs, friction, and feature requests
to the Vercel team. Submit a note, named fields, or both; `-` reads from stdin.
No login or project is required. Bare invocation shows help. Explicit `-` with
terminal stdin fails with a usage error explaining that no input was piped.

- **Fields:** trim keys and preserve nonblank string values. Omit blank notes and field values; the last value for a key wins, including a blank value that removes the key. Recommend type, product, model, task, expected, actual, and impact, with a description for each field.
- **Help:** keep it to a description, options, recommended fields, and examples, including stdin.
- **Submission:** validate before sending; never echo feedback data, record it in telemetry, or automatically retry.
- **Output:** success prints `Feedback sent` to stdout; errors go to stderr.

Code: `src/commands/feedback/`, `test/unit/commands/feedback/`.
