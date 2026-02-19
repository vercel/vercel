# Vercel CLI — Agent Guide

This guide covers the conventions for building and testing CLI commands in `packages/cli`.

## File Organization

Each command lives in `src/commands/<name>/` with this structure:

```
src/commands/my-command/
├── command.ts              # Command metadata (flags, args, examples, description)
├── index.ts                # Entry point: routing, flag parsing, telemetry
├── do-something.ts         # Subcommand implementation
└── do-something-else.ts    # Subcommand implementation

src/util/telemetry/commands/my-command/
└── index.ts                # Telemetry client with tracking methods

test/unit/commands/my-command/
├── do-something.test.ts    # Tests per subcommand
└── do-something-else.test.ts
```

## Defining Commands (`command.ts`)

Commands are defined as `const` objects satisfying the `Command` interface from `../help`:

```typescript
export const mySubcommand = {
  name: 'my-sub',
  aliases: [],
  description: 'Does something useful',
  arguments: [{ name: 'target', required: true }],
  options: [
    {
      name: 'output',
      shorthand: 'o',
      type: String,
      argument: 'PATH',
      deprecated: false,
      description: 'Output file path',
    },
    {
      name: 'force',
      shorthand: 'f',
      type: Boolean,
      deprecated: false,
      description: 'Skip confirmation prompts',
    },
    {
      name: 'tag',
      shorthand: null,
      type: [String],
      deprecated: false,
      description: 'Tags to apply',
    }, // Repeatable: --tag=a --tag=b
  ],
  examples: [
    { name: 'Basic usage', value: `${packageName} my-command my-sub ./path` },
  ],
} as const;
```

**Option types**: `String`, `Boolean`, `Number`, `[String]` (repeatable), `[Number]` (repeatable).
**Flag naming**: Use lowercase hyphens (`--advancement-type`, not `--advancementType`). Standard names: `--yes`, `--force`, `--debug`, `--json`.

**`default: true`**: Set on a subcommand to make it the implicit action when the parent is invoked without a subcommand (e.g., `vc alias foo bar` implicitly calls `alias set`). This also makes the `command` argument optional in help text.

## Routing and Flag Parsing (`index.ts`)

The entry point resolves subcommands with `getSubcommand`, displays help for `--help`/`-h`, parses flags with `parseArguments(args, getFlagsSpecification(subcommand.options))`, tracks telemetry, and delegates to subcommand functions. Use `getCommandAliases` to build the `COMMAND_CONFIG` map. Wrap the body in `try/catch` with `printError(err)`. See `src/commands/rolling-release/index.ts` or `src/commands/alias/index.ts` for complete examples.

**Exit codes**: `0` = success, `1` = error, `2` = help displayed.
**Permissive parsing**: Parent commands with subcommands should use `permissive: true` so unknown flags pass through to subcommand handlers, which do strict parsing (default).

## Interactive Prompts vs Flags

Commands should support both interactive (TTY) and non-interactive (CI/scripts) usage. Flags always take priority over interactive prompts.

### Flag-based flow (non-interactive)

Every action that can be done interactively must also be possible with flags. When `stdin` is not a TTY and required input is missing, fail with a message explaining which flags to use:

```typescript
if (!client.stdin.isTTY) {
  output.error(
    'Missing required flags. Use --name and --target, or run interactively in a terminal.'
  );
  return 1;
}
```

### The `--yes` flag

Use `--yes` (shorthand `-y`) to skip confirmation prompts — critical for CI. If `!yes && !client.stdin.isTTY`, fail with guidance. If `!yes` in TTY, prompt with `client.input.confirm`. Import the shared option definition from `src/util/arg-common.ts` rather than redefining it.

### Interactive flow (TTY)

Use `client.input` methods for prompts. Only prompt when `stdin.isTTY` is true:

- `client.input.select({ message, choices: [{ name, value }] })` — single selection
- `client.input.text({ message, validate })` — free-form input; `validate` returns `true` or an error string
- `client.input.confirm(message, defaultValue)` — yes/no confirmation

### Structuring the priority

A common pattern is to build a payload from flags first, falling back to interactive mode:

```typescript
// 1. Explicit flags
if (flags['--name']) {
  return buildFromFlags(flags);
}

// 2. Interactive TTY
if (client.stdin.isTTY) {
  return buildInteractively(client);
}

// 3. Non-TTY with no flags = error
output.error('Missing required flags. Use --name or run interactively.');
return 1;
```

## Output

All output methods write to `stderr` (via the `output` singleton), except `output.print` which writes to `stdout`.

| Method                    | Format              | Use for                                                     |
| ------------------------- | ------------------- | ----------------------------------------------------------- |
| `output.log(msg)`         | `> msg`             | Success messages, status updates                            |
| `output.error(msg)`       | `Error: msg`        | User-facing errors                                          |
| `output.warn(msg)`        | `WARN! msg`         | Warnings that don't stop execution                          |
| `output.debug(msg)`       | `> [debug] msg`     | Debug info (only shown with `--debug`)                      |
| `output.print(msg)`       | raw to stdout       | Help text, JSON output, primary data                        |
| `output.spinner(msg)`     | animated            | Long-running operations (>100ms)                            |
| `output.success(msg)`     | styled              | Completion messages                                         |
| `output.prettyError(err)` | `Error: msg` + link | Structured error objects with `.link`/`.action` metadata    |
| `output.link(text, url)`  | clickable hyperlink | Terminal hyperlinks with fallback for unsupported terminals |

**Guidelines**:

- Send primary data (JSON, lists) to `stdout` via `output.print` or `client.stdout.write` so it can be piped.
- Send status/progress/errors to `stderr` via `output.log`, `output.error`, etc.
- Use `output.spinner` for network requests or operations that may take time. Always call `output.stopSpinner()` before other output. The spinner has an optional delay parameter (default 300ms) and degrades to plain text in non-TTY environments.
- Confirm before dangerous or irreversible operations.

### Formatting helpers

Use these from `src/util/output/` to format inline references in output strings:

```typescript
import code from '../../util/output/code';
import param from '../../util/output/param';
import cmd from '../../util/output/cmd';

output.print(`Run ${cmd('vc deploy')} to deploy`);
output.error(`Missing ${param('--token')}`);
```

### JSON output

Commands that return data should support `--json` for script consumption. Use `validateJsonOutput(parsedArgs.flags)` to check the flag. When outputting JSON, stop the spinner first and write to `stdout` so it can be piped:

```typescript
if (asJson) {
  output.stopSpinner();
  client.stdout.write(JSON.stringify(data, null, 2));
}
```

### Table formatting

Use the `table()` utility from `src/util/output/table.ts` with `{ align, hsep }` options for tabular output.

### Terminal links

Use `output.link(text, url, { fallback, color })` for clickable URLs that degrade gracefully in unsupported terminals.

### Pagination

List commands use `--next` (timestamp) and `--limit` with `client.fetchPaginated`. After iterating, print the next-page command if `pagination?.next` exists.

## Error Handling

Wrap top-level command logic in `try/catch` with `printError(err); return 1;`. For validation errors, use `output.error(msg)` and return `1`. Use `output.prettyError` for structured error objects with `.link` or `.action` metadata. Rewrite errors in human-friendly language with actionable guidance — don't expose raw API errors.

### Error hierarchy

- `NowError<C, Meta>` — Base error with typed code and metadata
- Domain errors — One-liner subclasses: `InvalidToken`, `DomainAlreadyExists`
- `APIError` — HTTP-aware: `status`, `serverMessage`, `link?`, `slug?`, `retryAfterMs?`

**Pattern:** Throw early in validation, catch at command boundary:

```typescript
try {
  // business logic
} catch (err: unknown) {
  if (err instanceof InvalidToken) {
    output.error('Token error');
    return 1;
  }
  if (isAPIError(err) && err.status >= 400 && err.status <= 499) {
    err.message = err.serverMessage;
    output.prettyError(err);
    return 1;
  }
  throw err; // Unexpected — bubbles to root handler
}
```

**Type guards:** `isAPIError(v)`, `isErrnoException(err)` from `src/util/errors-ts.ts`.

## Telemetry

Each command has a telemetry client in `src/util/telemetry/commands/<name>/index.ts` extending `TelemetryClient`, implementing `TelemetryMethods<typeof command>`:

```typescript
export class DeployTelemetryClient extends TelemetryClient
  implements TelemetryMethods<typeof deployCommand> {
  trackCliArgumentProjectPath(path: string | undefined) { ... }
  trackCliOptionArchive(format: string | undefined) { ... }
  trackCliFlagForce(flag: boolean | undefined) { ... }
}
```

**Naming convention:**

- `trackCliArgument[Name]` — positional arguments
- `trackCliOption[Name]` — named options with values
- `trackCliFlag[Name]` — boolean flags

Track flags/options after parsing, before executing the command logic. Use `trackCliFlagHelp` when help is displayed.

**Redaction:** Use `this.redactedValue = '[REDACTED]'` for sensitive values. Use `this.redactedArgumentsLength(args)` which returns `'ONE'`, `'MANY'`, or `'NONE'`.

## Writing Tests

Tests live in `test/unit/commands/<name>/`. They use a shared mock client that starts an Express-based mock API server.

### Basic structure

```typescript
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import myCommand from '../../../../src/commands/my-command';

describe('my-command', () => {
  beforeEach(() => {
    client.reset();
    // Set up mock API routes
    client.scenario.get('/v1/some-endpoint', (req, res) => {
      res.json({ data: 'value' });
    });
  });

  it('should succeed with valid flags', async () => {
    client.setArgv('my-command', 'sub', '--flag=value');

    const exitCode = await myCommand(client);

    expect(exitCode).toBe(0);
  });
});
```

### Mocking API routes with `client.scenario`

Use Express route handlers to mock API endpoints. The mock server receives real HTTP requests from `client.fetch`:

```typescript
let requestBody: any;

client.scenario.patch('/v1/projects/:projectId/config', (req, res) => {
  requestBody = req.body;
  res.json({});
});

// After command runs:
expect(requestBody).toEqual({ enabled: true });
```

Unhandled routes return a 500 error with `mock_unimplemented`.

### Checking output with `toOutput`

Use `await expect(client.stderr).toOutput(text)` to assert on output. This waits (up to 3s) for the text to appear in the stderr stream:

```typescript
// For errors (output.error prefixes with "Error: ")
const exitCodePromise = myCommand(client);
await expect(client.stderr).toOutput('Error: Missing required flag --name.');
expect(await exitCodePromise).toBe(1);

// For success messages (output.log prefixes with "> ")
const exitCode = await myCommand(client);
await expect(client.stderr).toOutput('Successfully created.');
expect(exitCode).toBe(0);
```

### Testing interactive prompts

Wait for prompt text with `toOutput`, then send input:

```typescript
const exitCodePromise = myCommand(client);

await expect(client.stderr).toOutput('Choose an option:');
client.stdin.write('\n'); // select default option

await expect(client.stderr).toOutput('Apply changes?');
client.stdin.write('y\n'); // confirm

expect(await exitCodePromise).toBe(0);
```

### Testing non-TTY behavior

The mock client defaults `isTTY = true`. Override it to test non-interactive paths:

```typescript
client.setArgv('my-command', 'configure');
(client.stdin as any).isTTY = false;

const exitCodePromise = myCommand(client);

await expect(client.stderr).toOutput('Error: Missing required flags.');
expect(await exitCodePromise).toBe(1);
```

### Custom matchers

- `toHaveTelemetryEvents([{ key, value }])` — assert telemetry events were emitted
- `toOutput(text)` — wait (up to 3s) for text to appear in stderr stream

### Test cleanup

```typescript
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
```

### Running tests

From the repo root:

```bash
npx vitest run packages/cli/test/unit/commands/my-command/my-test.test.ts
```

### Manual testing

Build and run the CLI locally:

```bash
pnpm build
node packages/cli/dist/index.js <command> [args]
```

## Import Style

- **Relative paths only** — no path aliases: `import { parseArguments } from '../../util/get-args'`
- **Type imports separated:** `import type Client from '../../util/client'`
- **Default export** for command handlers. **Named exports** for utilities, types, error classes.

## General CLI Best Practices

- **Prefer flags to positional arguments.** Flags are self-documenting and order-independent.
- **Lead help text with examples.** Users gravitate toward examples over abstract descriptions.
- **Validate early, fail fast.** Check inputs before making API calls or mutating state.
- **Use curly braces** for all `if` statements, even single-line ones.
- **Be responsive.** Print feedback within 100ms so the CLI doesn't appear to hang.
- **Make errors actionable.** Tell the user what went wrong and what to do about it, not just that something failed.
- **Keep output concise.** Say just enough — don't overwhelm with verbose success messages.
- **Design for both humans and scripts.** Human-readable output by default, `--json` for machine consumption. Detect TTY and adapt behavior accordingly.
- **Never require interactive prompts.** Every interactive action must have an equivalent flag-based path. Use `--yes` to skip confirmations in CI.
- **Never accept secrets via flags.** Flags leak into `ps` output and shell history. Accept tokens and credentials via environment variables, config files, or stdin instead.
- **Guide users to the next step.** After completing an action or encountering an error, suggest the next command to run (e.g., "Run `vercel link` to link a project" or "To display the next page, run `vercel ls --next 1234`").
- **Use consistent flag names across subcommands.** The same concept should use the same flag name everywhere — `--yes` not `--confirm` in one place and `--yes` in another. Import shared options from `src/util/arg-common.ts`.
