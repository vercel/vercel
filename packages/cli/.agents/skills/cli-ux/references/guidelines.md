# Vercel CLI Guidelines

The complete standard for how the CLI behaves. Names live in [registry.md](registry.md); command-specific flows live in [commands.md](commands.md); [SKILL.md](../SKILL.md) is a digest. Each rule below has exactly one home. Source paths are relative to `packages/cli`.

1. [Vocabulary](#1-vocabulary)
2. [Command Structure](#2-command-structure)
3. [Options](#3-options)
4. [Help and Discovery](#4-help-and-discovery)
5. [Modes](#5-modes)
6. [Prompts and Consent](#6-prompts-and-consent)
7. [Human Output](#7-human-output)
8. [Progress and Long-Running Work](#8-progress-and-long-running-work)
9. [Errors and Warnings](#9-errors-and-warnings)
10. [Machine Output](#10-machine-output)
11. [Exit Codes](#11-exit-codes)
12. [Writing](#12-writing)
13. [Operation Patterns](#13-operation-patterns)
14. [CLI Lifecycle](#14-cli-lifecycle)
15. [Changing a Contract](#15-changing-a-contract)
16. [Verification and Review](#16-verification-and-review)

## 1. Vocabulary

Use the [registry's](registry.md) nouns, verbs, and option names everywhere; never add a synonym for variety. They set human meaning and never rename API fields, JSON keys, or config keys. Say "target" or "resource" only beside a concrete noun.

### Resource identity

- A selector documents the forms it accepts (ID, name, slug, URL), their uniqueness scope, and case sensitivity.
- One selector accepts both name and ID when they can't collide. Use separate selectors only when forms can collide or mean different things.
- Resolve exactly, within the authorized scope. NEVER resolve a mutation target by first match, fuzzy match, or ID prefix.
- When a later operation must address the same instance, persist its stable ID and keep the name for display.

## 2. Command Structure

### Grammar

```
vercel <group> [<subgroup>...] <action> [<resource>] [options]
```

The [verb rules](registry.md#2-verbs) and the [command index](registry.md#6-command-index) apply.

- **Groups** are plural nouns for collections (`projects`, `domains`) and product names for product namespaces (`blob`, `flags`, `env`). Child collections nest under their parent (`vercel firewall rules add`).
- **Top-level verbs** are reserved for workflows on the current directory, session, or machine (`deploy`, `dev`, `link`, `login`, `setup`). Bare `vercel` runs `vercel deploy`. Teach an explicit path when it could collide with a command: `vercel deploy ./build`, never bare `vercel build` to mean deploying that directory.
- **Tools and feeds** (`api`, `curl`, `logs`, `changelog`) are top-level and named for what they do.
- One obvious primary resource MAY be positional (`vercel deployments inspect <deployment>`). Other Vercel resources use named options. Documented parent-and-child identities MAY use ordered positionals (`flags rules update <flag> <rule>`); `aliases set <deployment> <alias>` retains its established form. Register any additional exception before implementing it.
- A standalone state change is a subcommand (`enable`); a boolean field of `add` or `update` is an option pair (`--feature` / `--no-feature`).
- Add to the command index before adding a top-level command.

### Names, shortcuts, and aliases

| Kind             | Definition                                                                                                                                                                                                                             | Example                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Canonical name   | The one form help, examples, docs, and suggestions teach                                                                                                                                                                               | `vercel deployments list` |
| Shortcut         | A permanent alternative listed beside the canonical form in help; never deprecated                                                                                                                                                     | `vercel list`             |
| Command alias    | A permanent, accepted spelling that is never taught; its help is the canonical command's. Only these: `ls` for every `list`, `rm` for every `remove` and `delete`, `del` for every `delete`, singular group names, and `vercel remove` | `vercel project ls`       |
| Deprecated alias | A hidden old name kept during a [contract change](#15-changing-a-contract); it prints a deprecation warning                                                                                                                            | `vercel target`           |

Deployments are the primary resource, so they get top-level shortcuts ([command index](registry.md#6-command-index)). `vercel remove` is never taught because "remove" would soften a deletion. Singular group names never behave differently from the plural group. Any alias in the index not listed above is deprecated.

### Consequence verbs

The verb is chosen by its [consequence](registry.md#ending-and-removing), and the prompt, receipt, and JSON `outcome` reuse it: `Revoke token deploy-ci?` → `✓ Revoked` → `"outcome": "revoked"`. Exceptions: deploy, whose receipt is its terminal status ([Deploy output](commands.md#output)), and the non-final outcomes in [JSON results](#json-results) (`unchanged`, `accepted`, `staged`, `started`, `planned`).

### Unknown commands and extensions

- `vercel <arg>` resolves in order: built-in command or alias → extension `vercel-<arg>` on `PATH` → existing local path (deploys it) → [usage error](#usage-errors). To deploy a directory named like an extension, use `vercel deploy <dir>`.
- Extensions never shadow built-ins. They receive argv and stdio unchanged, own their exit code, and get `VERCEL_CLI_VERSION` and the resolved working directory, and an authenticated local API proxy in `VERCEL_API` instead of credentials (it accepts only requests carrying a per-invocation secret passed alongside it): the CLI never injects `--token` or stored credentials. Only absolute `PATH` entries outside the project are searched. Root help lists installed extension names without running them, and the first run of each prints its resolved path on stderr.
- Help paths resolve in the same order; an extension receives `--help` in its own argv.

## 3. Options

Use **option** for every named CLI input, including Boolean switches and inputs that take values. Use **positional argument** for unnamed inputs. Help headings are `Options:` and `Global Options:`; descriptions and errors use the same terminology. Reserve **feature flag** for the product resource. Existing command paths, source identifiers, environment variables, JSON fields, and configuration keys keep their spelling.

### Global options

Every command at every depth accepts these. Passing a global never makes a local or help operation need the network. `src/util/arg-common.ts` owns them.

| Option                      | Meaning                                         |
| --------------------------- | ----------------------------------------------- |
| `-h, --help`                | Show help for the selected command; do no work  |
| `-v, --version`             | Print the CLI version                           |
| `--cwd <DIR>`               | Working directory for this invocation           |
| `-A, --local-config <FILE>` | Path to the project's `vercel.json`             |
| `-Q, --global-config <DIR>` | Path to the global CLI config directory         |
| `-d, --debug`               | Redacted diagnostic detail on stderr            |
| `--no-color`                | Disable color                                   |
| `--non-interactive`         | Never prompt; fail with required inputs instead |
| `-S, --scope <TEAM>`        | Team to act in                                  |
| `-t, --token <TOKEN>`       | Authentication token (prefer `VERCEL_TOKEN`)    |

Option names for recurring concepts and the allowed short options are in the [registry](registry.md#4-standard-options). Where a command has the capability, it uses the registered name.

### Parsing

- Options are defined in `command.ts` metadata and parsed with `parseArguments(args, getFlagsSpecification(command.options))`. Never scan argv by hand.
- Leaf commands reject unknown options and extra positionals before doing any work ([usage errors](#usage-errors)). Parent commands parse permissively only to route.
- Only full names and declared aliases are accepted. NEVER infer an option or command from a unique prefix.
- `--name value`, `--name=value`, and `-x value` all work. Globals work before or after the command path. `--` ends option parsing; everything after it passes through literally.
- Names are lowercase kebab-case. Positionals render as `<required>` and `[optional]`; value hints follow the [registry](registry.md#3-selectors-and-value-hints).
- Booleans are [presence options](registry.md#4-standard-options) with `--no-` negation; `--flag=true|false` also parses.
- Each option defines its repeat behavior (append, last wins, or error) and what an empty value means. Conflicting options are a usage error before any prompt or request.
- Identifiers are validated strictly. Free-form data keeps its metacharacters and is encoded for its destination.

### Environment variables and precedence

Settings resolve highest first: command-line option → environment variable → project configuration (`vercel.json` or `vercel.ts`, then the `.vercel/` link) → the CLI config directory (`--global-config`, default `~/.vercel` or the XDG location) → built-in default.

- An explicit invalid value (option or environment variable) fails; it never falls back to a lower source. `--scope` that disagrees with `VERCEL_ORG_ID`, or `--project` with `VERCEL_PROJECT_ID`, is a usage error; for every other pair, the option wins.
- The current team in the CLI config directory applies to reads and ordinary team-scoped commands. It never counts as choosing a team for setup: linking or creating a project needs an explicit team or a choice ([team selection](#context-and-authentication)).
- Agent runs that can't prompt (an agent with no terminal) never use the current team or the account's default team. Their team comes from `--scope` (a `scope` in `vercel.json` counts as `--scope`), an app token's own team, `VERCEL_ORG_ID`, the link, or the only available team, in that order; a `VERCEL_ORG_ID` or link that names no available team, or a `VERCEL_ORG_ID` that differs from an app token's team, fails with `scope_not_accessible`. Otherwise the first request that needs a team fails with `missing_scope` and `userActionRequired: true`. Public domain lookups send no team. These runs can't change the saved team (`teams switch` fails with `agent_cannot_switch`), and their config writes keep it. An agent attached to a terminal behaves like any interactive run.
- Product SDK variables that predate this rule (`BLOB_READ_WRITE_TOKEN`) keep their names. A new public variable uses the `VERCEL_` prefix, is added here, and is documented in help for the commands it affects. Internal and test-only variables start with `__VERCEL_` and never appear in help.

| Variable                              | Effect                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `VERCEL_TOKEN`                        | Authentication token. Preferred over `--token`, which appears in process lists                                          |
| `VERCEL_ORG_ID` + `VERCEL_PROJECT_ID` | Pin team and project without a link. Both or neither; never writes `.vercel/`                                           |
| `CI`                                  | Detected via `ci-info`; forces non-interactive mode                                                                     |
| `NO_COLOR` / `FORCE_COLOR`            | Disable / force color ([precedence](#color-and-glyphs))                                                                 |
| `VERCEL_TELEMETRY_DISABLED`           | Disable telemetry                                                                                                       |
| `NO_UPDATE_NOTIFIER`                  | Disable update notices                                                                                                  |
| `VERCEL_GUIDANCE_DISABLED`            | Disable optional next steps and tips                                                                                    |
| `VERCEL_ACCESSIBLE`                   | [Accessible mode](#5-modes)                                                                                             |
| `VERCEL_COMPAT_<NAME>`                | Restore one old behavior for one major version after a breaking change ([Changing a contract](#15-changing-a-contract)) |

## 4. Help and Discovery

### Entry points

- `vercel --help`, `vercel -h`, and `vercel help` show root help. `vercel <path> --help`, `-h`, and `vercel help <path>` show the same help at any depth.
- A group invoked with no action shows its help and exits `0`, unless it has a documented default action.
- Help goes to stdout, exits `0`, works offline, and never authenticates, links, prompts, or mutates. Once help is recognized, other input validation is skipped.
- Help for an unknown path is a usage error that names the unknown segment and points to the nearest valid group's help.
- `--help` after a `--` handoff belongs to the child. Delegated commands (`sandbox`) render the same layout from metadata they expose.
- `--version` at any depth prints only the version and exits `0`, skipping other validation; with `--json` it prints `{ "version" }`. `--help` wins when both are given.

### Layout

Help is generated from command metadata (`src/commands/<name>/command.ts`, `src/commands/help.ts`). Sections appear in this order; empty ones are omitted.

| Section         | Content                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Usage + summary | `▲ vercel <full path> <args> [options]`, then a useful one-line imperative summary and any lifecycle label; root help MAY omit a generic summary              |
| Commands        | Immediate children with one-line summaries; the default action marked `(default)`; shortcuts beside canonical names                                           |
| Arguments       | The command's own positionals with useful descriptions or accepted forms beyond usage; omit the section when it adds no information                           |
| Options         | Command options, alphabetical by long name, short form beside it, value hint, default, accepted values                                                        |
| Global Options  | The full list in root help; one pointer line in every other help page                                                                                         |
| Examples        | The fewest verified examples that cover distinct common jobs, usually one to three; include automation and risky use where relevant; group help MAY omit them |
| Notes           | Only material behavior: stdin, streams, auth, side effects, pagination, waiting                                                                               |
| Learn more      | Docs URL for the command or product                                                                                                                           |

```
▲ vercel domains add <domain> [options]
Add a domain to a project

Arguments:
  <domain>                  Domain name, such as example.com

Options:
  --force                  Move the domain from another project in the same team
  --json                   Output the result as JSON
  -p, --project <PROJECT>  Project to add the domain to (default: linked project)
  -y, --yes                Confirm moving the domain when used with --force

Global Options: See `vercel --help`

Examples:
  Add a domain to the linked project
    vercel domains add example.com

  Add a domain in CI and read the result
    vercel domains add example.com --project acme-web --json

  Move a domain from another project in CI
    vercel domains add example.com --project acme-web --force --yes

Learn more: https://vercel.com/docs/cli/domains
```

- Custom sections contain only material reference information. Option-related sections MAY follow Options; other sections follow Examples. Declare rows and command lines structurally; mark code or structured input `preformatted`. Ordinary prose wraps, including indented prose. The final help documentation URL is the primary external destination and uses the link role; a concise product-specific heading MAY replace `Learn more`.
- Defaults read `(default: VALUE)`; context-dependent defaults are explained in words. `<file>...` means one or more; `[file]...` zero or more. Put the three-dot ellipsis immediately after the closing bracket, with no intervening space.
- Tables are borderless and wrap descriptions without truncating syntax. Help stays legible without color at 80 columns.
- Root help teaches discovery; leaf help makes the operation executable. Help is a reference, not a tutorial or marketing.
- **Spacing:** keep a useful summary adjacent to usage. Omit generic product summaries and redundant command-help hints at root. Use one blank line between sections or task groups, none after a heading or between rows. Indent entries two spaces and example commands four. Keep an example label directly above its command; separate examples with one blank line. Do not nest task groups beneath a redundant `Commands:` heading.
- **Styling:** follow [Typography and hierarchy](#typography-and-hierarchy) and [Color and glyphs](#color-and-glyphs). Root, leaf, group, custom, and dynamic help share the same renderers. Generate usage and styled spans from metadata; never infer a shell grammar from prose.
- Root help SHOULD group commands by recognizable user tasks rather than expertise labels such as Basic and Advanced. Each visible command appears once, with a short, task-focused summary; metadata SHOULD provide `summary` when the full description would wrap into an explanation. Preserve that full description in command help; display groups do not change command paths or aliases. Group help shows immediate children and how to get their help, not the whole tree.
- Keep option syntax intact. If syntax and a useful description cannot fit side by side, put the description below it; never reduce it to an ellipsis or a one-word-wide column. Use the same fallback for command summaries. Keep leaf options complete and alphabetized; the global pointer avoids repeating the full global list.

### Examples and suggestions

This governs every command the CLI shows: help examples, next steps, and error recovery.

- Canonical names and long options only. Each parses against current metadata and is tested through the parser, never by live mutation.
- Prefer one template command per job when input varies. Do not append a concrete line that only fills in the same placeholders. Keep a concrete example only when it teaches syntax the template cannot explain clearly; distinct options, shell forms, or steps get separate labels. Examples name an actual action: never put `[options]` or bare `enable|disable` alternatives in an executable line.
- Placeholders use angle brackets without an extra substitution label; prefer `<UPPER_CASE>` for named values. Usage positionals keep metadata names, and enumerated choices keep their literal casing. Values are synthetic (`acme`, `acme-web`, `example.com`), never real credentials or retired names (`zeit.rocks`, `now.sh`, Edge Config).
- Keep safe context the user supplied (`--scope`, `--cwd`, `--project`). Quote values for the user's shell, including PowerShell and cmd. A remote value appears in a suggestion only if it matches its selector's identifier grammar; otherwise use a labeled placeholder.
- **Copyable commands:** render one complete command per line, indented, with no shell prompt, `$`, or backticks. Root, leaf, group, and dynamic help MUST share this rule and the shared syntax renderer. Styling may add ANSI only; stripping it MUST recover the exact command text, including spaces and quotes. Never hard-wrap or truncate an example command. Documentation transcripts may use `$` to identify a user’s input; the CLI never emits that prompt.

### Machine-readable help

`vercel <path> --help --json` prints one JSON document on stdout: path, summary, subcommands, arguments, options (name, short form, type, value hint, default, accepted values, repeatability, deprecation), lifecycle label, and the result schema: the guaranteed fields of the command's JSON result, with types, marking secret fields. New `--json` commands MUST declare a result schema; existing ones gain it as they're touched. `vercel help --all --json` prints the whole tree. Both come from the same metadata as human help. Tree visibility follows [Lifecycle labels](#lifecycle-labels), including cached entitlement, so it may change without a CLI version change. A known Early Access path still has direct help; visibility never grants permission to run it.

### Command search

`vercel help search <query>` finds commands by task. It works offline, matches summaries, nouns, and examples from metadata, and prints up to 10 canonical paths with their summaries on stdout; `--json` returns `{ "commands": [{ "path", "summary" }] }`. No match exits `0` with `No commands match "<query>".` It never records the query.

### Completion

Completion suggests canonical commands, options, and enumerated values from the same metadata. Remote suggestions (projects, teams) are cached, time-bounded, and never block or prompt. Completion never runs side effects or reveals secrets.

### Lifecycle labels

Labels match the dashboard's. A label appears once, after the summary of the command that carries it, never stacked or repeated on subcommands.

| Label        | Meaning                                              | Help                                                   | Behavior                                                                             |
| ------------ | ---------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| (none)       | Generally available                                  | Listed                                                 | [Changing a contract](#15-changing-a-contract) applies                               |
| Preview      | Feature-complete ahead of GA; minor changes possible | `(preview)`                                            | Changes ship with release notes                                                      |
| Beta         | Usable; bugs expected; no SLA                        | `(beta: <limit>)`, such as `(beta: output may change)` | Changes ship with release notes; no per-run warning                                  |
| Early Access | Available to some teams or plans                     | `(early access: <who>)`                                | Listed only for teams that have it, from cached entitlement; its help always renders |
| Experimental | May change or disappear without notice               | Hidden until its gate is on, then `(experimental)`     | Gated by a `__VERCEL_FF_*` variable or config                                        |
| Alpha        | Internal or invite-only                              | Hidden                                                 | Gated                                                                                |
| Deprecated   | Replaced; scheduled for removal                      | Hidden from lists; its help names the replacement      | Works and prints a [deprecation warning](#warnings)                                  |
| Hidden       | Internal or test-only                                | Never listed                                           | Follows every behavior rule; its name may stay internal                              |

## 5. Modes

Four settings control each invocation. Each is resolved separately; only the rules here connect them.

| Setting      | Values                        | Decided by                                                                                                                                                              |
| ------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interaction  | interactive / non-interactive | Non-interactive if `--non-interactive`, `--json`, CI, a detected agent (unless `--non-interactive=false` on a TTY), stdin used as payload, or no TTY on stdin or stderr |
| Format       | human / JSON                  | Explicit `--json`; [Logs and Traces Search](#format-compatibility) retain their documented JSONL behavior                                                               |
| Presentation | rich / plain                  | Per stream: rich only on a TTY with `TERM` other than `dumb`; [color](#color-and-glyphs) has its own precedence                                                         |
| Consent      | ask / granted                 | `--yes`, within the limits in [Consent](#consent)                                                                                                                       |

- **Detection lives in one place.** Commands read resolved settings from shared helpers and never check `process.stdin.isTTY`, CI variables, or agent variables themselves. Agents are detected from their harness's environment variables (`src/util/agent/`).
- **Agents are non-interactive, not a format.** A detected agent gets human output unless it passes `--json` or a documented [format compatibility](#format-compatibility) rule applies. `--non-interactive=false` restores prompts for an agent on a TTY, never with `--json`, in CI, with payload stdin, or without a TTY.
- **A pipe changes presentation only.** Piping stdout drops automatic color and animation there; an explicit color override follows the precedence below; it never selects JSON or suppresses prompts on stderr.
- **Stdin used as payload** (`--value -`, `--file -`) can't also answer prompts.
- **Non-interactive** runs keep results, receipts, warnings, and recovery hints; they drop prompts, spinners, and redraws. Missing input fails with an `action_required` [error](#json-errors).
- **Complete explicit input** behaves identically with or without a TTY.
- **Accessible mode** (`VERCEL_ACCESSIBLE=1`) serves screen readers and simple terminals: numbered choices instead of arrow-key menus, one plain line per phase instead of spinners, no redraws. Content is otherwise identical. Status wording and glyph removal follow [plain presentation](#color-and-glyphs). Single-select accepts one number; multiselect accepts comma-separated numbers such as `1,3`. Print preselected defaults in words; Enter alone keeps them when valid, and `none` clears an optional multiselect. Invalid input preserves the answers and explains the accepted syntax. Long lists offer an explicit numbered Search choice before the numbered results; the selection input is never interpreted as a search query. Numbered choice prompts list `back` (when a previous step exists) and `cancel` as controls. Text and secret prompts accept those words as literal data. Accessible text input is line-based and never depends on Escape or Up delivery; Ctrl+C or EOF cancels, with masked handling for secrets. Before consequential work, offer a numbered review/change-answer path that preserves non-secret answers; secrets are re-entered when needed. Rich prompts may additionally use Escape to cancel and a documented Up binding to go back.

### Format compatibility

[Logs](commands.md#logs) and [Traces Search](commands.md#traces-search) retain their existing JSONL output in non-interactive mode, including detected agents. Their owning contracts define records and errors. Other commands MUST NOT infer a machine format from non-interactive mode. A migration of these exceptions requires an explicit compatibility change and tests.

## 6. Prompts and Consent

### When to prompt

Prompt only for data that can't be inferred, a real choice between valid options, a confirmation the consequence requires, or one optional offer after the result (interactive human mode only). Every prompt has an option, argument, or stdin equivalent, which the non-interactive error names. NEVER ask for intent the invocation already expressed (`Set up and deploy?` after `vercel deploy`).

### Prompt design

- One concept per prompt, as a short question: `Which team?`, `Project name?`, `Environments?`.
- Show resolved context before asking about it. After a preview, ask for the action, not the values: `Link directory to project?`.
- Use a list for several options; add search past about ten. Search may be fuzzy; the selection is exact.
- Defaults are valid and annotated `(default)`. Label detected context as facts; use the explicit focus and checked-state controls in [Color and glyphs](#color-and-glyphs) for choices. Meaning never depends on styling.
- Hints are short and decision-relevant, beside the prompt or on the next line.
- Rich arrow-key multiselects share bindings across commands: Space toggles a focused choice; Enter confirms a valid selection. Searchable lists have a separately labeled query field and choices region, visible focus, and Tab to move between them. Focus starts in the query: printable input edits it, Space enters a space, and Enter moves to choices. Selection keys act only in choices. Bulk actions, when offered, use explicit controls naming their scope and count, never printable letter shortcuts. Show the current bindings and selected count; refuse an empty required selection. Filtering or clearing a query never changes explicit selections, including hidden ones. Accessible text selection follows [Modes](#5-modes).
- Secret input is masked.
- Escape and Ctrl+C [cancel](#classes); Escape never means back. Multi-step lists offer an explicit `Back` choice that preserves previous answers. A text prompt MAY also support Up to return, with that binding shown in its hint; Up in a choice list only moves focus. Show applicable back and cancel controls in the legend.
- **Multi-step flows** (three or more questions) summarize the answers before the first mutation, and after success print the equivalent non-interactive command under `Run this again without prompts:`. Replayed commands never contain values typed at a prompt; they use `--value -` or a placeholder.
- Prompts render on stderr through `client.input` (`src/util/input/`).

### Consent

| Consent tier                                                                                                                                                                                                      | Interactive                       | Non-interactive                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ordinary:** explicit, reversible, or narrow (add a variable, update a setting, `--force` replacement of one target named in argv)                                                                               | No confirmation                   | Runs                                                                                                                                                                                                             |
| **Destructive:** data loss, access changes, [purchases](#purchases-and-billing-changes), many resources, taking a domain or alias from another project, transferring ownership, pausing a project, leaving a team | Preview, then `…? (y/N)`          | Requires `--yes`                                                                                                                                                                                                 |
| **Severe:** irreversible loss of a project, team, store, or all of a resource's data                                                                                                                              | Preview, then type the exact name | Requires `--yes`, the target in argv (never inferred from the link), and an explicit team (`--scope` or `VERCEL_ORG_ID`, never the link, `vercel.json`, or the current team) unless the user belongs to only one |

- **Preview** the exact target and each downstream effect on its own line. End with `This cannot be undone.` when the action is irreversible, or `Some effects cannot be undone.` when only a side effect is. Add nothing when everything is reversible.
- Name counts, never "selected": `Remove 5 DNS records?`.
- **The severe prompt** is `To confirm, type the <noun> name "<name>":`, and the answer must match exactly. A mismatch names the expected form (`Type only the project name "acme-web".`); never silently reprompt or accept a different target.
- **`--yes`** answers yes/no confirmations. It accepts a default only when argv and local state fully determine it and help documents it as `(default: X)`. It never chooses between ambiguous targets, supplies missing data, or overrides permissions.
- **`--yes` in an interactive session** skips a confirmation only when the input its non-interactive tier requires is also present (the target and team for severe work; the team and `--amount`, or the plan option, for a purchase); otherwise explain which explicit inputs are missing and the prompt still runs.
- **`--force`** overrides a refusal the command makes by default (a conflict, an existing resource) by replacing it or running again. On one target named in argv, `--force` is also consent for that replacement. Bulk replacement, an inferred target, taking something from another project, and severe actions still need `--yes` in non-interactive mode. This holds even when the replaced value can't be recovered (a file, a Secret value); the receipt shows a `Replaced` row.
- **Tier a new command by its effect**, not its name: deleting or emptying anything that holds user data (a store, a queue, a database) is severe; deleting an empty or configuration-only resource is destructive; canceling one named in-flight operation is ordinary; canceling many, or a purchase, is destructive; [usage on the current plan](#usage-on-the-current-plan) is ordinary.
- **Explicit production changes** (`deploy --prod`, `promote`, `rollback`, and flag `set`, `split`, or `rollout` with `--environment production`) need no extra confirmation, because the command itself states the intent. This never covers taking a domain or alias from another project. An inferred target (`rollback` with no argument) is previewed first, and required in argv in non-interactive mode.
- NEVER add blanket confirmations to ordinary writes; confirmation fatigue trains people to say yes.

### Usage on the current plan

Within the account's current plan, an action that only adds usage is ordinary, however that usage is billed: deploying, adding a project, enabling a usage-billed feature such as Web Analytics, or turning on Observability Plus for a project on a team that already has Observability Plus. Enabling an entitlement already included in an Enterprise contract is not a purchase when it does not change the subscription; classify independent security, access, or destructive effects under [Consent](#consent). Resolve actual entitlement and charge changes rather than classifying by feature name. Spending more on a plan the account already has needs no ceremony; becoming a customer, or changing what the account buys, does.

- It runs with no confirmation, `--yes`, price preview, or charge warning, and needs no team beyond ordinary [team selection](#context-and-authentication).
- Plan limits belong to the API. A blocked action fails as [Limit or plan](#classes) (`plan_limit`); the CLI never pre-checks or guesses a limit.
- Purchases instead include: upgrading or changing a plan, `billing buy` (an add-on, credits, or Pro), starting a paid Speed Insights Plus subscription for a Pro project, buying or renewing a domain, starting a paid Marketplace integration, or changing how the account pays. Those follow [Purchases and billing changes](#purchases-and-billing-changes).

### Purchases and billing changes

A purchase is a command that starts, changes, renews, or cancels a charge beyond [usage on the current plan](#usage-on-the-current-plan) (`domains buy`, `domains renew`, `billing buy`, a paid integration or plan). It is at least destructive. Before consent it shows every fact that could change a reasonable person's decision: the [price](#time-numbers-and-units) (including tax or usage-based parts when known), when charges start, which payment method is charged, what renews and when, and whether it can be canceled or refunded and when that takes effect. None of these lives only behind a docs link.

- In non-interactive mode, a purchase requires `--yes` and an explicit team (`--scope` or `VERCEL_ORG_ID`) unless the user has only one. One that charges now also requires `--amount <USD>` (the total charged now, including known tax); a usage-based one instead requires the option selecting its plan or rate.
- `domains buy` and `domains renew` charge a quoted fixed price, so `--amount` equal to that price is their consent and they take no `--yes`; they still require an explicit team (`--scope`, or `VERCEL_ORG_ID` set to the team charged; `vercel.json` `scope` doesn't count, since any contributor can change it), and `domains buy` an explicit `--auto-renew` or `--no-auto-renew`, since auto-renew starts a recurring charge. Without those they charge nothing and return the price, renewal terms, and the exact command to run once a person approves the price. `domains buy` takes registrant details as options, and `--use-billing-details` fills the rest from the team's billing info, which the first response lists for the person to confirm.
- A missing `--yes`, `--amount`, or plan option fails with `confirmation_required`, a missing team with `missing_scope`, and an amount that doesn't match the current price with `price_changed`. None of these charges anything.
- Purchases send an idempotency key when the API accepts one. The domain registrar doesn't, so `domains buy` and `domains renew` never retry the charge request and report `unknown_outcome` when they can't confirm it. The receipt and JSON result include `charge: { "amount", "currency" }`. `domains price --json` and a purchase's `--dry-run` return the exact `amount` to pass back.

## 7. Human Output

### Streams

- **stdout carries the answer.** For a query, that's its data (tables, detail views, values). For a mutation, it's the **stdout identifier** (the first form listed in the noun's [identity](registry.md#1-nouns), printed bare), printed in human format when stdout isn't a TTY or the run is non-interactive, so `url=$(vercel deploy)` works; in an interactive TTY session the receipt already shows it, and with `--json` the document replaces it. A secret the user asked for (a new token) prints alone on stdout in its place, after any CI [`::add-mask::`](#ci). Commands that change local state (`link`, `teams switch`) count as mutations of the selected resource. The stdout identifier prints only on exit `0` (including acceptance); on failure the ID goes in the error's ID rows or `data`.
- **stderr carries everything else:** context, receipts, progress, prompts, warnings, errors, and next steps.
- Write results with `client.stdout`. The `output.*` helpers (`src/util/output/create-output.ts`) write to stderr. stdout is never interleaved with animation.

### Flow

Use only the phases the task needs, in order: **context** (the resolved target, when it was inferred and the result depends on it) → **input** → **preview** (destructive work) → **work** → **result** → **next**. Context and preview avoid restating a value already visible in argv, a prompt answer, or a nearby row, except when the consent or pinned-context rules require it. A receipt MAY repeat its target and the saved values.

After work or logs, the final result block SHOULD lead with the actual outcome and the primary usable destination or target, then supporting facts and one useful next action. Keep it short enough to find beside the returned shell prompt. This does not delay an early URL or ID that helps someone follow ongoing work: label that work as pending, and keep its final status explicit. A fast read needs no separate success ceremony above its data.

Resolve competing conventions in this order: truthful outcomes and safe recovery; stream and machine contracts; readable identity, state, and action at the available width; then gutter, emphasis, and color. A visual convention never justifies hiding required information or changing an operation's meaning.

### Layout primitives

Reuse `src/util/output/` before adding dependencies or hand-padding. For ordinary human result, detail, and status blocks in rich presentation, columns 0 and 1 are the **gutter**: column 0 holds a semantic glyph or a space, and content starts at column 2. Help headings and usage, tabular column layouts, and prompt-library choice lists have their own layouts; do not add a status gutter to them.

| Primitive                                    | Use                                                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `printAlignedLabel()`                        | Label/value rows: 2-character gutter; standard wide layout uses a 16-character label column; see width fallback below |
| `table()`                                    | Borderless collection tables                                                                                          |
| `output.print()`                             | Designed human lines on stderr                                                                                        |
| `output.fatal()`                             | The `✗` error headline; the caller still returns the exit code                                                        |
| `output.warning()`                           | The `!` warning line. The legacy `output.warn()` prints a `WARNING!` banner; don't use it in new code                 |
| `output.spinner()`                           | Indeterminate work                                                                                                    |
| `progress()` (`src/util/output/progress.ts`) | Work with a real current and total                                                                                    |
| `cmd()`, `param()`, `code()`, `highlight()`  | Styling for commands, values, and emphasis                                                                            |

Gutter glyphs:

| Gutter | Meaning                                    | Use                                                                                     |
| ------ | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| blank  | Context, preview, secondary rows, progress | Most rows                                                                               |
| `✓`    | The one primary completed result           | Once per completed operation; never on discovery, pending, or queued work               |
| `▲`    | Production                                 | Once beside the primary production destination; see [Deploy output](commands.md#output) |
| `!`    | Warning                                    | Nonfatal condition that needs attention                                                 |
| `✗`    | Fatal error                                | The error headline                                                                      |
| `?`    | Prompt                                     | Rendered by the prompt library                                                          |

- Aligned-row labels are stable and have no trailing colon. Related rows are contiguous; one blank line separates phases. Alignment is local to a related block, never a reason to pad the whole screen to its longest label.
- The primary outcome gets emphasis. Supporting labels and values use the [semantic color roles](#color-and-glyphs), normally the default foreground; do not bold an entire detail block. A value needed to choose a target, understand a consequence, copy an identifier, or recover from failure is never muted.
- The gutter marks the meaning of a row, not decoration. Production always has a text label; `▲` never substitutes for it. No boxes, trees, rules, or ASCII art around ordinary results; reserve structural lines for data that needs them, such as a diff or code frame.
- A heading above rows is standalone (`Found existing project`), never a fake label/value row; use the shared [typography](#typography-and-hierarchy).
- No emoji in primary rows. In rich presentation, no `> ` output/log/status prefixes (prompt-library focus pointers are allowed), `Error:` headline prefixes, `WARNING!`, `Success!`, or `Ready!` banners.

### Reference transcripts

Human output on a TTY; context, receipts, and hints are on stderr, tables on stdout.

**List**

```
$ vercel deployments list
  Project         acme/acme-web

  Age   URL                                  Environment   Status   Duration
  2m    acme-web-4f2k9x1-acme.vercel.app     Production    Ready    41s
  1h    acme-web-8h3j2a0-acme.vercel.app     Preview       Error    12s

  Next page:
    vercel deployments list --next cGFnZToy
```

**Add**

```
$ vercel dns add example.com --name www --type CNAME --value cname.vercel-dns.com
✓ Added           www.example.com
  Type            CNAME
  Value           cname.vercel-dns.com
  Record ID       rec_5hG2kx
```

**Severe destructive**

```
$ vercel projects delete acme-web
  Project         acme/acme-web

  Deletes the project and its 214 deployments.
  Removes example.com and www.example.com from the project.
  This cannot be undone.
? To confirm, type the project name "acme-web": acme-web

✓ Deleted         acme-web
```

**Error**

```
$ vercel deploy --prod --non-interactive
✗ Can't deploy without a team in non-interactive mode. 3 teams are available.

  Pass the team with --scope:
    vercel deploy --prod --scope <TEAM>
```

**Empty**

```
$ vercel domains list --project acme-web
  No domains in acme/acme-web.

  Add one:
    vercel domains add <DOMAIN> --project acme-web
```

### Tables and detail views

- **Tables** show the columns needed to recognize and act on a row, including the identifier the next command needs, in a stable documented order (usually newest first). Record the required identity, state, and action fields in the command's design record; all survive the compact-record fallback. Until those fields are declared, keep every displayed field in that fallback.
- **On a non-TTY stdout**, tables keep the header, separate columns with one tab, never truncate or pad, and use [ISO times](#time-numbers-and-units), so `grep`, `cut`, and agents read them reliably.
- **Detail views** use aligned rows under standalone headings styled by [Typography and hierarchy](#typography-and-hierarchy), showing the fields people act on; `--json` has the rest.
- Never truncate the only usable ID, URL, path, or command. Truncate optional descriptive columns with `…` first. If required identity and status columns still cannot fit, switch a TTY table to compact records with the same required fields, one record per block. Never turn this into one wide blank-padded row per field. Non-TTY output keeps its documented width-independent format.
- For [partial results](#classes), human output may summarize successful targets; JSON retains each target's outcome. Recovery inspects uncertain work before repeating it; never suggest rerunning a mutation with `--json` merely to obtain a fuller report.
- A list inside a receipt, detail view, or error shows at most 5 items, then `and 12 more`, then the command that lists them all.
- Activity rows read `<actor> <past-tense verb> <resource> [<qualifier>]`: `jane@example.com deleted project acme-web`, `[Vercel CI] deployed dpl_x7hB2k to Production`. System actors go in brackets.

### Empty states

An empty collection is success (exit `0`); a missing parent, ambiguous selector, denied access, or failed request is not. In human mode the prose goes to stderr and a non-TTY stdout gets only the table header; with `--json`, stdout gets the empty document and nothing else. Zero reads as `No deployments`, never `0 deployments`.

| Kind               | Copy                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| No results         | One filter: `No <items> match this filter. Remove <option> to see all <items>.` Several: `No <items> match these filters.` plus how to widen them |
| First use          | The scope, then the command that adds the first item: `No domains in acme/acme-web.`                                                              |
| Partial visibility | `Showing projects you can access in acme.`                                                                                                        |

A plan-gated or permission-denied read is an [error](#classes), not an empty state.

### Typography and hierarchy

Use wording and reading order first, spacing second, then weight and hue. A transcript remains understandable with all styling removed.

| Element                                       | Treatment                                                            |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Primary outcome                               | Bold foreground; one clear outcome before supporting facts           |
| Section headings                              | Bold ANSI magenta in help; short labels; no dim headings             |
| Synopsis prefix `▲` and other synopsis labels | Bold foreground                                                      |
| Row labels, descriptions, defaults, values    | Normal foreground; align related rows without emphasizing every cell |
| CLI reference names and options               | Bold foreground; positional and value hints stay normal foreground   |
| Primary destination                           | Full foreground URL with underline; ordinary URLs remain unstyled    |

- The introductory help description uses faint text in rich output. Mark descriptions that contain essential consequences or prerequisites with `descriptionTone: 'normal'` so they remain normal foreground; never infer importance from their wording at runtime. Only that overview is de-emphasized; command and option descriptions, value hints, examples, and constraints elsewhere stay normal foreground. Disabling styling preserves its full text.
- Use the terminal's font, size, foreground, and background. No hard-coded white, black, gray, font, or background fill for ordinary output.
- One blank line separates logical blocks; related rows stay contiguous. A label and its value, or an example and its description, stay together. Do not add blank lines merely to emphasize a heading.
- Help uses flush-left headings ending in `:`; ordinary result blocks use the two-column gutter. Prompts use explicit controls. Do not mix these layouts.
- TTY table headers MAY use bold foreground. Bold marks hierarchy, reference command names and options, and consequential targets; not descriptions, placeholders, or values. No italics, blinking, reverse-video blocks, or decorative underline in ordinary output.
- Inline command references use exact normal-foreground text enclosed in literal backticks, including help pointers. They never inherit command cyan. A command offered as a standalone action gets its own indented line without backticks or prompt punctuation.
- Required context, consequences, prices, IDs, choices, and recovery never use faint text. Optional metadata is foreground by default. De-emphasize positional and value hints by leaving them normal weight beside bold reference names; never dim them or choose a fixed gray.

### Color and glyphs

Color distinguishes stable roles; it does not supply missing information or priority. Every status has explicit text. Every command retains its exact text without styling.

| Role      | Treatment                                            | Boundary                                                                                                                                                                                                                                                                                         |
| --------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Heading   | Bold basic ANSI magenta                              | Help section titles and root task-group headings only, including an inline `Global Options:` label. The synopsis prefix `▲` stays bold foreground. Keep the colon and layout so hierarchy survives color removal. No product RGB, backgrounds, or per-command colors.                            |
| Reference | Bold foreground                                      | Command names, aliases, and option spellings in help lists and usage. Placeholder/value hints, separators, defaults, inline mentions, and descriptions stay normal foreground.                                                                                                                   |
| Command   | Basic ANSI cyan, normal weight                       | Complete concrete command offered in an example or next step, including options, quotes, and values. Templates requiring substitution stay entirely foreground; angle brackets identify replaceable input. Do not infer a shell grammar. Color promises neither success, safety, nor permission. |
| Success   | Green marker                                         | Completed or Ready only; outcome text foreground. Never accepted, queued, selected, or partial work.                                                                                                                                                                                             |
| Warning   | Yellow marker                                        | A consequence requiring attention; not routine progress or Production by itself.                                                                                                                                                                                                                 |
| Failure   | Red marker                                           | Error headline bold foreground; diagnostics and recovery never inherit red. A completed delete is success.                                                                                                                                                                                       |
| Focus     | Optional cyan pointer; focused label bold foreground | Separate from command examples and checked state. `> [ ] Preview` is focused but unchecked; `  [x] Production` is checked but unfocused. Single-select uses no checkbox.                                                                                                                         |
| Link      | Foreground; underline primary destination            | Full URL remains visible and copyable. Links do not inherit syntax or status hues.                                                                                                                                                                                                               |
| Muted     | Foreground by default                                | Faint styles the introductory help description and MAY style truly optional metadata; other required information stays normal foreground.                                                                                                                                                        |

- **One owner:** shared semantic roles in `src/util/output/` own styling. Commands never choose raw colors, ANSI escapes, or RGB values. Resolve capabilities per destination; stdout and stderr never share a mutable color level. Migrate each shared renderer and every caller together; existing global output helpers remain separate compatibility work.
- **Palette:** use the user's basic ANSI palette and default background. Magenta marks help navigation; cyan marks concrete commands. Neither is a contrast guarantee: sampled light palettes can give accents weaker contrast than foreground. Record actual light/dark values against the 4.5:1 ordinary-text review benchmark and report failures; do not call this universal terminal WCAG conformance. No ANSI hue works across arbitrary palettes. Foreground emphasis is the neutral fallback. Do not invent profile detection, guess a background from color support, rewrite a palette, or block commands on color queries. A supported explicit theme mapping may replace a role centrally. Bold-as-bright and faint vary by emulator; neither repairs contrast. The ANSI default accepts the theme tradeoff; an unstyled opt-out preserves access but does not prove the colored default legible.
- **Restraint:** body text, names, IDs, paths, prices, environments, ordinary table cells, and routine progress stay foreground. Do not recolor logs, child output, remote text, or product color data. No gradients, brand banners, or decorative backgrounds. Diffs retain `+`/`-` and change labels; removal is not an operational failure.
- **Preferences:** target precedence is `--no-color` → nonempty `NO_COLOR` → `FORCE_COLOR` → per-stream detection. Empty `NO_COLOR` is unset; `0` and `false` are nonempty. `FORCE_COLOR=0` disables; `1`, `2`, and `3` permit static color. A rich TTY may retain bold/underline with color disabled; fully plain presentation removes all styling. Forcing color never enables prompts, animation, rich layout, or hidden links. Plain diagnostic color is limited to the `Warning:` or `Error:` prefix; plain help stays unstyled. Do not change unrelated callers' preference contracts as a side effect.
- **Machine output:** JSON, requested secrets, stdout identifiers, plain-value protocols, and non-TTY tab-separated tables never contain styling, including under forced color.
- **Lossless removal:** disabling color preserves text, glyphs, indentation, order, values, and streams in the same presentation. Fully plain presentation has its own layout; it preserves meaning and exact data. Verify both with the [presentation checks](#presentation-checks).
- **Glyphs:** use `src/util/output/chars.ts` with ASCII UI fallbacks for plain and accessible presentation, not just Windows. `NO_COLOR` alone does not select ASCII. Rich success uses `✓`; plain status rows start at column 0 with explicit outcome words. A result with a target reads as a sentence (`Added API_TOKEN`), never merely a rich padded row with its glyph deleted. Plain `Warning:` and `Error:` prefixes retain the headline. Non-status rows, including Production, and continuation rows retain the two-space body indent; user data is never transliterated. Typography such as `…` has a plain `...` equivalent.
- **Links:** OSC 8 MAY wrap a full visible URL on supporting TTYs, never in non-TTY or JSON output.

Color resolution examples (target contract; evaluate each destination independently). Empty `NO_COLOR` is unset. Unlisted inputs use shared capability detection; call sites never invent precedence.

| Format / destination                                     | Explicit preference                  | Color                | Presentation                              |
| -------------------------------------------------------- | ------------------------------------ | -------------------- | ----------------------------------------- |
| JSON, any destination                                    | Any                                  | Never                | Machine contract                          |
| Human, any destination                                   | `--no-color`, even with force        | Off                  | Unchanged                                 |
| Human, any destination                                   | Nonempty `NO_COLOR`, even with force | Off                  | Unchanged                                 |
| Human, any destination                                   | `FORCE_COLOR=0` alone                | Off                  | Unchanged                                 |
| Human, rich TTY                                          | `FORCE_COLOR=1`, `2`, or `3` alone   | On                   | Rich                                      |
| Help, pipe or `TERM=dumb`                                | Any, including force                 | Off                  | Plain help                                |
| Human prose, pipe or `TERM=dumb`                         | `FORCE_COLOR=1`, `2`, or `3` alone   | Static ANSI color on | Plain layout; no other styling or redraws |
| Stdout identifier, secret, plain value, or non-TTY table | Any                                  | Never                | Documented data contract                  |
| Human, rich TTY                                          | No override                          | Automatic            | Rich                                      |
| Human, pipe or `TERM=dumb`                               | No override                          | Off                  | Plain                                     |

The reviewed [Windows Terminal defaults](https://raw.githubusercontent.com/microsoft/terminal/main/src/cascadia/TerminalSettingsModel/defaults.json) gave cyan/background ratios of 6.14:1 (Campbell), 5.91:1 (One Half Dark), 3.30:1 (One Half Light), and 2.93:1 (Solarized Light). These are opaque sRGB calculations from a published palette snapshot, not measurements of a user's terminal; the light cases fall below the ordinary-text benchmark. A fresh check of the same source gives magenta/background ratios of 2.44:1 (Campbell), 4.75:1 (One Half Dark), 5.86:1 (One Half Light), and 4.21:1 (Solarized Light). Campbell and Solarized Light fail that benchmark; bold does not repair contrast. The heading accent respects the user palette but cannot guarantee readability across themes.

The role assignments above are Vercel design decisions. Supporting references: [CLI Guidelines: intentional color](https://clig.dev/#output), [GitHub Primer: CLI accessibility](https://primer.style/accessibility/foundations/cli-accessibility/), [NO_COLOR](https://no-color.org/), [Microsoft: terminal palette and SGR behavior](https://learn.microsoft.com/en-us/windows/console/console-virtual-terminal-sequences#text-formatting), and [W3C: text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

### Width and platform

- Measure the destination stream's terminal width (80 when unknown, including non-TTY help), excluding ANSI and accounting for Unicode display width. At 40, 80, and 120 columns, prose wraps without overlap or clipping. Do not spread a readable block across the full width merely because space exists.
- The standard aligned-row layout places values at column 18. When a label/value pair will not fit, put the value on the next line with the body indent; wrap prose there. Measure labels by display width, not string length. The shared glyph resolver must also account for ambiguous-width symbols in supported terminal profiles: when a glyph cannot reliably fit its fixed gutter or status slot, use its ASCII fallback. Locale alone does not prove a terminal's width behavior; include an ambiguous-as-wide/CJK profile in validation. The fixed label width is a wide-layout default, not a minimum at every width.
- Preserve complete commands, URLs, IDs, and paths. First move an overlong value onto its own line with minimal indentation. If a token still exceeds the terminal width, allow terminal soft wrapping without inserting newlines, spaces, hyphens, or ellipses into it. CLI-emitted commands never insert shell continuations. Preserve indentation and line breaks inside code and structured input; only prose reflows. Verify copying long tokens from a real terminal; a browser mockup cannot prove clipboard behavior.
- Do not add trailing padding at line ends. Paths display in the platform's native form.

### Time, numbers, and units

- **Ages** in tables: relative under 7 days (`2m`, `5h`, `3d`), absolute after (`Mar 5, 2026`). Detail views: absolute local time with timezone, plus age where useful (`2026-09-28 14:03 PDT (2h ago)`). Billing, activity, and non-TTY output: ISO 8601 UTC.
- **Durations:** compact in tables (`42ms`, `3.4s`, `2m 10s`), spaced in prose (`42 ms`).
- **Cron** shows the expression and a library-generated reading: `*/5 * * * *  (every 5 minutes)`.
- **Money:** `$` with no space. Prices, charges, and receipts show cents (`$20.00`, `$0.40`); summaries may round (`$20`).
- **Counts:** numerals with correct plurals (`1 project`, `3 projects`), never `project(s)`. Commas at 1,000 and up; `12.5K` only in summaries at 10,000 or more; exact numbers in billing.
- **Sizes:** decimal units (`MB`); binary (`MiB`) only for literal memory.

### Next steps

- A **next step** is derived from current state and shows every time that state applies. Offer one, or one `Next steps:` list of independent actions, required recovery first. Each states its benefit, then the [command](#examples-and-suggestions).
- Suggestions are verified against current state. While remote work may still be running, suggest checking status, never retrying.
- Optional steps respect `VERCEL_GUIDANCE_DISABLED` and user settings; required recovery always shows.

### Tips

A **tip** (completion setup, a new feature, a better command for what the user did) is useful once.

- At most once per user (recorded in the CLI config directory) and one per run.
- Only after exit `0` in interactive human mode with no detected agent, after the result, on stderr: never in CI, non-interactive mode, or `--json`. Tips, update notices, and optional offers share this gate.
- One line starting `Tip:` in the secondary-metadata role, then a command line in the shared command role if there is one. Never delays, prompts, or changes the exit code. Respects `VERCEL_GUIDANCE_DISABLED`.
- Anything that needs attention every time is a [warning](#warnings), not a tip.

## 8. Progress and Long-Running Work

- **Feedback** appears within 100 ms of starting slow work. A spinner names its phase (`Uploading files…`); a progress bar needs a real total; percentages are never invented.
- **Animation** runs only with rich presentation in interactive mode. Elsewhere, each phase change prints once as a plain line, and a byte transfer also reports at each additional 10% or after 30 seconds without an update, whichever comes first, but no more than once every 10 seconds: `Uploading big.mp4… 800 MB of 2.0 GB (40%)`. Progress clears before results, prompts, or errors, never spins over logs or child output, and parallel work shares one indicator.
- **Stalled, not failed:** past its usual duration, work says so once: `Still <verb>ing. Most <operations> finish within <duration>.` When waiting on something external, name it: `Waiting on DNS propagation. This can take up to 48 hours.` Never `This might take a while`. Resource IDs and status links may appear as soon as they exist so someone can inspect ongoing work; support Request IDs appear only on failure.
- **Bounds:** every finite operation has request timeouts, a retry budget, and a bound on total waiting, including polls that keep returning a non-terminal state. Commands that wait support `--timeout` and state its default.
- **Retries** cover only transient failures, with backoff, honoring `Retry-After`. Reads (`GET`, `HEAD`) retry automatically. A mutation retries only when its endpoint documents idempotency or supports an idempotency key reused with the same payload; otherwise a 5xx or network failure after sending is Unknown outcome. In human mode while retrying, print `Retrying automatically…`; JSON and JSONL suppress this prose, following their stream contracts. When the budget runs out, the error keeps its class's headline and adds a `Retries` detail row with the count.
- **Async work:** `--no-wait` returns once work is accepted, reports it as accepted, and gives the ID and the status command. Inspect commands for async resources support `--wait` (with `--timeout`) to block until the terminal state. A compound operation reports only phases that actually completed. `--wait` exits as the originating command would (a failed build is `build_failed`, exit `1`); any wait, including deploy's, that reaches `--timeout` exits `1` with `reason: "timeout"`, the status command, and the [remote-operation evidence](#remote-operation-evidence) when applicable. `--timeout` with `--no-wait` is a usage error.
- **Follow modes** (`--follow`, dev servers) run until stopped and never buffer an unbounded stream.
  - After a disconnect they print `! Lost connection. Retrying automatically…` once and reconnect with backoff capped at 30 seconds. After reconnecting, they warn once about the gap (`stream_gap`); after 5 minutes without reconnecting, they end with a Network error. With `--json`, only the `stream_gap` warning line is emitted.
  - Ctrl+C stops purely observational follow modes after cleanup with no extra output; a command that started remote mutations follows the Interrupts rule ([exit codes](#11-exit-codes)).
  - `--follow` accepts `--timeout`; a purely observational follow window ends at that timeout with exit `0`. A mutation-starting invocation waiting for completion follows the Async work timeout rule. In CI, `--follow` without `--timeout` fails as Missing input (`missing_timeout`).
- **Interrupts:** the first Ctrl+C stops local work and restores the terminal; a second exits immediately. `SIGTERM` and `SIGHUP` get the same bounded cleanup. [Exit codes](#11-exit-codes) apply. When a remote mutation finished, may continue, or creation is unknown, lead with `Stopped waiting.` followed by the confirmed facts and provide the shared [remote-operation evidence](#remote-operation-evidence). NEVER claim remote work was canceled because local waiting stopped.

### Remote-operation evidence

Cancellation, a timeout after submission, and `unknown_outcome` use one evidence model. Report only confirmed facts: no request was sent or creation was rejected (`No deployment was created.`); a resource was created (show its ID and last confirmed state; if not confirmed terminal, note it may continue remotely); or creation is unknown (`Can't confirm whether a deployment was created.`). A timeout uses the error-class headline and states that waiting timed out; it never implies the resource failed or was undone.

In JSON errors, `data.remote` is `"none"` (the requested remote operation was not started or creation was rejected), `"finished"` (it is confirmed terminal; retain the resource and confirmed state), `"may_continue"` (it is known to exist but not confirmed terminal), or `"unknown"` (whether it was applied cannot be confirmed). Retain known resource objects/IDs and last confirmed state, plus an operation ID or supported idempotency key when available. A timeout after known creation sets `retryable: false` for the originating mutation and suggests inspecting that resource; other retries still follow [Retries](#8-progress-and-long-running-work).

Recovery uses the standard [recovery layout](#anatomy): inspect the known ID; without one, list in the resolved team/project and follow pagination. Absence from one page never proves creation failed. Do not suggest resubmitting uncertain work. For a remote-mutating command that is forcibly terminated without its promised final document, missing output is no evidence of `"none"`: retain earlier acknowledged facts and inspect or list before another action.

## 9. Errors and Warnings

An error tells a person or agent what failed, why, and exactly what to do next. It follows the shared [typography](#typography-and-hierarchy) and [semantic roles](#color-and-glyphs). It never guesses a cause, blames the user, or hides partial work.

### Anatomy

```
✗ <Headline: what failed, then the known cause.>
  <Detail or issue rows>
  <Context rows>
  <ID rows>

  <Recovery instruction>:
    <command>
```

| Part     | Rule                                                                                                                                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Headline | Via `output.fatal()`. The failed action and its exact object, then the known cause, in 100 characters or fewer when possible: `Couldn't find project acme-wbe in acme.`                                                                                                            |
| Detail   | What the headline can't hold: each validation issue, a code frame, the API's own message                                                                                                                                                                                           |
| Context  | Facts needed to act or report: an inferred `Team` or `Project`, `File`, `Limit`, `Docs`                                                                                                                                                                                            |
| IDs      | Rows in the default foreground, labeled per the [ID registry](registry.md#ids), last so they're easy to copy. Resource IDs needed for recovery remain visible; support Request IDs only on Platform, Network, and Unknown outcome errors                                           |
| Recovery | After a blank line: an instruction ending in `:` and the command (or a URL) indented 4 spaces. At most two options, likeliest first. A plain sentence when no command applies. Never "try again" alone: give the command to rerun, or the status command if the outcome is unknown |

- Omit parts with nothing true to say. Aim for at most 8 logical text lines outside issue lists and code frames, excluding blank lines and terminal wrapping. Required context, consequences, IDs, and safe recovery take priority over this budget.
- A blank line separates the error from output already printed. Continuation lines indent 2 spaces.
- NEVER a status code in the headline, a raw API payload, or a stack trace outside `--debug`.

### Classes

Every failure has one class, which fixes its headline formula, `reason` family, and exit code.

| Class           | Headline formula                                                                                                                                                                    | Example `reason`                                         | Exit |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---- |
| Usage           | `Unknown option --x for vercel <cmd>.` / `Can't use --a with --b.` / `Can't <verb> <object>. <n> <inputs> are invalid.` / `Unknown command <segment> for vercel <path>.`            | `invalid_arguments`, `unknown_option`, `unknown_command` | `2`  |
| Missing input   | `Can't <verb> without <thing> in non-interactive mode.`                                                                                                                             | `missing_scope`, `confirmation_required`                 | `2`  |
| Authentication  | `You're not logged in.` / `Your login expired.`                                                                                                                                     | `login_required`, `token_expired`                        | `1`  |
| Permission      | `Only team <role>s can <verb> <object>. Ask a team <role>.` / `As a <role> on <team>, you can't <verb> <object>. A <role> role is required.` / `This token can't <verb> <object>.`  | `permission_denied`, `token_scope_required`              | `1`  |
| Not found       | `Couldn't find <noun> <name> in <team>.`                                                                                                                                            | `not_found`, `project_not_found`                         | `1`  |
| Conflict        | `Can't <verb> <object>. <Conflicting state>.`                                                                                                                                       | `conflict`, `stale_version`                              | `1`  |
| Limit or plan   | `Can't <verb> <object>. <Team> has reached <limit>.` / `Upgrade to Pro to <verb> <object>.` / `Monthly <limit> reached. <What is paused>.`                                          | `plan_limit`, `policy_denied`                            | `1`  |
| Rate limit      | `Too many requests to the Vercel API. Try again in <time>.`                                                                                                                         | `rate_limited`                                           | `1`  |
| Network         | `Couldn't reach <host>. <Cause>.`                                                                                                                                                   | `network_error`                                          | `1`  |
| Platform        | `Failed to <verb> <object>. <Cause>.` / `Build failed.`                                                                                                                             | `api_error`, `build_failed`                              | `1`  |
| Unknown outcome | `Can't confirm whether <operation> finished. <Cause>.`                                                                                                                              | `unknown_outcome`                                        | `1`  |
| Partial         | `<Verbed> <n> of <total> <nouns>. <m> failed.` (add `<k> unknown.` when outcomes are unknown; do not count unknown as failed). When every item fails with one class, use that class | `partial_failure`                                        | `1`  |
| Verification    | `Couldn't verify <URL>. <Known cause>.` The deployment may still be ready; the command reports that state separately                                                                | `verification_failed`                                    | `1`  |
| Config          | `<file>:<line>:<col> <problem>.` / `<file>: <key path> <problem>.`                                                                                                                  | `invalid_config`                                         | `1`  |
| CLI bug         | `Unexpected error in vercel <cmd>. This is a bug in Vercel CLI.`                                                                                                                    | `internal_error`                                         | `1`  |

Other reason codes used in this skill:

| Class                              | Codes                                                                                                                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing input                      | `ambiguous_project` (several linked projects apply), `missing_project`, `env_key_sensitive`, `not_linked`, `missing_name`, `missing_value`, `missing_environment`, `missing_timeout`, `terms_required` (with `userActionRequired: true` and `data.url`) |
| Usage                              | `invalid_environment`, `branch_requires_preview_only`, `missing_command`                                                                                                                                                                                |
| Authentication                     | `sso_required`                                                                                                                                                                                                                                          |
| Conflict                           | `owned_by_another_team`, `env_file_exists`, `price_changed`, `port_in_use`, `stale_link`, `effects_changed`                                                                                                                                             |
| Platform                           | `cli_outdated`, `spawn_failed`                                                                                                                                                                                                                          |
| Unknown outcome                    | `timeout` (any wait, including deploy's, that reached `--timeout`)                                                                                                                                                                                      |
| Canceled (exit `130`, not a class) | `canceled` (JSON only)                                                                                                                                                                                                                                  |

- **Verbs:** `Can't` for a present blocker, `Couldn't` for an attempt that didn't succeed, `Failed to` for system or build failures.
- **Permission:** name the blocked action and object and route to the resolver. When the API's required-access check returns the user's role and a recommended role, say both: `As a viewer on acme, you can't update example.com. A developer role is required.` Never infer a role from a list of roles.
- **Plan:** route to the upgrade; Enterprise-only features route to sales.
- **Owned by another team:** when a resource is publicly identifiable (a domain), it's a Conflict (`owned_by_another_team`), not a permission error, because the user's own team owners can't resolve it. Name the alternatives in the recovery: `Can't add example.com to acme-web. Another team owns it.`, then use a different domain or ask the owning team to transfer it.
- **Third-party auth:** name the provider and cause: `Your GitHub connection expired.` (reconnect), `GitHub uninstalled the Vercel app.` (reinstall), `The repository was deleted on GitHub.` (connect another).
- **Not found:** stay within the caller's team and never reveal that a private resource exists elsewhere. Suggest one in-scope, unambiguous match (`Did you mean acme-web?`), and never act on it. In JSON, the suggestion goes in `data.suggestion`, never in `next` or in a runnable destructive command.
- **Limit:** state the verified limit and supported remedies, never a guess.
- **Rate limit:** shown only when the [retry budget](#8-progress-and-long-running-work) runs out.
- **Network:** name the host; honor `HTTPS_PROXY`, `NO_PROXY`, and `NODE_EXTRA_CA_CERTS`; never fall back to cached remote state.
- **Unknown outcome:** say what may still be happening and recover by inspecting, never by retrying.
- **Canceled by the user is not an error.** Print `Canceled.` only when the requested remote operation did not start or creation was rejected (`data.remote: "none"`); for `"finished"`, `"may_continue"`, or `"unknown"`, use `Stopped waiting.` as specified in [Interrupts](#8-progress-and-long-running-work). Use no glyph (column 2 in rich presentation, column 0 in plain presentation), then what changed (`Nothing was changed.` / `Uploaded files were discarded. No deployment was created.`). Purely observational follow modes and dev servers stop silently instead; an invocation that started remote mutations follows the Interrupts rule. A successful `cancel` command is a normal result: `✓ Canceled`, exit `0`.

### API errors

- Map HTTP status and the API's error `code` to a class, a stable `reason`, and CLI-written copy, in one shared place, never per command.
- API and partner messages never appear in the headline, `message`, or `next`. They appear only in an attributed `Detail` row (`Neon: This database has been suspended for review.`) or JSON `data.remoteMessage`, stripped per [remote text](#files-stdin-and-secrets). A remote name (a project, a domain) appears in a headline or `message` only if it matches its selector's identifier grammar. An API message about a request that carried a secret is never shown; map it to CLI copy.
- An unmapped code becomes a Platform error (`api_error`) with the HTTP status as detail and the Request ID from the `x-vercel-id` header. A 5xx or timeout on a mutation that isn't idempotent (documented or keyed) is Unknown outcome instead, unless the endpoint explicitly guarantees the operation was not applied. A `503`, `429`, or `Retry-After` header alone is not that guarantee; the header controls delay, never permission to replay a mutation. Retry eligibility still follows [Retries](#8-progress-and-long-running-work), consistent with [HTTP semantics](https://www.rfc-editor.org/rfc/rfc9110.html#section-9.2.2).
- **Marketplace partner** errors that are actionable keep the partner's exact words in that `Detail` row, because users need them to get support.
- **Other upstream providers** (payments, Git, AI models) are translated, with a `Provider Error` row for a short code (`card_declined`) when it helps triage.

### Validation errors

Validate all local input before the first request and report every problem at once.

```
✗ Can't import 12 DNS records. 2 records are invalid.
  zone.txt:4      TTL must be a number.
  zone.txt:9      MX records need a priority.

  Nothing was imported. Fix zone.txt, then run:
    vercel dns import example.com zone.txt
```

Issues follow the [5-item limit](#tables-and-detail-views); [JSON](#json-errors) carries all of them.

### Config file errors

Point to the exact location with the source around it ([CI annotations](#ci) may add a GitHub Actions annotation).

```
✗ vercel.json:14:5 isn't valid JSON. Expected "," or "}".
  12 │   "rewrites": [
  13 │     { "source": "/a", "destination": "/b" }
  14 │     { "source": "/c" }
     │     ^
```

Schema errors name the key path and accepted values: `✗ vercel.json: "regions" must be an array of region IDs, like ["iad1"].`

### Usage errors

Name the unknown or conflicting token, suggest at most one close valid alternative without ever running it, and point to help.

```
✗ Unknown option --prdo for vercel deploy. Did you mean --prod?

  See all options:
    vercel deploy --help
```

### Exemplars

```
✗ Your login expired.
  Team            acme

  Log in again:
    vercel login
```

```
✗ Can't create project acme-api. acme has reached the Hobby limit of 200 projects.

  Find projects to delete:
    vercel projects list
  Or upgrade to Pro for more projects.
```

```
✗ Can't confirm whether the deployment finished. The connection closed while waiting.
  Deployment ID   dpl_9x1Kq2

  Check its status:
    vercel deployments inspect dpl_9x1Kq2
```

```
✗ Removed 3 of 5 DNS records. 1 failed. 1 unknown.
  rec_8aj2        Record not found.
  rec_91kd        The request timed out.

  Check whether the timed-out record was removed:
    vercel dns inspect rec_91kd
```

```
✗ Unexpected error in vercel env add. This is a bug in Vercel CLI.
  Error           TypeError in src/commands/env/add.ts
  Version         Vercel CLI 60.1.3, Node.js 22.9.0, darwin-arm64

  Report it, after reviewing the --debug output (it includes team and project names):
    https://github.com/vercel/vercel/issues/new?template=bug_report.yml
```

A bug report link never includes argv values, paths, or tokens, and the `Error` row never includes text derived from input.

### Warnings

- A warning is a nonfatal condition that needs attention; routine information isn't one. It uses the `!` gutter through `output.warning()` (`src/util/output/create-output.ts`), states the consequence, and gives the fix: inline when it's a short sentence (`Use --json.`), otherwise in the [recovery layout](#anatomy).
- A deprecation warning names the replacement and prints at most once per run: `! --format json is deprecated. Use --json.` A deprecated command name warns through `warnDeprecatedSubcommand()` (`src/util/warn-deprecated-subcommand.ts`): ``! `vercel webhooks get` is deprecated. Use `vercel webhooks inspect`.``
- Warning reasons: `deprecated`, `usage_threshold`, `usage_overage`, `stream_gap`, `link_team_mismatch`, `link_tracked`, `link_pin_mismatch`, `insecure_version`, `limit_clamped`, `env_file_tracked`, `env_var_skipped`, `port_fallback`, and `secret_not_returned`. Add new ones to `AGENT_REASON`.
- Human mode prints warnings on stderr. With `--json` they go in the document's `warnings` array, or as `type: "warning"` lines in JSONL.
- NEVER print both a warning and an error for the same condition.
- **Usage thresholds**, each with the command to raise the limit or upgrade:
  - At 80%: `! You've used 80% of your monthly <limit> (<current> of <max>).` (`usage_threshold`)
  - At 100%, a command it blocks fails as Limit or plan (`plan_limit`): `Monthly <limit> reached. <What is paused>.`
  - During billed overage: `! You've exceeded your monthly <limit>. Additional usage is billed at <rate>.` (`usage_overage`)

## 10. Machine Output

`--json` is the machine interface and a contract.

### JSON results

- Every command that reads or changes a resource supports `--json`. stdout then holds exactly one JSON document and a newline; stderr stays empty except `--debug` output, `::add-mask::` lines ([CI](#ci)), and, on failure, the error document. `--follow` switches that invocation to [JSONL](#jsonl-streams), as do [Logs](commands.md#logs) and [Traces Search](commands.md#traces-search).
- Field names and types mirror the Vercel API (camelCase keys, API enums and timestamps), with stable IDs. **Guaranteed fields** are those in the [result schema](#machine-readable-help); other API fields pass through unchanged (except [secret fields](#files-stdin-and-secrets)) and may change with the API.
- Shapes are keyed by resource noun, so top-level fields can be added safely:

| Operation | Shape                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Read one  | `{ "project": { … } }`                                                                                                                  |
| List      | `{ "projects": [ … ], "pagination": { "next": "<cursor>" \| null } }`                                                                   |
| Mutation  | `{ "project": { … }, "outcome": "<verb, past tense>" \| "unchanged" \| "accepted" \| "staged" \| "started" \| "planned" }`              |
| Bulk      | `{ "results": [ { "id": …, "outcome": …, "error"?: { … } } ], "summary": { "succeeded": 2, "failed": 1, "skipped": 0, "unknown": 0 } }` |

- Non-final outcomes have distinct meanings: `accepted` confirms acceptance without waiting for completion; `started` confirms activation of an ongoing operation, not its eventual completion; `staged` saves an unpublished draft; `planned` reports a dry-run plan with no task effects. Schemas identify fields populated only in later states. In a non-terminal result, `null` may mean not yet available; consumers use the documented outcome and resource state, never a nullable field alone, to decide whether to wait.
- Optional top-level fields: `warnings: [{ "reason", "message" }]` and `next: [{ "command", "argv", "when"? }]`, where `when` is the condition for using the command or a note on filling its placeholders. After a mutation, `next` includes the resource's inspect command, or its list command after `delete` or `revoke` or when it has no inspect. JSON `next` ignores guidance settings.
- An empty list is `[]`. Absent-but-known values are `null`, not omitted. Withheld secret fields are omitted, never replaced with `null`; result schemas identify them. Consumers treat their omission as not disclosed, never as unset or permission to overwrite.
- On a TTY, pretty-print with 2-space indentation; otherwise write compact single-line JSON. Consumers never depend on whitespace or key order.

### JSON errors

With `--json`, a failure writes nothing to stdout and exactly one single-line JSON error document to stderr (pretty-printed below for reading). stderr carries nothing else except `--debug` output and `::add-mask::` lines ([CI](#ci)): no progress, receipts, notices, or hints. The exit code is the source of truth. Two exceptions: a normally completed bulk operation with per-item failures writes its bulk result to stdout with no stderr document, and a JSONL stream keeps the lines it already emitted. Such a bulk operation exits `0` only when both `failed` and `unknown` are zero; otherwise `1`. A preflight failure or cancellation uses the standard error document; cancellation after attempts preserves per-item outcomes and the summary in `data`, with the signal/cancellation exit code.

```json
{
  "status": "action_required",
  "reason": "missing_scope",
  "message": "Can't link without a team in non-interactive mode. 3 teams are available.",
  "next": [
    {
      "command": "vercel link --scope <TEAM>",
      "argv": ["vercel", "link", "--scope", "<TEAM>"],
      "when": "Replace <TEAM> with a team slug from data.teams"
    }
  ],
  "data": {
    "teams": [
      { "slug": "acme" },
      { "slug": "acme-labs" },
      { "slug": "acme-oss" }
    ]
  }
}
```

| Field                | Rule                                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`             | `action_required` when blocked before task effects and input, approval, or a human step enables the operation; otherwise `error`. Unknown or post-effect failures stay `error` even when human intervention is needed; `userActionRequired` is independent                                                                                                     |
| `reason`             | Stable snake_case code from `AGENT_REASON` (`src/util/agent-output-constants.ts`); add new codes there                                                                                                                                                                                                                                                         |
| `message`            | The human headline without the glyph. Never parse it                                                                                                                                                                                                                                                                                                           |
| `next`               | Recovery commands, shaped like the result's `next`                                                                                                                                                                                                                                                                                                             |
| `userActionRequired` | `true` when a human must approve or perform a step (approval, browser consent, SSO); `reason` and `next.when` distinguish the required action                                                                                                                                                                                                                  |
| `data`               | Resolved choices and context, `issues` (`[{ "field", "reason", "message" }]`) for validation, and [remote-operation evidence](#remote-operation-evidence) where applicable. API and partner messages, and remote values that fail their selector's identifier grammar, go here, never in `message` or `next`                                                   |
| `requestId`          | When the API provides one                                                                                                                                                                                                                                                                                                                                      |
| `retryable`          | `true` only when repeating the documented command is safe under [Retries](#8-progress-and-long-running-work), preserves the authorized target, and cannot duplicate effects. An unknown outcome is false unless the next invocation can reuse the same supported idempotency key and payload; `next` then gives the exact supported argv, otherwise inspection |
| `retryAfter`         | Seconds to wait when known; a delay hint never grants retry permission. The caller still requires `retryable: true`                                                                                                                                                                                                                                            |

- The exit code comes only from the [class](#classes) (`130` or `128 + n` for `canceled`); `status` never changes it (`missing_scope` exits `2`, `login_required` exits `1`).
- The error document carries `warnings` too, and is always the last line of stderr.
- With `--json`, a cancel or signal writes one error document with `reason: "canceled"` and the shared [remote-operation evidence](#remote-operation-evidence) for a remotely acting command. It exits `130` or `128 + n`; purely observational follow modes write nothing, while mutation-starting follow modes retain the cancellation document and evidence.
- For a destructive or severe operation, `confirmation_required` sets `userActionRequired: true` and puts the preview in `data.effects`. Its `next` entry says `when: "Only after a human approves: <consequence>"`. An agent MUST NOT add `--yes`, or a `--force` that replaces user data, without that approval. For a severe operation, continuation argv selects the stable resource ID and explicit scope when the selector supports IDs. Otherwise it must bind to the same resolved instance through a supported precondition. Include an effects digest when supported; without one, recheck identity and material effects and require fresh approval when they differ or cannot be verified. Use server preconditions for race-sensitive effects. For other operations, the command MAY return `data.effectsDigest`; rerunning with `--effects-digest <DIGEST>` then fails with `effects_changed` (Conflict) if the target or effects changed since the preview.
- The reason codes named anywhere in this skill are these JSON values; in human mode the same condition prints as a human error.
- Build these documents with `outputActionRequired()` and `outputAgentError()` in `src/util/agent-output.ts`. Today they write to stdout, trigger on non-interactive mode, and exit the process; move them to this contract (stderr, triggered by `--json`, returning an exit code) rather than bypassing them. Their `choices` and `missing` fields move into `data`.

### JSONL streams

- One complete JSON object per line, flushed as each event arrives, with a stable `type` field when a stream carries more than one kind of event.
- A snapshot ends with one `{ "type": "summary", "recordsReturned", "timeRange", "pagination": { "hasMore", "next" }, "excludedIntervals" }` line on success. `hasMore` says whether more matched; `next` is a `--next` cursor or `null`.
- A stream error ends the stream with one JSON error document on stderr.
- NEVER buffer a stream into one JSON array.

### Other protocols

| Protocol      | Rule                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Raw API body  | `vercel api` prints the response body exactly; `--include` adds the status line and headers                                                                 |
| File or bytes | Exact bytes to the `--output` destination or a non-TTY stdout (a TTY gets [escaped](#files-stdin-and-secrets) output unless `--output -`); status on stderr |
| Child process | The child owns stdout, stderr, and exit code; the CLI never wraps them                                                                                      |
| Plain value   | A command that prints one value (a URL, a requested token) prints it alone with a newline                                                                   |

## 11. Exit Codes

| Code       | Meaning                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `0`        | The promised operation completed: success, empty result, no-op, acceptance under `--no-wait`, help, or version                          |
| `1`        | Operational failure, as fixed by the error [class](#classes); also `diff --exit-code` finding changes                                   |
| `2`        | Usage error or missing input, as fixed by the error [class](#classes)                                                                   |
| `130`      | Canceled by the user: Ctrl+C (`SIGINT`), Escape, or declining a confirmation the operation needs. Declining an optional offer exits `0` |
| `128 + n`  | Terminated by signal `n` (`SIGTERM` exits `143`, `SIGHUP` `129`), whether the CLI or a child it runs                                    |
| Child code | Commands that run a child (`env run`, extensions) exit with the child's code                                                            |

- NEVER exit `0` after a failure because output was printed.
- `diff --exit-code` exits `1` when it finds changes; that result is not an error.
- A closed stdout pipe (`| head`) ends a read or stream quietly with `0`. A mutation already sent finishes and exits with its real outcome.
- Canceling an optional offer after the result exits with the result's code and prints no `Canceled.`
- Post-command work (update checks, telemetry) never changes the exit code.
- A usage-error `reason` or error code exits `2` only when it's in `USAGE_ERROR_REASONS` (`src/util/agent-output-constants.ts`) or `USAGE_ERROR_CODES` (`src/util/command-validation.ts`). Add a new one there in the same change.

## 12. Writing

Clear, calm, and direct. Use the shared [typography](#typography-and-hierarchy) and [layout](#layout-primitives) rather than inventing emphasis for copy. Settle the behavior and consequence first, then polish the words. Where any section gives an exact phrase, use it verbatim; those phrases match the dashboard.

### Surface patterns

| Surface      | Pattern                                                                | Example                                                   |
| ------------ | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| Help summary | Imperative verb + object, no period                                    | `List deployments for a project`                          |
| Question     | Short and concrete, ends in `?`                                        | `Which team?`                                             |
| Confirmation | Action + exact object + consequence                                    | `Revoke token deploy-ci? Deployments using it will fail.` |
| Progress     | Present participle + `…`                                               | `Building…`                                               |
| Receipt      | Confirmed outcome + target; layout per [Human Output](#7-human-output) | `✓ Deleted         acme-web`                              |
| Error        | Per [error classes](#classes)                                          | `Couldn't find project acme-wbe in acme.`                 |
| Next step    | Benefit + `:`, then the command on its own line                        | `Stream the build logs:`                                  |

### Style

- Name the thing: `Connect your GitHub account`, not `Connect your account`.
- Active voice, contractions where natural, numerals, no filler. Every word earns its place.
- Reframe blame as a constraint: `Names use lowercase letters, numbers, and hyphens.`, not `You entered an invalid name.`
- Name destinations and commands instead of `click here` or a bare `Retry`. `Learn more:` appears only as the help section label, followed by its URL.
- Apologize only for a real Vercel fault or disruption.

### Words to avoid

- **Hype:** seamlessly, effortlessly, powerful, robust, leverage, blazing, cutting-edge, world-class, utilize, streamline
- **Filler:** just, simply, actually, please, in order to, at this time, it's important to note
- **Vague outcomes:** successfully, Done!, OK, Unable to, An error occurred, Something went wrong
- **Interjections:** Oops, Whoops, Uh-oh, Yay, Heads up
- **Vague prompts:** Continue?, Are you sure?, Do you want to…
- **Non-inclusive terms:** whitelist/blacklist (allowlist/blocklist), master/slave (primary/replica), kill (stop, except literal signals), sanity check, dummy
- **AI cadence:** "It's not X, it's Y", "No X. No Y. Just Z.", rhetorical questions, em-dash chains, tricolons for rhythm

### Mechanics

- Sentence case for prose, questions, help, and statuses. Title Case for aligned labels, table headers, and help section titles (except `Learn more:`). Nouns follow the [registry's casing](registry.md#1-nouns).
- Periods end full sentences, not fragments or labels. Use the Oxford comma. Use `…` (one character) for ongoing work. Never use `!` in CLI-authored prose; it is reserved for the warning glyph. Preserve punctuation in user data and quoted partner messages.
- Use straight ASCII quotes and apostrophes, not the dashboard's curly ones: CLI output gets pasted into shells and read by consoles that can't render them.
- In prose, write commands, options, paths, and values exactly.
- Never rewrite JSON keys, telemetry names, third-party literals, or parser values for copy consistency.

## 13. Operation Patterns

### Context and authentication

- Each command declares one context: **no project needed** (`none`), **project required** (`project`; fails if unlinked), or **setup allowed** (`setup`; may run the [link flow](commands.md#link)). A read never links or creates a project as a helper's side effect. Helpers: `src/util/projects/require-project-context.ts` (never links), `src/util/link/ensure-link.ts` (may link).
- Malformed or unreadable config fails with the file and location, without echoing secrets; it's never treated as absent or reset. A command validates only the config sections it uses.
- **Several projects in one repository:** a project-scoped command run where several linked projects apply (not inside one project's root directory), with no `--project`, fails with `ambiguous_project` and lists candidates in `data.projects`.
- **Pinned or repo-provided context:** a consequential command whose team or project came from `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` or from repo-tracked files shows `Team`, `Project`, and `Source` rows in human output in every interaction mode. A Git-tracked `.vercel/` directory warns `link_tracked`; a pin that disagrees with the directory's link warns `link_pin_mismatch`.
- **Team selection** applies to `link`, `teams switch`, and anything else that sets a team:
  - The team comes from an explicit signal (`--scope`, `VERCEL_ORG_ID`, or the team in `vercel.json`), the only available team, or `Which team?`. With one team, skip the chooser and show a `Team` row. (Severe work and [purchases](#purchases-and-billing-changes) accept a narrower set; see [Consent](#consent).)
  - The chooser includes teams that require SSO and reauthenticates only after one is chosen.
  - Non-interactive with several teams and no signal fails with `missing_scope` before any discovery or change, listing teams in `data.teams`.
  - Switching to the current team is `outcome: "unchanged"`. When the directory's link uses a different team than the new current team, warn once (`link_team_mismatch`).
- **Credentials** resolve `--token` → `VERCEL_TOKEN` → stored login, and are needed only when the operation needs them. With no credentials, only `login` starts a login flow; every other command that needs credentials fails with `login_required`. Expiry and SSO follow the next rule. Non-interactive mode fails with `login_required` instead of opening a browser. A valid token that lacks a scope fails with the missing scope and how to get a suitable token.
- **Expiry or SSO mid-command:** interactive mode reauthenticates, then resumes only reads, never replaying a mutation that may have been sent. Non-interactive mode fails with `token_expired` or `sso_required` and `userActionRequired: true`. Refreshing a stored credential takes a lock.
- **Degraded modes:** local-only fallbacks (`vercel dev --local`) name the remote settings or services that are unavailable. Temporary resources (anonymous deploys) state their expiry and how to claim them.

### Collections and pagination

- `--limit` is the total number of results wanted; the CLI pages internally to reach it and never fetches more than it needs. A value above the command's documented cap is clamped to the cap with a `limit_clamped` warning. Every list supports `--limit`, and `--next` when more results can exist than `--limit`. A value above the cap isn't invalid; a non-integer or a value below `1` is a usage error. Help documents the default order, default limit, cap, and which filters run on the server.
- When more results exist, return a continuation: `pagination.next` in JSON, a `Next page:` command in human output. `pagination` is CLI-owned: `next` is an opaque string (encoding whatever the API uses) or `null`, never the API's pagination object. JSONL snapshots also carry `hasMore` beside `next`. A cursor is bound to the command, resolved team/project, filters, order, and time window. Omitted query filters inherit the cursor values; an explicit conflict or a different resolved context is a usage error. Both human and JSON `next` entries give the complete continuation argv, including explicit context and normalized filters/time bounds.
- Filters, order, and time window stay fixed across pages. Fetching everything is explicit (`--all`), bounded, and cancelable. If a later page fails, human output reports how many rows were delivered and a cursor after the last delivered row. JSON lists buffer until their one result document is complete: on failure stdout stays empty, the error reports `data.rowsFetched` for context, and `data.pagination.next` is the input cursor (or `null` to restart the same query), never a cursor past undisclosed rows. Exit with the failure class's code, without claiming a complete result.

### Writes

- Validate syntax, target, permissions, and payload before the first durable effect.
- `update` distinguishes omitted (unchanged), explicitly empty (cleared), and new values. Read-modify-write uses version or ETag conditions; a conflict means re-read, never a blind retry.
- Bulk operations report succeeded, failed, and skipped items, whether the operation is atomic, and which subset is safe to retry.
- **Staged changes:**
  - The receipt is `✓ Staged <noun> <name>` with a `Version` row, then the diff, publish, and discard commands (`outcome: "staged"`, plus `version`).
  - `diff` prints one change per row, prefixed `+`, `-`, or `~`, and exits `0` whether or not anything differs; `--exit-code` makes it exit `1` when something does, for CI drift checks; that's a result, not an error, so the diff stays on stdout and no error document is written. `--json` returns `{ "changes": [{ "id", "change": "added" | "removed" | "updated", "before", "after" }], "version" }`.
  - `publish` previews every staged change with who made it and publishes only the version it previewed (a newer one is a `stale_version` Conflict). It is destructive when it blocks or challenges traffic.
  - NEVER publish unrelated staged work as a side effect.
- **Server-side schedules** (a progressive rollout) report the start: `✓ Started`, `outcome: "started"`, never their final state.
- **Moves:** a mutation that takes something from another resource (an alias or domain from another project) shows a `Previous` row and returns `previous<Noun>` in JSON.
- `--dry-run` does the reads and validation, performs no mutation, and says what it would change. It never prompts and needs no `--yes`, still validates a given `--amount` (`price_changed`), and on a staging command previews the stage without staging. JSON: `outcome: "planned"` with the `changes` array shape used by `diff`.
- No-ops are explicit: `  example.com is already assigned to acme-web.` (exit `0`, `outcome: "unchanged"`).

### Files, stdin, and secrets

- Each input and output is declared as text, JSON, or bytes, with encoding, size limits, and newline handling. Bytes are never decoded as UTF-8.
- `-` means stdin or stdout where the capability is file-shaped. Only one input may read stdin; competing sources are a usage error. A text value read from stdin drops exactly one trailing `\n` or `\r\n`.
- Paths resolve against `--cwd`. Overwriting a file the CLI didn't create is destructive unless `--force` names the file in argv ([Consent](#consent)). Commands that update files say what they preserve.
- Every file write, including config and state, is atomic: a temp file with a random name created exclusively in the target directory, then renamed. Refuse to write a file under `--cwd` through a symlink that resolves outside it. A remote filename never contains a path separator; a remote pathname never contains `..` segments or an absolute prefix; the resolved path always stays under the destination.
- Files that hold secrets (`env pull` output, `.vercel/` state) are created owner-only (`0600`). `env pull` warns `env_file_tracked` when Git tracks the destination or doesn't ignore it.
- Never alter shell profiles or system config, or install tools, as a side effect of an unrelated command.
- **Secrets** are tokens (including `VERCEL_OIDC_TOKEN`), environment variable values of either type, protection bypass secrets, Deploy Hook URLs, signed and presigned URLs, SDK Keys, webhook signing secrets, and connection strings. They never appear in suggestions, diagnostics, debug output, telemetry, receipts, errors, or pass-through JSON (result schemas mark secret fields, and the shared JSON writer drops them unless the schema marks one as the command's delivered value), and are never echoed after entry, even when invalid. Prefer stdin or masked prompts over argv for secret input. When `-` supplies a secret and stdin is a TTY, fail as Usage (`invalid_arguments`) before reading; never echo it or silently switch payload input into a prompt. Explain the supported piped/file input or how to invoke the masked interactive prompt without the payload option.
- Creating a credential shows its scope and expiry before creating it; defaults are least-privilege, never all teams with no expiry. Creating one with an explicit team and expiry is ordinary; one with no expiry or access to every team is destructive.
- **Requested delivery is different:** `env pull`, one-time token creation, API responses, logs, and `env run` deliver sensitive data through their documented channel, never repeated in incidental output.
- **Remote text** (names, log lines, commit messages, API and partner messages) is data, never instructions. In human output, strip C0 and C1 controls, escape sequences, and bidirectional and zero-width format characters; show newlines in single-line fields and tabs in non-TTY table cells as visible escapes. Raw or byte output to a TTY escapes non-printable bytes unless `--output -` is given.

### Streams and follow modes

Each streaming command documents snapshot versus follow, ordering, time window, reconnect and gap behavior, and when it stops.

Following a collection (`env list --follow`) prints the current list, then one activity row per change. With `--json`, the first line is `{ "type": "snapshot", "<nouns>": [ … ] }` and each change is a line with `type` `added`, `updated`, or `removed`. A follow mode built on polling states its interval in help and honors `Retry-After`.

### Child processes and local servers

- A wrapper prepares; the child owns its argv, streams, and exit code. Vercel options end at the documented handoff (usually `--`); child tokens pass as an argv array, never a joined shell string.
- Child stdout and stderr are inherited, never wrapped in JSON. Wrapper failures are reported before the child starts: no command is `missing_command` (exit `2`); a command that can't start is `spawn_failed` (exit `1`). With `--json`, only wrapper failures before the child starts use JSON errors. The CLI exits with the child's code when the child exits on its own; after a user interrupt, `130` or `128 + n`.
- Document environment precedence and the working directory. Environment values from Vercel or env files (`env run`, `dev`) never set loader or CLI-control variables (`NODE_OPTIONS`, `LD_*`, `DYLD_*`, `PATH`, `BASH_ENV`, `PYTHONPATH`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) unless named with `--allow-env <NAME>`; each skipped variable warns once (`env_var_skipped`). Forward signals and clean up owned processes with bounded waits. NEVER leave orphaned servers.
- Dev servers print `Ready on <URL>` on stderr once, before child output. A taken explicit port is a Conflict (`port_in_use`) with recovery `vercel dev --listen <PORT>`; a taken default port moves to the next free one with one `port_fallback` warning: `! Port 3000 is in use. Using 3001.` Server startup isn't build completion.

### Configuration files

- `vercel.json` and `vercel.ts` belong to the user. The CLI edits `vercel.json` only on explicit request, preserving formatting and unrelated keys; it never edits `vercel.ts` and prints the change instead.
- `.vercel/` holds CLI-managed state (link, env pulls, build output), shown in receipts only when the user must act on it.
- The CLI config directory holds auth and preferences; credential files are owner-only. Concurrent CLI processes never lose each other's unrelated keys.

### Browser

Open a browser only in interactive mode on a local desktop session, and always print the URL too. In non-interactive mode, CI, or over SSH, print the URL and the next step instead. Commands that open a browser accept `--no-open`.

## 14. CLI Lifecycle

### Updates

- Update notices pass the [tip gate](#tips), print at most once a day, and never appear with `NO_UPDATE_NOTIFIER`. They take no glyph: `Vercel CLI 61.0.0 is available. You have 60.1.3.`, then `Upgrade:` and `vercel cli upgrade`.
- An upgrade offer is one question after the command finishes. Automatic updates are opt-in and each is reported once.
- `vercel cli upgrade` detects how the CLI was installed (npm, pnpm, Yarn, Bun, Homebrew, standalone binary) and uses or prints the matching command, never overwriting a package-manager install with another method. It runs package managers from the home directory against the official registry, verifies standalone binaries against a signed checksum before replacing them, and `cli versions activate` warns (`insecure_version`) when the target is below the minimum secure version.

### Version skew

- When the API says the CLI is too old, fail with `cli_outdated`, the minimum version, and the upgrade command.
- Unknown API enum values render raw and never crash.
- Persistent state (auth, config, caches) stays readable by older and newer versions; a format change ships with a migration.

### CI

CI logs are read by people, so CI output stays human. Human mode MAY emit GitHub Actions annotations (`::error file=…,line=…::`) on stderr for config errors, but NEVER workflow commands that change CI state (`::add-mask::`, environment files) unless an option asks for it. Exception: in GitHub Actions, a command that prints a secret it was asked to deliver first emits `::add-mask::` for it on stderr, in every format, including `--json`.

### Telemetry

- Disclosed on first run: a short notice interactively, one stderr line in CI or non-interactive human mode, never a prompt. With `--json`, the disclosure waits for the next run without it. Opt out with `vercel cli telemetry disable` or `VERCEL_TELEMETRY_DISABLED=1`. Nothing is sent until the disclosure has been shown.
- Records command paths and option names, never values, secrets, file contents, paths, or remote data. It never slows a command or changes its output. Unknown path segments are recorded as `<path>` or `<extension>`. It also records each failure's `reason` and exit code, so the team can see which failures users actually hit.

### Performance

Help, version, and local commands start without network access, loading command modules lazily. Help and version SHOULD render within 200 ms on a warm cache, and CI tracks startup time so a regression is visible. Independent requests run in parallel. Non-essential work (update checks, telemetry) never blocks the command.

## 15. Changing a Contract

Contracts are command names, option names and meanings, defaults, prompts, output streams, JSON shapes, exit codes, environment variables, config files, non-TTY table headers and column order, and a mutation's bare stdout identifier. Improving them is expected; breaking a user silently is not.

| Change                                                                           | Requirement                                                                                                                    |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Other human copy, layout, or help text                                           | Update tests; no migration                                                                                                     |
| Add a command, option, JSON field, or alias                                      | Tests for the new behavior and unchanged old invocations                                                                       |
| Rename a command or option                                                       | The old name stays as a deprecated alias (warning `reason`: `deprecated`) for at least one major version; a minor changeset    |
| Change meaning, default, type, stream, exit code, or JSON shape; remove anything | A major version, a changeset marked major, release notes naming the replacement, and a deprecation period first where feasible |

- An alias bridges a rename, never two meanings of one token; changing what a token means requires removing it first. A breaking stream or format change MAY ship a compatibility switch (`VERCEL_COMPAT_<NAME>=1`) that restores the old behavior for one major version.
- Use telemetry to measure usage before removing a deprecated input.
- Add the exit code, stream, and JSON assertions that lock in the new contract.

## 16. Verification and Review

A snapshot, metadata entry, or polished transcript alone doesn't prove a command works. Test public behavior at the narrowest boundary that exercises it, with no live mutations.

### Evidence by change

| Changed        | Evidence                                                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Names, parsing | Long and short forms behave identically; aliases; unknown, repeated, and conflicting options; globals at nested depth; `--` handoff                                                                       |
| Help           | Every entry point routes to the same help; unknown paths fail; help works offline before auth; section order; ancestor arguments in leaf usage; examples parse and emit exact argv without a shell prompt |
| Context, input | Exact resolution; explicit target wins; typos never create or fall back (except a directory deploy's `--project` name); malformed config fails; one stdin owner                                           |
| Output         | Parse JSON from stdout and error JSON from stderr; assert each stream; empty versus missing versus partial; no ANSI in JSON                                                                               |
| Collections    | `--limit` is a total across pages with no over-fetch, clamped with `limit_clamped` above the cap; ordering; first, next, and last page; filters unchanged across pages                                    |
| Mutations      | Nothing written before validation and consent; exact target; default No; `--yes` versus `--force`; no duplicate on retry; partial report                                                                  |
| Long-running   | Bounded waits, including endless pending; cancellation exits `130`; cancellation after confirmed completion retains `finished` evidence; claimed phases happened; accepted versus ready                   |
| Files, secrets | Encoding and bytes; overwrite refusal; atomic writes; no secret in incidental output; requested delivery still works                                                                                      |
| Processes      | argv with spaces and metacharacters; child exit `42` passes through; spawn failure; signals; no orphans; quiet closed pipe                                                                                |
| Presentation   | Before and after transcript; 40, 80, and 120 columns; long and Unicode values; `NO_COLOR`; `TERM=dumb`; accessible mode; each stream's TTY state; gutter and receipt                                      |
| Contracts      | Old inputs, JSON shapes, streams, and exit codes, unless the change is an intentional [contract change](#15-changing-a-contract)                                                                          |

### Journeys and modes

- **Journeys** (SHOULD, for new commands and flows): walk and read the transcript of each journey the change touches: first run with no login; expired token or SSO mid-command; several teams; a monorepo; a GitHub Actions deploy; an agent's discover, act, verify, recover loop (covered by the agent evals in `packages/cli/evals/`); offline; rate limited; a long deploy interrupted; partial bulk failure; a destructive production change; a broken config file; a CLI older than the API expects; Windows PowerShell; accessible mode; piping into `jq`, `grep`, and `head`; two CLI processes at once.
- **Modes** (MUST, for changes to prompts, streams, format, consent, or progress; copy-only changes are exempt): test success and failure with an interactive TTY, stdout redirected, stdin piped, `--json` on a TTY, `--non-interactive` on a TTY, CI with a TTY, and a detected agent. Use the shared mode test helper once it exists; until then, cover the same matrix directly. Assert whether a prompt appeared, each stream's contents, and the exit code.

### Presentation checks

For a changed shared renderer, cover every adopter: root, leaf, group, custom, and dynamic help; prompts, results, or errors when affected.

- Compare before/after at 40, 80, and 120 columns, including Unicode, long values, structured input, and complete commands. Check grouping, reading order, density, and no trailing padding.
- Review light/dark palettes, monochrome, color off, fully unstyled, and bold-as-bright. Record palette contrast and known failures. Browser approximations are not real-terminal, clipboard, screen-reader, or usability evidence.
- Assert styled-span boundaries, resets, exact ANSI-stripped equivalence, intact quotes and command text, and isolated stdout/stderr capabilities. Cover nonempty `NO_COLOR`, `--no-color`, `FORCE_COLOR`, `TERM=dumb`, and redirected output.
- Assert no styling in JSON, identifiers, requested secrets, or tab-separated protocols, even with force. Validate example parsing without executing examples.
- Compare neutral and accented designs on finding a command or option, copying an example, and reading an error plus recovery. Record mistakes and legibility, not preference alone; apply the same standard to both designs. Report unrun terminal, assistive-technology, and user checks explicitly.

### Shared helpers

Parser, help, and global option changes affect every command; link and input helpers affect `link`, `deploy`, `dev`, `pull`, and `git connect`; output helpers affect every adopter. Trace call sites, test the helper, and test at least one materially different caller. Starting points under `test/unit/`: `commands/help.test.ts`, `commands/help-discovery.test.ts`, `util/output/print-aligned-label.test.ts`, `util/output-format.test.ts`, `commands/deploy/index.test.ts`, `commands/env/run.test.ts`, `commands/api/request-builder.test.ts`.

Test layout semantically and keep exact column tests at `printAlignedLabel()` for both wide alignment and the narrow fallback. For wording, assert the meaningful new outcome and reject stale strings where regression is plausible.

### Enforcement

Rules that depend on every call site erode. These shared mechanisms make the high-risk ones hold; build each as its migration lands, and prefer them over review:

| Rule                               | Mechanism                                                                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mode detection in one place        | A resolved `client.mode`; a lint banning `isTTY` and `process.env.CI` outside `src/util/`                                                                                                                                             |
| No prompts in non-interactive mode | `client.input` throws a typed missing-input error that the top level maps to `action_required`                                                                                                                                        |
| Streams and JSON purity            | One result writer (`client.writeResult`) that handles compact or pretty JSON, secret fields, and warnings; a JSON mode on `output` that turns human lines into no-ops; a test helper asserting one stdout document and a clean stderr |
| Help contract                      | Central help dispatch right after the first parse, before config, auth, and scope resolution                                                                                                                                          |
| Color and glyphs                   | A theme module in `src/util/output/`; a lint restricting `chalk` imports to it                                                                                                                                                        |
| Consent tiers                      | Command metadata `consequence` and one confirmation helper that renders the preview and produces `confirmation_required`                                                                                                              |
| Error classes and reasons          | A typed error carrying class, `reason`, `data`, and `next`; one API-error mapper; `reason` typed from `AGENT_REASON`                                                                                                                  |
| Mutation retries                   | `client.fetch` retries only `GET`, `HEAD`, and requests marked idempotent (documented or keyed)                                                                                                                                       |
| Signals                            | One root abort signal wired to `SIGINT`, `SIGTERM`, and `SIGHUP` and passed to every request and child process                                                                                                                        |
| Formatting                         | Shared formatters for ages, durations, counts, sizes, and money, used by every command                                                                                                                                                |
| Names                              | The registry lint and surface snapshot ([Keeping the registry true](registry.md#7-keeping-the-registry-true))                                                                                                                         |

### Review

- Reject a change that breaks a MUST or NEVER within its [scope](../SKILL.md#scope-of-a-change), with a concrete user consequence and the fix. Don't reject on taste or demand unrelated refactors. An existing inconsistency never excuses a new one.
- Also reject a change that edits prompt or result copy without checking the surrounding flow, updates one command path but misses parallel paths that share its helper or contract, or lacks tests that lock in the new behavior and reject the old.
- A SHOULD deviation is recorded in the PR (rule, reason, user impact, test). PR notes never waive MUST or NEVER requirements or add to the shrink-only exceptions list. Change an unsuitable requirement explicitly through [Changing a contract](#15-changing-a-contract), rather than introducing a caller-specific exception.

### Changing this skill

- Check frontmatter, links, anchors, and source paths, and compare removed text for lost safety or compatibility rules.
- Walk at least two dissimilar real tasks through the new text (for example, a copy fix and a new JSON command).
- Don't add tests that grep for headings or copied prose.
