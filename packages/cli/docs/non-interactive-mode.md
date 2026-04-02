# Non-interactive mode best practices (CLI)

## Who this is for

This document is for **two audiences**:

- **Humans** — CLI implementers (adding or changing commands) and integrators (CI, scripts, docs). It describes how to implement non-interactive behavior and what output to expect.
- **Agents** — Automation (bots, CI, IDEs) that run `vercel` with `--non-interactive` and parse stdout. It describes the JSON contract: `status`, `reason`, `next[]`, and how to use suggested commands without manual substitution when possible.

When `vercel` runs with **`--non-interactive`** (or in an agent/CI context where non-interactive is implied), commands should behave predictably for automation: structured output, copy-pasteable next steps, and no ANSI in JSON.

---

## Structured output (for agents and implementers)

- **`action_required`** — User/agent must run a follow-up command (missing args, confirmation, scope choice). Payload includes `status`, `reason`, `message`, and `next[]` with suggested commands.
- **`error`** — Unrecoverable or invalid input. Payload includes `status`, `reason`, `message`, and optional `next[]`.

Implementations use **`outputActionRequired`** / **`outputAgentError`** (`packages/cli/src/util/agent-output.ts`): they write a single JSON object to stdout and **`process.exit(exitCode)`** when `client.nonInteractive` is true. **Agents** should parse the first JSON object on stdout to get `status`, `reason`, and `next[]`.

---

## Best practice: copy-pastable commands (minimize substitution)

- **Prefer passing the original invoking command into the output** so agents (and users) can run the suggested command without substituting. For example, use **`buildCommandWithYes(client.argv)`** for confirmation flows: the `next[].command` is the exact command the user ran, with `--yes` added or retained. The agent can copy-paste it as-is.
- When a template is unavoidable (e.g. missing required arg), use **angle-bracket placeholders** (see below) and keep the rest of the command real: e.g. `vercel redirects add <source> <destination> --yes` so the agent only substitutes `<source>` and `<destination>` and preserves global flags if you append them.

## Best practice: angle-bracket placeholders

- Use **angle brackets** for placeholders in suggested commands: **`<slug>`**, **`<name>`**, **`<source>`**, **`<destination>`**, **`<file>`**, **`<version-id>`**, **`<email>`**, **`<description>`**, etc.
- Keeps templates unambiguous and shell-safe. Agents can substitute the bracketed token without guessing. Do **not** use bare words or `...` as placeholders in `next[].command`.
- Example: `vercel routes add --ai <description> --yes` — the agent replaces `<description>` with the actual text (and quotes it if it contains spaces).

## Plain command strings (implementers)

- Use **`getCommandNamePlain()`** for anything serialized into JSON (`next[].command`, `message` examples). Do **not** use **`getCommandName()`** or **`param()`** / chalk in JSON paths—agents parse stdout and ANSI breaks parsing.

## Preserving context in `next[]` commands (implementers)

- **Global flags** (`--cwd`, `--scope`, `--token`, `--non-interactive`, etc.) should be **appended to every suggested command** when the agent is expected to run from the same context. That way the suggested command works when run from the same directory/config.
- **`getGlobalFlagsOnlyFromArgs(client.argv.slice(2))`** (`arg-common.ts`) collects only global flags so **cross-subcommand** suggestions (e.g. `redirects add` → `redirects promote`, `teams invite` → `teams switch`) do not forward flags that would **parse-error** on the target subcommand.
- **Same subcommand** retries (e.g. `teams add` still missing `--name`) should preserve **subcommand-specific flags** via **`getSameSubcommandSuggestionFlags()`** (args after the subcommand, minus positionals) so the user does not retype `--slug`, `--status`, etc.
- **Pattern:** `getCommandNamePlain(\`${template} ${flags.join(' ')}\`.trim())` after collecting flags.

## Ordering of checks (implementers)

- If a **required positional/flag is missing** in non-interactive mode, emit **`missing_arguments`** **before** other errors that depend on config state (e.g. stale `currentTeam`). Otherwise agents see the wrong `reason` (e.g. `current_team_invalid` instead of missing slug).

## Tests (implementers)

- Mock **`process.exit`** to throw and capture stdout (or the function that writes the payload); parse JSON from the first JSON object on stdout.
- Do not assert only on stderr when the flow exits via **`outputActionRequired`** / **`outputAgentError`** (stdout contains the payload).

## Subcommand naming in `next` (implementers)

- Prefer **fully qualified** commands in JSON (**`teams switch <slug>`** not **`switch <team>`**) so copy-paste works regardless of alias.

## Confirmation flows (implementers)

- Non-interactive destructive or sensitive actions should require **`--yes`** instead of prompting. In **`next[]`**, suggest the **exact command to re-run with `--yes`** using **`buildCommandWithYes(client.argv)`** so the agent (or user) can copy-paste it without substituting anything.

## API failures in non-interactive mode (implementers)

- Prefer **`outputAgentError`** with a stable **`reason`** (e.g. `payment_required`, `rate_limited`, `slug_unavailable`, `timeout`, `domain_not_found`, `confirmation_required`) and a **plain `message`**—never chalk/`param()` in JSON (agents parse stdout).
- **`teams add`** non-interactive path: create-team and patch-team catches should emit JSON instead of only `output.error`, so agents get parseable stdout.
- When the fix is **user action in the browser** (e.g. add payment method), include a **`next`** entry whose **`command`** is a **shell one-liner** to open the URL (`open` / `start` / `xdg-open` by platform) so the user or agent can run it locally.
- **`tokens add`:** If the API returns **403** because the session is OAuth-only (not a classic token), emit **`reason: classic_token_required`**, **`verification_uri`** pointing at the dashboard tokens page, **`userActionRequired`**, a plain **`hint`**, and **`next[]`** with `openUrlInBrowserCommand`, a shell **`export VERCEL_TOKEN='<class_access_token>'`** placeholder step, plus the re-run command (or **`--token`**). If the API returns **403** with *authenticated to scope* (classic token lacks full user scope), emit **`reason: token_user_scope_required`**, the same URL / **`next[]`** pattern, and put the API **`message`** in **`message`** (normalized, no ANSI).
- **`tokens rm`:** When the token id is missing, emit **`missing_arguments`** with **`hint`** and **`next[]`**: **`buildCommandWithGlobalFlags`** **`tokens ls`**, then **`tokens rm <token_id>`** (placeholder).
- **`bailOn429`:** For flows that would otherwise sleep/retry on 429 (e.g. PATCH after create), use **`bailOn429: true`** on the fetch or fail fast so the CLI does not spin indefinitely.

## Related code (implementers)

| Area | Notes |
|------|--------|
| `packages/cli/src/util/agent-output.ts` | `outputActionRequired`, `outputAgentError`, `buildCommandWithYes`, `enrichActionRequiredWithInvokingCommand` |
| `packages/cli/src/util/arg-common.ts` | `globalCommandOptions`; add **`getGlobalFlagsOnlyFromArgs`** / **`getSameSubcommandSuggestionFlags`** when missing so `next[]` can preserve context safely |
| `packages/cli/src/util/pkg-name.ts` | `getCommandNamePlain`, `packageName` |

## Backwards compatibility

- Interactive behavior unchanged.
- Scripts that assume **no JSON on stdout** on failure may need to tolerate a single JSON object before exit when using non-interactive mode.
