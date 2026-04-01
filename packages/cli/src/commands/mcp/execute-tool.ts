import { Writable } from 'stream';
import type Client from '../../util/client';

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

type CommandHandler = (client: Client) => Promise<number>;

type ModuleWithDefault = { default: CommandHandler };

/**
 * Priority commands have their own entry points for faster loading.
 * Each returns a module with a `default` export.
 */
const PRIORITY_IMPORTS: Record<string, () => Promise<ModuleWithDefault>> = {
  deploy: () =>
    import('../deploy/index.js') as unknown as Promise<ModuleWithDefault>,
  dev: () => import('../dev/index.js') as unknown as Promise<ModuleWithDefault>,
  env: () => import('../env/index.js') as unknown as Promise<ModuleWithDefault>,
  build: () =>
    import('../build/index.js') as unknown as Promise<ModuleWithDefault>,
  list: () =>
    import('../list/index.js') as unknown as Promise<ModuleWithDefault>,
  link: () =>
    import('../link/index.js') as unknown as Promise<ModuleWithDefault>,
};

async function resolveCommandHandler(
  commandName: string
): Promise<CommandHandler> {
  // Priority commands have dedicated entry points
  if (commandName in PRIORITY_IMPORTS) {
    const mod = await PRIORITY_IMPORTS[commandName]();
    return mod.default;
  }

  // All other commands come from commands-bulk
  const bulk = (await import('../../commands-bulk.js')) as unknown as Record<
    string,
    CommandHandler
  >;

  // commands-bulk uses camelCase keys for hyphenated names
  const camelKey = commandName.replace(/-([a-z])/g, (_, c: string) =>
    c.toUpperCase()
  );
  const handler = bulk[camelKey] || bulk[commandName];
  if (!handler) {
    throw new Error(`Unknown command: ${commandName}`);
  }
  return handler;
}

/** Convert MCP params back to CLI argv */
function buildArgvFromParams(
  commandName: string,
  params: Record<string, unknown>
): string[] {
  const argv = ['vercel', commandName];

  const args = params.args;
  if (Array.isArray(args)) {
    argv.push(...args.map(String));
  }

  for (const [key, value] of Object.entries(params)) {
    if (key === 'args') continue;
    const flag = `--${key}`;

    if (typeof value === 'boolean') {
      if (value) argv.push(flag);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        argv.push(flag, String(item));
      }
    } else if (value !== undefined && value !== null) {
      argv.push(flag, String(value));
    }
  }

  // Always add --non-interactive and --yes for safety
  if (!argv.includes('--non-interactive')) argv.push('--non-interactive');
  if (!argv.includes('--yes')) argv.push('--yes');

  return argv;
}

/**
 * Execute a CLI command as an MCP tool.
 *
 * - Builds argv from the MCP params (reconstitutes --flag=value args)
 * - Creates a captured stdout to collect output
 * - Calls the command handler directly (no child_process — stays in-process)
 * - Returns the captured output as an MCP text result
 */
export async function executeCommandAsTool(
  parentClient: Client,
  commandName: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const argv = buildArgvFromParams(commandName, params);

  // Capture stdout into a buffer
  const chunks: Buffer[] = [];
  const capturedStdout = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });

  // Create a shallow copy of the client with captured stdout and forced non-interactive
  const capturedClient = Object.create(parentClient) as Client;
  capturedClient.argv = argv;
  capturedClient.stdout =
    capturedStdout as unknown as typeof parentClient.stdout;
  capturedClient.nonInteractive = true;

  try {
    const handler = await resolveCommandHandler(commandName);
    const exitCode = await handler(capturedClient);

    const output = Buffer.concat(chunks).toString('utf8');
    return {
      content: [
        {
          type: 'text' as const,
          text: output || `Command completed with exit code ${exitCode}`,
        },
      ],
      isError: exitCode !== 0,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text' as const, text: `Error: ${message}` }],
      isError: true,
    };
  }
}
