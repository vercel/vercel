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
import { packageName } from '../../util/pkg-name';

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
      type: [String], // Repeatable: --tag=a --tag=b
      deprecated: false,
      description: 'Tags to apply',
    },
  ],
  examples: [
    {
      name: 'Basic usage',
      value: `${packageName} my-command my-sub ./path`,
    },
  ],
} as const;
```

**Option types**: `String`, `Boolean`, `Number`, `[String]` (repeatable), `[Number]` (repeatable).

**Flag naming**: Use lowercase words joined by hyphens (`--advancement-type`, not `--advancementType`). Use standard names when applicable: `--yes`, `--force`, `--debug`, `--json`.

**`default: true`**: Set on a subcommand to make it the implicit action when the parent is invoked without a subcommand (e.g., `vc alias foo bar` implicitly calls `alias set`). This also makes the `command` argument optional in help text.

## Routing and Flag Parsing (`index.ts`)

The entry point handles subcommand routing, help display, flag parsing, and telemetry:

```typescript
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getSubcommand from '../../util/get-subcommand';
import { getCommandAliases } from '..';
import { help } from '../help';
import { printError } from '../../util/error';
import output from '../../output-manager';

const COMMAND_CONFIG = {
  sub1: getCommandAliases(sub1Subcommand),
  sub2: getCommandAliases(sub2Subcommand),
};

export default async function myCommand(client: Client): Promise<number> {
  const telemetry = new MyCommandTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    client.argv.slice(3),
    COMMAND_CONFIG
  );

  const needHelp = client.argv.includes('--help') || client.argv.includes('-h');

  // Top-level help
  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('my-command');
    output.print(help(myCommandDef, { columns: client.stderr.columns }));
    return 2;
  }

  try {
    switch (subcommand) {
      case 'sub1': {
        if (needHelp) {
          telemetry.trackCliFlagHelp('my-command', subcommandOriginal);
          output.print(
            help(sub1Subcommand, {
              parent: myCommandDef,
              columns: client.stderr.columns,
            })
          );
          return 2;
        }

        const parsed = parseArguments(
          args,
          getFlagsSpecification(sub1Subcommand.options)
        );

        // Track telemetry, then delegate
        telemetry.trackCliSubcommandSub1(subcommandOriginal);
        return await doSub1(client, parsed.flags);
      }
      // ...
    }
    return 0;
  } catch (err: unknown) {
    printError(err);
    return 1;
  }
}
```

**Exit codes**: `0` = success, `1` = error, `2` = help displayed.

**Permissive parsing**: Parent commands with subcommands should parse with `permissive: true` so unknown flags pass through to subcommand handlers. Subcommand handlers then do strict parsing:

```typescript
// Parent: permissive, allows unknown flags through
const parsed = parseArguments(client.argv.slice(2), flagsSpecification, {
  permissive: true,
});

// Subcommand: strict (default), rejects unknown flags
const subParsed = parseArguments(
  args,
  getFlagsSpecification(sub1Subcommand.options)
);
```

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

Use `--yes` (shorthand `-y`) to skip confirmation prompts. This is critical for CI/script usage. The common pattern:

```typescript
const yes = flags['--yes'];

// Non-TTY without --yes: fail with guidance
if (!yes && !client.stdin.isTTY) {
  output.error('Confirmation required. Use --yes to skip.');
  return 1;
}

// TTY without --yes: prompt
if (!yes) {
  const confirmed = await client.input.confirm('Are you sure?', false);
  if (!confirmed) {
    return 0;
  }
}

// --yes or confirmed: proceed
```

Import the shared option definition from `src/util/arg-common.ts` rather than redefining it.

### Interactive flow (TTY)

Use `client.input` methods for prompts. Only prompt when `stdin.isTTY` is true.

```typescript
// Single selection
const choice = await client.input.select<'a' | 'b'>({
  message: 'Pick an option:',
  choices: [
    { name: 'Option A', value: 'a' },
    { name: 'Option B', value: 'b' },
  ],
});

// Free-form text with validation
const name = await client.input.text({
  message: 'Enter a name:',
  validate: (val: string) => {
    if (!val.trim()) {
      return 'Name is required.';
    }
    return true;
  },
});

// Yes/no confirmation (second arg is the default)
const confirmed = await client.input.confirm('Apply changes?', true);
```

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

### Spinners

Wrap async operations with `output.spinner` / `output.stopSpinner`:

```typescript
output.spinner('Fetching deployments...');
try {
  const data = await client.fetch('/v1/deployments');
  output.stopSpinner();
  output.log(`Found ${data.length} deployments.`);
} catch (err) {
  output.stopSpinner();
  throw err;
}
```

Always stop the spinner before writing other output, especially before JSON output.

### JSON output

Commands that return data should support `--json` for script consumption. Use `validateJsonOutput` to check the flag:

```typescript
import { validateJsonOutput } from '../../util/output/validate-json-output';

const formatResult = validateJsonOutput(parsedArgs.flags);
if (!formatResult.valid) {
  output.error(formatResult.error);
  return 1;
}
const asJson = formatResult.jsonOutput;
```

When outputting JSON, write to `stdout` so it can be piped. Stop the spinner first:

```typescript
if (asJson) {
  output.stopSpinner();
  client.stdout.write(JSON.stringify(data, null, 2));
} else {
  // Human-readable output
  output.log(formatTable(data));
}
```

### Table formatting

Use the `table()` utility from `src/util/output/table.ts` for tabular output:

```typescript
import table from '../../util/output/table';

const output = table(
  [
    [chalk.bold('Name'), chalk.bold('Status'), chalk.bold('Created')],
    ...items.map(item => [item.name, item.status, formatDate(item.createdAt)]),
  ],
  { align: ['l', 'r', 'l'], hsep: 4 }
);
```

### Terminal links

Use `output.link` for clickable URLs that degrade gracefully:

```typescript
const name = output.link(
  project.name,
  `https://vercel.com/${org.slug}/${project.name}`,
  { fallback: () => project.name, color: false }
);
output.log(`Project: ${name}`);
```

### Pagination

List commands use `--next` (timestamp) and `--limit` with `client.fetchPaginated`:

```typescript
for await (const chunk of client.fetchPaginated<{ items: Item[] }>(
  `/v1/items?${query}`
)) {
  items.push(...chunk.items);
  pagination = chunk.pagination;
  if (items.length >= limit) {
    break;
  }
}

if (pagination?.next) {
  output.log(
    `To display the next page, run ${getCommandName(`ls --next ${pagination.next}`)}`
  );
}
```

## Error Handling

Wrap top-level command logic in try/catch using `printError`:

```typescript
try {
  return await doWork(client);
} catch (err: unknown) {
  printError(err);
  return 1;
}
```

For validation errors within a command, use `output.error` and return `1`:

```typescript
if (!flags['--name']) {
  output.error('Missing required flag --name.');
  return 1;
}
```

Use `output.prettyError` for structured error objects that have `.link` or `.action` metadata (e.g., API errors with documentation links). Use `output.error` for simple string messages.

Rewrite errors in human-friendly language with actionable guidance. Instead of exposing raw API errors, tell the user what went wrong and what to do about it.

## Telemetry

Each command has a telemetry client in `src/util/telemetry/commands/<name>/index.ts`:

```typescript
export class MyCommandTelemetryClient extends TelemetryClient {
  trackCliFlagForce(value: boolean | undefined) {
    if (value) {
      this.trackCliFlag('force', value);
    }
  }

  trackCliOptionName(value: string | undefined) {
    if (value) {
      this.trackCliOption('name', value);
    }
  }
}
```

Track flags/options after parsing, before executing the command logic. Use `trackCliFlagHelp` when help is displayed.

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

Wait for prompt text with `toOutput`, then send input with `client.stdin.write`:

```typescript
const exitCodePromise = myCommand(client);

// Wait for a select prompt, then pick the default (first) option
await expect(client.stderr).toOutput('Choose an option:');
client.stdin.write('\n');

// Wait for a text prompt, then type a value
await expect(client.stderr).toOutput('Enter a name:');
client.stdin.write('my-name\n');

// Wait for a confirm prompt, then answer yes or no
await expect(client.stderr).toOutput('Apply changes?');
client.stdin.write('y\n');

// To select a non-default option in a select prompt, press down first
await expect(client.stderr).toOutput('Pick a type:');
client.events.keypress('down'); // move to second option
client.stdin.write('\n');

await expect(client.stderr).toOutput('Successfully created.');
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

### Project linking

`getLinkedProject` returns one of three statuses. Handle all three:

```typescript
const link = await getLinkedProject(client);

if (link.status === 'error') {
  return link.exitCode;
}

if (link.status === 'not_linked') {
  output.error('No project linked. Run `vercel link` to link a project.');
  return 1;
}

const { project, org } = link;
```

Projects can also be linked via `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` environment variables (common in CI), which `getLinkedProject` checks automatically.

### Project linking in tests

If a command uses `getLinkedProject`, mock it:

```typescript
import * as linkModule from '../../../../src/util/projects/link';

vi.mock('../../../../src/util/projects/link');
const mockedGetLinkedProject = vi.mocked(linkModule.getLinkedProject);

beforeEach(() => {
  mockedGetLinkedProject.mockResolvedValue({
    status: 'linked',
    project: {
      id: 'proj_123',
      name: 'my-project',
      accountId: 'org_123',
      updatedAt: Date.now(),
      createdAt: Date.now(),
    },
    org: { id: 'org_123', slug: 'my-org', type: 'team' },
  });
});
```

Alternatively, use `useUser()`, `useTeam()`, and `useProject()` mocks with a fixture directory containing `.vercel/project.json`.

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
