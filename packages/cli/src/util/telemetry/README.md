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
  const exitCodePromise = joke(client); // call the command function
  await expect(exitCodePromise).resolves.toEqual(0); // ensure the command reaches completion with success

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
