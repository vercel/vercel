# Non-interactive mode best practices (CLI)

When `vercel` runs with **`--non-interactive`** (or in an agent/CI context where non-interactive is implied), commands should behave predictably for automation: structured output, copy-pasteable next steps, and no ANSI in JSON.

## Structured output

- **`action_required`** — User/agent must run a follow-up command (missing args, confirmation, scope choice). Payload includes `status`, `reason`, `message`, and `next[]` with suggested commands.
- **`error`** — Unrecoverable or invalid input. Payload includes `status`, `reason`, `message`, and optional `next[]`.

Implementations use **`outputActionRequired`** / **`outputAgentError`** (`packages/cli/src/util/agent-output.ts`): they **`console.log(JSON.stringify(payload, null, 2))`** and **`process.exit(exitCode)`** when `client.nonInteractive` is true.

## Plain command strings

- Use **`getCommandNamePlain()`** for anything serialized into JSON (`next[].command`, `message` examples). Do **not** use **`getCommandName()`** or **`param()`** / chalk in JSON paths—agents parse stdout and ANSI breaks parsing.

## Placeholders

- Use **angle brackets** for placeholders in suggested commands: **`<slug>`**, **`<name>`**, **`<source>`**, **`<file>`**, **`<version-id>`**, etc.
- Keeps templates unambiguous and shell-safe until substituted.

## Preserving context in `next[]` commands

- **Global flags** (`--cwd`, `--scope`, `--token`, `--non-interactive`, etc.) should be **appended to every suggested command** when the agent is expected to run from the same context.
- **`getGlobalFlagsOnlyFromArgs(client.argv.slice(2))`** (`arg-common.ts`) collects only global flags so **cross-subcommand** suggestions (e.g. `redirects add` → `redirects promote`) do not forward flags that would **parse-error** on the target subcommand.
- **Same subcommand** retries (e.g. `teams add` still missing `--name`) should preserve **subcommand-specific flags** via **`getSameSubcommandSuggestionFlags()`** so the user does not retype `--slug`, `--status`, etc.

## Ordering of checks

- If a **required positional/flag is missing** in non-interactive mode, emit **`missing_arguments`** **before** other errors that depend on config state (e.g. stale `currentTeam`). Otherwise agents see the wrong `reason` (e.g. `current_team_invalid` instead of missing slug).

## Tests

- Mock **`process.exit`** to throw and spy **`console.log`**; parse JSON from the first log call.
- Do not assert only on stderr when the flow exits via **`outputActionRequired`** / **`outputAgentError`**.

## Subcommand naming in `next`

- Prefer **fully qualified** commands in JSON (**`teams switch <slug>`** not **`switch <team>`**) so copy-paste works regardless of alias.

## Confirmation flows

- Non-interactive destructive or sensitive actions should require **`--yes`** (or **`buildCommandWithYes(client.argv)`** in suggestions) instead of prompting.

## API failures in non-interactive mode

- Prefer **`outputAgentError`** with a stable **`reason`** (e.g. `payment_required`, `rate_limited`, `slug_unavailable`, `timeout`) and a **plain `message`**—never chalk/`param()` in JSON.
- **`teams add`** non-interactive path: create-team and patch-team catches emit JSON instead of only `output.error`, so agents get parseable stdout.
- When the fix is **user action in the browser** (e.g. add payment method), include a **`next`** entry whose **`command`** is a **shell one-liner** to open the URL (`open` / `start` / `xdg-open` by platform) so the user or agent can run it locally.

## Related code

| Area | Notes |
|------|--------|
| `packages/cli/src/util/agent-output.ts` | `outputActionRequired`, `outputAgentError`, `buildCommandWithYes` |
| `packages/cli/src/util/arg-common.ts` | `GLOBAL_CLI_FLAG_NAMES`, `getGlobalFlagsOnlyFromArgs`, `getSameSubcommandSuggestionFlags` |
| `packages/cli/src/util/pkg-name.ts` | `getCommandNamePlain` |

## Backwards compatibility

- Interactive behavior unchanged.
- Scripts that assume **no JSON on stdout** on failure may need to tolerate a single JSON object before exit when using non-interactive mode.
