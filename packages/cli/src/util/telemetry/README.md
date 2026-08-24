# Vercel CLI Telemetry

The Vercel CLI uses telemetry to track invocations of commands, subcommands, arguments (but typically not their values), options and flags (a.k.a. boolean options).

This structure is heavily cribbed from two other Vercel projects that are already tracking metrics: the `next` and `turbo` CLIs. Specifically we drew inspiration from the [`turbo-telemetry` package](https://github.com/vercel/turborepo/tree/main/packages/turbo-telemetry/src).
However, the Vercel CLI's code structure differs from these two project that necessitates slightly different code organization.

## Structure and Data Flow

The telemetry system has two main components: `client`s and `eventStore`s.

### Telemetry Clients

Clients are responsible for calling methods that push tracking events into an event store. The abstract class of all clients is [`TelemetryClient`](https://github.com/vercel/vercel/blob/main/packages/cli/src/util/telemetry/index.ts).
This provides the interface for tracking:

- commands with `trackCliCommand()`
- subcommands with `trackCliSubcommand()`
- arguments with `trackCliArgument()`
- options with `trackCliOption()`
- flags with `trackCliFlag()`

and a number of other event types that can occur anywhere in the CLI (errors, `help` calls, etc).

The `track{*}` methods are all `protected` and cannot be invoked directly on subclass instances of `TelemetryClient`.

Instead, each subclass is expected to implement specific tracking methods that call to the appropriate `protected` method. This acts as an implicit allow-list of what can be tracked at each layer (`root` → `command` → `subcommand`) of the CLI.

Each layer of the CLI invocation may have its own telemetry client subclass.

- `root` has a instance of `RootTelementryClient` from `src/util/telemetry/root.ts`
- a `command` would have an instance of `{CommandName}TelemetryClient` at `src/util/telemetry/commands/{command-name}/index.ts`
- a `subcommand` would have an instance of `{CommandName}{SubcommandName}TelemetryClient` at `src/util/telemetry/commands/{command-name}/{subcommand-name}.ts`

Methods within these classes are intended to be called directly during the CLI's execution. The naming convention for these methods is as follows:

- commands with `trackCliCommand{commandName}()`
- subcommands with `trackCliSubcommand{subcommandName}()`
- arguments with `trackCliArgument{argumentName}()`
- options with `trackCliOption{optionName}()`
- flags with `trackCliFlag{flagName}()`

A command like `vercel joke list [humor-level] --random [randomness seed] --kid-safe` would result in methods and client subclasses like:

- `RootTelementryClient.trackCliCommandJoke()` called in `src/index.ts`
- `JokeTelemtryClient.trackCliSubcommandList()` called in `src/commands/joke/index.ts`
- `JokeListTelemtryClient.trackCliArgumentHumorLevel()` called in `src/commands/joke/list.ts`
- `JokeListTelemtryClient.trackCliOptionRandom()` called in `src/commands/joke/list.ts`
- `JokeListTelemtryClient.trackCliFlagKidSafe()` called in `src/commands/joke/list.ts`

Although the structure is quite verbose, it is the pattern established earlier by other teams and the methodology approved by the Security team.

### What to Track in Clients

We want to track usage of every:

- command
- subcommand
- option
- flag

For arguments to commands, subcommands, and options we track any data that is:

- not sensitive
- not personally identifiable

Typically that is data is finite and/or represented by constants in code.

So, the following types of data would _not_ be tracked:

- a deployment id
- a project name
- a url
- a git branch name or SHA
- an environment variable value or name
- a custom environment's name or "target"

But we would track:

- the fact that a deployment id was passed instead of a URL (where we might pass `"dpl_"` or `"https://"` as values)
- the fact that a custom environment was passed (as `"CUSTOM"`)
- know system constants like a target (`"preview"`) or the name of an integration (`"redis"`)

### Telemetry Event Store

A single instance of a `TelemetryEventStore` is created and stored on the CLI `client` object passed to every command and subcommand. When initializing a new telemetry client pass this object in:

```
const myTelemetryClient = new TelemetryClientSubClass({
  opts: {
    store: client.telemetryEventStore
  }
})
```

This instance is the central object containing all events tracked during a CLI invocation. At the end of the invocation `client.telemetryEventStore.save()` is called to persist the metrics data.

## Testing

For every datum tracked, please provide unit tests. For the example `vercel joke list [humor-level] --random [randomness seed] --kid-safe`,
this would have tests in `test/unit/commands/joke/list.test.ts` that invoke the `vercel joke list` command in various ways that exercise every argument, option, and flag.
The [mock client](https://github.com/vercel/vercel/blob/main/packages/cli/test/mocks/client.ts) instance used in unit tests has a matching mocked `telemetryEventStore` that can be inspected
after invoking the CLI. Vitest has been extended with a test helper `toHaveTelemetryEvents()` to ease verifying that the store is populated with the desired values. See our other unit tests for examples
but the rough pattern is:

```
import joke from '../../../../src/commands/joke';

it('tracks humor level', async () => {
  client.setArgv('joke', 'list', '10'); // build up the simulated command line segments
  const exitCode = await joke(client); // call the command function
  expect(exitCode, 'exit code for "joke"').toEqual(0); // ensure the command reaches completion with success

  // ensure the store has the items you expect
  expect(client.telemetryEventStore).toHaveTelemetryEvents([
    {
      key: `subcommand:list`,
      value: 'ls',
    },
    {
      key: `argument:joke-level`,
      value: '10',
    },
  ]);
});
```

## Failure and outcome events

Beyond command/flag usage, the CLI records structured failure and outcome
signals. All values pass through the sanitization primitives in
`sanitize.ts` (constants, charset-gated short tokens, our own doc slugs,
salted hashes, or counts) — free-form user input never leaves the machine.

| Key | Value | Emitted from |
| --- | --- | --- |
| `exit_code` | numeric exit code, every invocation | `finishWithExitCode` |
| `command_not_found` / `command_not_found_suggestion` | `gatedToken` of the unknown token; did-you-mean match or `NONE` | `index.ts` |
| `subcommand_not_found` | `gatedToken` of the unknown subcommand | `getSubcommand` |
| `parse_error` | `unknown_option:<gatedFlag>` or the `arg` error code | `parseArguments` |
| `error_status` / `error_code` / `error_slug` / `error_action` | structured fields from tracked errors (all users) | `trackError` via `printError` and the root handler |
| `error_server_message` | first 500 chars of the server message (**agent sessions only**) | `trackError` |
| `docs_link_shown` | `slug` of our own err.sh/docs link | `trackError` |
| `crash` | error name + top stack-frame basename and line | uncaught handlers |
| `help_rendered` | help context (e.g. `root`) | `index.ts` |
| `project_config_error` / `project_config_validation` | `parse`/`not_found_explicit`; `NowBuildError` code | `index.ts`, `validateConfig` |
| `config_error` / `auth_config_error` | `read`/`write`; sent as a single **anonymous** event when the CLI config is unreadable | `index.ts` |
| `output:deploy_state` / `output:logs_matched` | deployment `readyState`; `SOME`/`NONE` | `printDeploymentStatus`, `displayRuntimeLogs` |
| `args_fingerprint` | HMAC of the invocation's structural shape (command token, arg count, flag names) keyed with a local-only salt that is never transmitted | `index.ts` |
| `agent`, `agent_version`, `agent_detection_source`, `agent_detection_conflict` | detected harness name/version, `env`/`proctree`/`both`, conflicts | `@vercel/detect-agent` |
| `agent_task_id` | UUID-shaped id from `AI_AGENT_TASK_ID` (anything else redacts) | `index.ts` |
| `context_id` | hash scoping the session to one terminal/harness, keyed with the same local-only salt | event store |

Sessions are persisted per context in `telemetry-session.json` as a map of
context hashes to sessions (30 min inactivity / 24 h max, pruned, capped at
50 entries).
