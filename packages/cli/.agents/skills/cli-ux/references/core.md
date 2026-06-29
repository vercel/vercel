# Core CLI UX Rules

Reusable design, copy, output, safety, and machine-output rules for the Vercel CLI.

This is the target design system. Move every touched command family toward these rules. The only thing that holds you back is breaking a compatibility contract: command/flag names, exit codes, env vars, config files, JSON field names/shape, or parseable stdout. Change those only with an intentional, tested migration. Do not preserve non-conformant copy, prompts, output, or errors just because a family does it today.

## Voice + Copy

- Clear, competent, no fluff.
- Be brief. Every word earns its place.
- Use active voice by default.
- Use contractions when natural.
- Use numerals: `3 projects`, not `three projects`.
- Use sentence fragments for labels/status; full sentences for error messages; imperative, sentence-case fragments without trailing periods for command/flag descriptions.
- Use `Failed to` for system/API/build/deploy failures.
- Use `Couldn't`/`Can't` for user-state or validation failures.
- Do not use `Unable to`.
- Do not use `successfully`; name the completed action.
- Do not use `Oops`, `Uh-oh`, `Whoops`, `Heads up`, `please`, or apologies unless Vercel is at fault or asking the user for an inconvenient favor.
- CLI command/path/code output uses straight quotes/backticks for copyability. Dashboard UI may prefer curly quotes; CLI source strings may use ASCII apostrophes.
- Use `…`, not `...`, in prose/progress text. Keep `...` only when syntax requires it.

Use:

- `team`, not `scope`, except literal flag/API compatibility
- `project`, not app/site
- `settings`, not defaults/preferences/configuration in user-facing copy
- `Production` and `Preview`, not Live
- `Environment Variables`, not Env Vars
- `API Key`, `SDK Key`, `Deployment ID`, `Request ID`
- `Log In`, `Log Out`, `Sign Up` as auth labels; lowercase as verbs in prose

Avoid:

- `scope` in user-facing copy when `team` is meant
- vague yes/no prompts
- possessive resource-name prompts
- `defaults` when the user is editing settings
- `Do you want to...`
- `Would you like to...`
- `An error occurred`
- `Something went wrong` except as last-resort fallback

## Data Mechanics

- Decimal units by default: `MB`, `GB`, `TB`.
- Binary units only for literal memory: `MiB`, `GiB`.
- Tight tables: `42ms`, `3.4s`, `5m`.
- Prose: `42 ms`, `3.4 s`, `5 minutes`.
- Machine timestamps are ISO 8601 UTC.
- Human-facing timestamps use local time or relative time such as `3m ago`; use UTC only when precision or supportability matters.
- Respect singular/plural interpolation; never use `item(s)`.
- Empty states use `No deployments found.`, not `0 deployments found.`

## Commands + Flags

- Command and option names are lowercase.
- Use kebab-case for multi-word flags.
- Use nouns for resource groups: `project`, `domains`, `env`.
- Use verbs for actions: `add`, `remove`, `inspect`, `pull`.
- Reuse shared options from `util/arg-common.ts`.
- Prefer flags over ambiguous positional args.
- Positional args are OK only when there is one obvious value.
- Do not add a short flag unless common and obvious.
- Boolean flags do not take explicit values: use `--force`, not `--force=true`.
- Preserve `--non-interactive=false`; it intentionally disables agent-implied non-interactive mode.
- Match the family's existing machine-readable flag: `--format json` for net-new families or deliberate migrations, otherwise preserve existing `--json`. Never use `--output` for format; it already means output directory.
- For the `--fields` target, see Machine Introspection.
- Use `--yes` to accept defaults/skip low-risk prompts.
- Use `--force` for forceful re-execution/replacement, not generic confirmation bypass.
- For severe destructive actions, require typed confirmation in TTY and a command-specific value flag only when non-interactive proof is needed.
- Treat `--dry-run` as opt-in and rare. Do not assume support; check the command family before referencing or testing it.
- For nested/API-shaped input, provide a raw JSON/file payload path alongside human flags.
- Suggested `next` commands preserve safe global flags like `--cwd`, `--team`, and `--non-interactive`; never include tokens/secrets.

## Flow Design

Order:

1. **Orient.** Show what command is acting on.
2. **Detect.** Show meaningful inferred state.
3. **Decide.** Ask only unresolved, risky, or ambiguous choices.
4. **Preview.** Show planned risky/broad mutations.
5. **Mutate.** Do work with progress when it may take time.
6. **Confirm.** Print durable result: resource, URL, path, ID, status.
7. **Continue.** Suggest the exact next command when useful.

Rules:

- Show detected state before dependent prompts.
- A copy change is incomplete until the surrounding flow is checked: resolved state before decisions, side effects after mutation, and exact next action when useful.
- Do not let better wording hide a bad order; move the state/result into the right surface.
- Do not print state only to prove the CLI resolved it. Print it when it changes the next decision, prevents ambiguity, or confirms a durable result.
- Group related questions.
- Prefer one chooser over several vague yes/no prompts.
- Yes/no prompts confirm a concrete thing, not vague intent.
- If preview rows already show the values, ask for the action instead of repeating one value in the prompt.
- If argv or a prior prompt already contains the value, do not restate it in a preview row unless the row adds a new relationship or destination.
- If a safe default exists, show it and let `--yes` accept it.
- If a user declines an inferred choice, route to the next concrete choice; do not restart.
- When mutating both local files and remote state, make user-facing effects visible.

## Setup + Mutation Flows

Any command that resolves a resource or changes local/remote state should use the same shape:

- Treat an explicit command invocation as intent; do not ask a vague intent-confirmation prompt.
- Show the resolved target before prompts or mutation: team, project, domain, path, environment, or integration.
- Before confirming an inferred resource, show it as structured state, usually aligned rows such as `Project`, `Team`, `Directory`, `Source`, `Config`, or `Settings`.
- Do not use resolved-state rows before every later prompt. Once the target is obvious, keep moving.
- Keep status headings separate from aligned value rows. Do not turn state into a fake label/value row such as `Found Existing project`; use a short status heading such as `Found existing project` above `Project`/`Directory` rows, bolded when it introduces a block.
- Ask for the smallest missing value with a concrete noun: `Which team?`, `Project?`, `Domain?`, `Environment?`, `Name?`.
- For checkbox/multiselect prompts, keep a concise built-in keyboard hint visible in dim text on the prompt line when it fits, formatted as a key legend with primary controls first: `<space> select, <enter> confirm, <a> toggle all, <i> invert`. If the prompt plus legend would wrap in a typical terminal, put the legend on the next dim line. Do not wrap the legend in parentheses. Let the prompt renderer append it as a hint; do not bake controls into the prompt message, and do not remove the hint while tightening copy.
- Ask `Customize settings?` only after showing the inferred settings.
- Ask root/path questions only when there is real ambiguity.
- Compress detection into one useful line when possible.
- De-emphasize detection details in parentheses when the primary fact is the framework or resource: `Detected TanStack Start (Build Command: vite build, Output Directory: dist)`.
- Omit framework defaults from detection output when the framework name already explains them. Include build/output details only when they differ from defaults, are non-obvious, or affect the next decision.
- Drop emoji from primary result and progress rows.
- Print durable mutations as aligned result rows when there are multiple fields.
- Prefer a compact verb row for the changed object, then a separate destination row when it improves scanning: `✓ Added API_TOKEN`, `Project acme/web`.
- After local and remote mutation, result rows show the remote resource and user-actionable local artifacts changed. Keep internal state files in tests, debug output, machine output, or help text unless the user must act on them.
- `Linked`, `Created`, `Added`, and similar success rows confirm the outcome; they do not replace pre-confirmation resolved-state rows.
- Confirmation prompts record intent; completion rows record what actually happened. Do not drop a result row just because the user answered `yes`.
- If work continues elsewhere, end with a stable inspect/status/logs command.
- Offer optional follow-up work only when TTY, safe, and clearly secondary.
- In non-interactive mode, emit the exact missing flag, payload field, or next command instead of asking.

## Prompts

Prompt only when:

- stdin is a TTY
- the value cannot be inferred
- no flag/arg/payload already provides it
- the prompt meaningfully reduces risk or ambiguity

Never require a prompt. Non-interactive mode must fail with the exact flag, payload, or command needed.

Defaults:

- Make defaults visible.
- Prefer the most common safe value.
- Echo important resolved state after defaults are accepted.
- Active input prompts keep a visible separator between the question and the cursor, even before any value is typed. Masked prompts must not collapse the cursor against the label.
- If a short explanation only qualifies the current prompt, keep it as dim inline prompt context: `Store as sensitive? Sensitive values cannot be read later`. Do not wrap the hint in parentheses or add trailing punctuation. Do not promote it into a separate output row unless it is independent state, progress, warning, or result.

Good:

```text
  Add domain example.com to acme/web
```

Bad:

```text
? Do you want to add this domain?
```

## Output Surfaces

Pick one surface before writing copy:

- prompt: user must decide
- progress: work is happening
- success: action completed
- warning: nonfatal risk, compatibility, deprecation, or post-action review notice
- error: action failed
- table/list: many resources
- detail: one resource
- stream: live logs or foreground process output
- diff/staged change: before/after or pending publish
- JSON/agent payload: machine contract

Do not mix surfaces in one line. A URL row is a result, not progress.

## Layout

Use existing helpers before adding formatting:

- `output.print()` for designed rows
- `output.log()` only when the gray `> ` prefix is intended
- `output.warn()` / `output.error()` for warnings/errors when their format matches the target surface; if a warning helper emits a non-target label such as `WARNING!`, use or add a scoped formatted warning row and test it
- `output.spinner()` for long-running work
- `printAlignedLabel()` for target aligned label-value result blocks
- `table()` for tabular data
- `cmd()`, `param()`, `code()`, `highlight()` for command, flag, code, and value styling where already used

Target aligned result rows:

```text
✓ Added           API_TOKEN
  Project         acme/web
  Environments    Production, Preview
  Type            Sensitive
▲ Production      https://my-app.vercel.app
✓ Ready in 47s
```

Rules:

- The first 2 columns are the gutter: either two spaces (`"  "`) or a semantic glyph plus space (`"▲ "`, `"✓ "`, `"! "`).
- The gutter is not decoration. Use a glyph only when it carries state; otherwise keep the two-space gutter.
- label width: 16 chars
- value column: 18
- Use aligned rows for durable multi-field results: links, deployments, aliases, domains, integrations, environment changes, and other completed mutations.
- Use aligned rows for compact resolved-state previews before confirmation when a command has identified a resource.
- Do not force aligned rows onto simple one-line success, plain lists, or dense tables.
- Aligned-row labels are stable Title-Case labels: `Linked`, `Added`, `Inspect`, `Production`.
- Preview labels use stable Title-Case nouns: `Project`, `Team`, `Directory`, `Source`, `Config`, `Settings`.
- Use `Config` or `Settings` only for user-facing configuration/settings. Do not label internal link-state files as settings.
- If a mutation changes multiple durable things, one-line success is insufficient; print a compact result block.
- Production rows and production alias rows use `▲`: `▲ Production`, `▲ Aliased`.
- Primary completed-phase rows use `✓`: `✓ Added`, `✓ Created`, `✓ Linked`, `✓ Removed`, `✓ Updated`, `✓ Overrode`, `✓ Ready`.
- Warning rows use `!` in the gutter: `! --scope is deprecated. Use --team.` Do not render `WARNING!` starting at column 0; if a command must keep a text warning label for compatibility, indent it after the blank gutter.
- Preview, setup, discovery, progress, settings, local file, and secondary receipt rows keep the blank two-space gutter.
- Body section headings and detail blocks such as `Changes:`, diff rows, and local file summaries keep the blank two-space gutter. Do not let section headings or `+`/`-` diff markers occupy column 0.
- URLs are cyan in human output and plain strings in JSON.
- No colon after labels in aligned rows.
- No timing suffix on URL rows.
- Use `✓` once per completed phase as a visual anchor. Do not put it on every row in a result block.
- Use `✓` only after the phase is actually satisfied. Do not use it for discovery or in-progress rows such as `Found`, `Detected`, `Searched`, `Searching`, or `Saving`.
- Mutation receipt rows such as `Created`, `Linked`, and `Added` use `✓` when they are the primary completed phase. Secondary rows such as `Project`, `Environment`, `Directory`, `Config`, `Branch`, and `Type` keep the blank gutter.
- never hand-pad rows when a helper exists

Vertical rhythm:

- Use blank lines to separate logical phases, not to decorate individual rows.
- Use one blank line between setup/detection, prompt groups, mutation receipts, long-running progress, and terminal readiness/error states when those phases are present.
- Treat search/status output and resolved preview headings as separate phases when both are shown: `Searched 13 teams` then a blank line before `Found existing project`.
- Keep related rows contiguous: aligned preview rows, prompt/hint/choices, result blocks, lists, tables, and progress sequences do not get internal blank lines.
- Do not add leading/trailing blank lines to machine-readable output, JSON/JSONL, or parseable stdout.
- Avoid double blank lines. If the transcript needs more than one blank line, the flow likely needs a clearer heading, row label, or phase split instead.

## List + Detail Commands

Read-only resource commands should use a scan-first shape:

- Use borderless tables.
- Keep columns stable and scannable.
- Trim trailing whitespace.
- Prefer fewer columns over wrapped unreadable rows.
- Long lists need pagination, filtering, or cursor/`--next` support.
- Target machine controls are the family JSON flag, `--limit`, `--next`, filters, and schema-backed field selection. New or migrated families prefer `--format json`.
- JSON output is expected for resource-listing commands over time; when absent today, add it as part of deliberate command-family modernization.
- Detail views should show stable labels, exact IDs/URLs/paths, status, owner/team, and timestamps when relevant.
- Do not print a mutation preamble for read-only list/detail commands.
- Empty resource: `No projects found.` First-run empty states may add one next step: `No projects found. Run vercel link to connect one.`
- Empty from a filter names the filter: `No deployments match the current filters.`, not a bare `No deployments found.`
- Machine output for empty results is `[]` or `{}` on stdout with exit `0`. Never treat no results as an error.

## Glyphs + Color

Allowed primary glyphs:

- `▲` production/Vercel touchpoint
- `?` active prompt
- `✓` primary completed phase: completed action, deployment readiness, or terminal wait-state completion
- `!` warning or nonfatal risk notice
- `·` inline separator
- `→` relationship/transition
- `…` continuing work

Banned in primary result and progress rows:

```text
🔗 🔍 🚀 ⏳ ⋮⋮ 📝 💡 ❗ 🔒 ✅
```

Color:

- bold: labels, important values
- cyan: URLs
- dim: paths, hints, metadata, durations
- green: success only; color the `✓` gutter green when color is enabled, but do not turn secondary receipt rows green
- yellow: warnings only; color the `!` gutter yellow when color is enabled
- red: errors only
- Target: respect `--no-color` and standard `NO_COLOR`; current handling is narrower, so widen rather than narrow support when touching color handling.
- Machine output is colorless regardless of color settings.
- never rely on color, emoji width, or ANSI for required meaning

## Progress + Completion

- Print something quickly for network or long-running work.
- Use the existing output primitives before adding dependencies: `output.spinner()` for indeterminate work, and `progress()` from `util/output/progress` only for bounded quantitative progress.
- Do not add a new progress-bar package for one command. Add or extend a shared output helper only when the existing spinner/progress helper cannot represent the work.
- Use spinners for in-progress work, not resolved URLs.
- Use a spinner when the CLI knows the phase but not the denominator: fetching, verifying, creating, updating, deleting, waiting for browser auth, polling, or a single remote mutation.
- Use a progress bar only when the CLI has a trustworthy `current` and `total` that users benefit from seeing: uploaded/downloaded bytes, files processed, explicit steps completed, or batch items handled.
- Do not invent percentages or progress bars for work that can stall, retry, fan out, or change total size. Prefer phase spinners such as `Verifying…`, `Uploading icon…`, `Updating…`.
- Spinner text uses present participles: `Building…`, `Completing…`.
- Render progress through the managed output stream. Do not write raw cursor movement or direct stream updates from command code.
- In TTY, progress may update in place. In non-TTY, CI, tests, and JSON modes, avoid animation; emit bounded milestones or phase changes only.
- Throttle progress updates so they do not flood logs. For non-TTY percentage progress, coarse milestones are usually enough.
- If progress totals are invalid, unavailable, or become misleading, fall back to a spinner.
- Do not interleave parallel progress unless readable. Prefer one aggregate progress line over many competing bars.
- Final success gets one primary completion row; add secondary receipt rows only for necessary durable context.
- Success names what changed and where, either in one row (`✓ Linked acme/web`, `✓ Added example.com to acme/web`) or in a compact receipt block (`✓ Added API_TOKEN`, `Project acme/web`). Never use `Done.` or `Success!`.
- Include the durable identifier: resource, URL, path, or ID.
- Use `✓` on the primary completed-phase row: `✓ Linked acme/web`, `✓ Added API_TOKEN`, `✓ Ready in 47s`. Do not use it on secondary receipt rows.
- Do not put durations in ordinary mutation receipts. Include timing only when duration is the outcome users care about, such as readiness or an explicit wait/build phase.
- Do not claim ready for `--no-wait` while still building.
- Target: clear spinners and partial ANSI on `SIGINT` / `SIGTERM` before printing cancellation state. No global handler exists yet; add one before relying on this as current behavior.
- If cancellation may leave remote work running, say how to inspect status.

## Streaming + Long-Running Commands

Foreground commands such as dev servers, log following, waits, and live build output need a streaming shape:

- Do not put a spinner over a live log stream.
- Keep status, prompts, warnings, and diagnostics on stderr.
- Search-scope diagnostics should be dim and compact. Prefer counts over names: `Searched 13 teams`, not a wrapped list of team slugs. Print names only when the names themselves are actionable choices or needed to resolve ambiguity.
- Stream logs to stdout when they are the primary, pipeable output; otherwise follow the command family's existing stream contract.
- Make follow/wait boundaries explicit: `--follow`, `--wait`, `--no-wait`, timeout, and completion states should be visible in help and output.
- Explain Ctrl-C semantics before or during long follow modes when useful: stopping local following is not always canceling remote work.
- On interrupt, stop local streaming cleanly, clear partial ANSI, and say whether remote work continues.
- Preserve machine modes: JSON/JSONL streams must stay parseable and must not interleave human status.

## Errors

Errors include:

1. what failed
2. the rule or constraint
3. how to fix it

Good:

```text
Names use lowercase letters, numbers, and hyphens. No spaces or symbols.
Suggestion: my-app
```

Non-interactive:

```text
Provide --team explicitly. No default is applied in non-interactive mode.
```

Rules:

- Put the most actionable line last in multi-line errors.
- Group repeated failures under one explanation.
- Do not dump stack traces unless `--debug`.
- Never print raw upstream error objects.
- Translate Vercel/platform/API errors into Vercel voice.
- Preserve actionable partner messages with attribution for partner integrations.
- Pair platform/system failures with a stable ID when available: `Request ID`, `Deployment ID`, `Build ID`, `Run ID`, `Trace ID`.
- Do not attach stable IDs to validation errors or permission denials unless they help support/debugging.
- Permission errors must avoid disclosing private resource existence across tenant boundaries.

Permission/access errors should include safe versions of:

- attempted action
- actor or active team
- resource/context
- missing authority or constraint
- resolver: role holder, settings page, login/team switch, docs, or support

## Warnings

- Warn only for a nonfatal condition the user should review before continuing or after completion; otherwise use error or stay silent.
- Structure: what happened · why it matters · optional fix or next step.
- In human output, prefer the warning gutter glyph over a label: `! <message>`, not `WARNING! <message>`.
- Do not cry wolf; a warning on every run trains users to ignore it.
- Deprecation warnings name the replacement and stay on stderr: `--scope is deprecated. Use --team.`
- Never put warnings on machine stdout; see Streams + Formats.

## Remote Work

- Validate local input, config, paths, and target before the first remote mutation.
- Show the resolved remote target before risky or broad work.
- Make polling, timeout, rate-limit, and interrupted states explicit.
- Say whether remote work may still be running after timeout, cancellation, or connection loss.
- Prefer inspect/status/logs commands over blind retry.
- Retry suggestions must not duplicate resources unless rerun semantics are intentional and tested.
- Update/outdated CLI notices are diagnostics: stderr in human mode, never JSON stdout.

## Secrets

- Never print tokens, secret values, request bodies, or unredacted user content.
- Redact secrets in output, JSON, debug logs, telemetry, errors, and suggested commands.
- Prefer stdin, file input, or an interactive prompt for secret input; avoid requiring plaintext secrets in argv flags.
- If a secret flag exists for scripting, document the stdin/file alternative.
- Do not include secret-bearing flags in `next` commands.
- For env-value write prompts, mask values classified as sensitive. Non-sensitive values may stay visible while the user types or edits them, but do not repeat entered values in receipts, logs, JSON, telemetry, warnings, errors, or suggested commands.
- Treat values read from stdin, files, env, API responses, and remote resources as sensitive until classified.
- Permission errors should not reveal whether a private resource exists across tenant boundaries.

## Dangerous Actions

- Dangerous actions include deletes, production mutations, secret changes, billing changes, permission changes, and broad remote rewrites.
- Show target, scope, and planned mutation before executing.
- `--yes` may skip low-risk prompts, but must not bypass severe destructive confirmation by itself.
- Yes/no destructive prompts default to No (`y/N`); never default-accept destructive work.
- Typed confirmations name the exact required value: `Type the project name to confirm deletion:`.
- Severe destructive non-interactive paths need an explicit command-specific proof value.
- Prefer `--dry-run` only when the command family already supports it or the change intentionally adds it with tests.
- No-op, already-done, staged, draft, and published states must be distinct.
- Local writes and remote mutations should be ordered so partial failure is recoverable or clearly explained.

## Streams + Formats

- Default status, warnings, prompts, progress, and diagnostics use the managed `output` stream. In this CLI, that stream is stderr.
- Machine-readable results use `client.stdout`.
- Pipeable single values use stdout and contain only the value.
- If a command accepts piped stdin, document it in help and keep diagnostics on stderr.
- If stdin is not a TTY and the command cannot read stdin safely, fail with the needed flag or payload path.
- JSON output must contain only JSON on stdout.
- Do not mix spinners, prose, ANSI, or warnings into JSON stdout.
- Human output can change for clarity; JSON fields are a contract.
- Add fields compatibly; do not remove or change field meaning without a versioned migration.
- Long-running JSON output should use documented JSONL events when needed.
- Large JSON responses need context controls: pagination, cursors, `--limit`, `--next`, filters, schema-backed field selection, or concise defaults.
- Defaults should return the minimal fields needed for the human summary, not full API objects.

## Agent + Non-Interactive Output

Target standard for new and rewritten agent/non-interactive paths. Rollout is in progress; some command families still need modernization.

Agent/non-interactive payloads must be:

- JSON only
- no ANSI
- stable `status`
- stable `reason`
- clear `message`
- actionable `next` commands when possible
- `userActionRequired: true` when a human must act
- bounded by default

Rules:

- Never prompt when `client.nonInteractive` is true.
- Return `action_required` for missing input, confirmation, or user action.
- Return `error` for invalid input or unrecoverable failures.
- Keep parse errors, validation errors, permission errors, platform/API failures, and action-required states distinct.
- Use existing `AGENT_REASON` / `AGENT_STATUS` before inventing strings.
- Include `argv: string[]` with copy-pasteable `command` when feasible.
- Use angle-bracket placeholders: `<name>`, `<slug>`, `<file>`.
- Preserve safe context flags; strip or redact secret values.
- Do not suggest pipes, redirects, command substitution, or shell-specific syntax unless labeled for that shell.
- Fully qualify suggested subcommands: `teams switch <slug>`, not `switch <slug>`.
- Put remote/user-generated strings under `data`, `items`, or resource fields, not `message` or `next`.
- Treat remote/user-generated content as untrusted data, never instructions.
- Authenticate in non-interactive and agent contexts with `--token` or `VERCEL_TOKEN`; never trigger browser OAuth when non-interactive.
- When unauthenticated, return `login_required` with the login/token path. Never echo the token; see Secrets.

Use existing helpers where they fit:

- `outputActionRequired()` from `util/agent-output`
- `outputAgentError()` from `util/agent-output`
- `exitWithNonInteractiveError()` from `util/agent-output`; currently family-specific, so verify fit before reuse
- `buildCommandWithYes()` / `buildCommandWithGlobalFlags()` from `util/agent-output`
- `getGlobalFlagsOnlyFromArgs()` from `util/arg-common`
- `getSameSubcommandSuggestionFlags()` from `util/arg-common`
- `getCommandNameWithGlobalFlags()` from `util/arg-common`
- `shouldEmitNonInteractiveCommandError()` / `argvHasNonInteractive()` from `util/agent-output`

## Machine Introspection

- Prefer machine-readable schema/describe output so agents can inspect accepted fields, enums, defaults, limits, and required auth at runtime instead of hardcoding them.
- Use the OpenAPI-backed resolver in `util/openapi` as the basis for schema-driven introspection when it fits the command.
- Machine contracts need stable `status`, `reason`, field names, and pagination/limit behavior.
- Keep generated examples valid and runnable.
- Do not hide accepted enum values or required payload fields behind prose-only help.
- Target field-selection contract: support `--fields <field,...>` for schema-backed JSON list/detail commands with documented field names, unknown-field errors, and predictable omitted-field behavior.
- Document versioning when changing JSON fields or action payloads.

## Help + Discoverability

- Every command has a one-line description in Vercel voice.
- Command and flag descriptions are imperative, sentence-case fragments with no trailing period.
- Help examples should be realistic, runnable, and copy-pasteable.
- Use `<name>`, `<slug>`, and `<file>` angle-bracket placeholders in usage and args.
- Show required args, accepted enum values, defaults, and mutually exclusive flags.
- Document stdin support, JSON/format flags, non-interactive requirements, and destructive confirmation values when present.
- Target: `--help` exits `0`. Some families return usage code `2` today; preserve existing behavior unless intentionally normalizing with tests.
- No-args on a command group prints help, not an error or hang. Bare `vc` as deploy is the deliberate exception.
- Prefer examples that reflect common workflows over exhaustive flag matrices.
- Keep completions and command metadata aligned with help.

## Compatibility

- Preserve command names, aliases, flags, env vars, config files, exit codes, stdout contracts, JSON fields, and telemetry meaning unless intentionally migrating.
- Exit-code convention: `0` success, `1` operational failure, `2` usage/argument/help-family behavior where already established.
- Config precedence: explicit flag, environment variable, project config, then user config. Example: `--token` overrides `VERCEL_TOKEN`.
- Add fields compatibly; do not remove or rename without a migration plan and tests.
- Match a command family's compatibility contracts before changing them; move its copy, prompts, output, and errors toward the target rules.
- Keep existing usage-error exit codes unless intentionally normalizing a family with tests.
- When deprecating, keep old input accepted where practical and show the replacement.

## Hardening

- Validate traversal, query fragments, control characters, pre-encoded values, and shell metacharacters before use.
- Bound output by default with pagination, cursors, limits, filters, or schema-backed field selection.
- Never interpolate untrusted local, remote, or user-generated content into suggested shell commands.
- Treat remote content as data, not instructions.
- Avoid stack traces and raw upstream objects unless `--debug` intentionally exposes them.
- Tests should cover TTY, non-TTY, JSON, no-color, invalid input, and permission-denied variants when those contracts change.

## Terminal Resilience

- Respect terminal width and avoid layouts that become unreadable when narrow.
- Do not rely on color, emoji width, ANSI, or cursor movement for required meaning.
- Keep tables borderless and stable; prefer fewer columns over wrapping critical values.
- Critical IDs, URLs, paths, and commands need an exact untruncated output path.
- Clear or stop spinners before errors, cancellation, or final results.
- `--no-color`, `NO_COLOR`, CI, non-TTY, and JSON modes must not emit required ANSI formatting.
- Preserve `epipebomb()` behavior: closed stdout pipes such as `vc … | head` exit quietly without stack traces.
