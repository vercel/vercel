import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type Client from '../../util/client';
import { commandDefs } from '../index';
import { commandToSchema } from '../../util/describe-command';
import { commandSchemaToZod } from './schema-to-mcp';
import { executeCommandAsTool } from './execute-tool';
import output from '../../output-manager';

interface ServeArgs {
  flags: Record<string, unknown>;
}

function getExposableCommands(
  allowedCommands?: string[]
): Array<{ name: string; description: string }> {
  const commands: Array<{ name: string; description: string }> = [];

  for (const [name, command] of commandDefs) {
    // Skip hidden commands
    if ('hidden' in command && command.hidden) continue;
    // Skip the mcp command itself (avoid recursion)
    if (name === 'mcp') continue;
    // Skip help (stub with no real handler)
    if (name === 'help') continue;

    // If a filter is provided, only include requested commands
    if (allowedCommands && allowedCommands.length > 0) {
      if (!allowedCommands.includes(name)) continue;
    }

    commands.push({
      name,
      description:
        'description' in command ? (command.description as string) : name,
    });
  }

  return commands;
}

export default async function mcpServe(
  client: Client,
  parsedArgs: ServeArgs
): Promise<number> {
  const allowedCommands = parsedArgs.flags['--commands'] as
    | string[]
    | undefined;

  const server = new McpServer({
    name: 'vercel-cli',
    version: '1.0.0',
  });

  const exposable = getExposableCommands(allowedCommands);

  if (exposable.length === 0) {
    output.error(
      'No commands to expose. Check --commands filter or available command definitions.'
    );
    return 1;
  }

  for (const cmd of exposable) {
    const commandDef = commandDefs.get(cmd.name);
    if (!commandDef) continue;

    const schema = commandToSchema(commandDef);
    const inputSchema = commandSchemaToZod(schema);
    const toolName = `vercel_${cmd.name.replace(/-/g, '_')}`;

    server.tool(toolName, cmd.description, inputSchema, async params => {
      return await executeCommandAsTool(
        client,
        cmd.name,
        params as Record<string, unknown>
      );
    });
  }

  output.debug(
    `MCP server starting with ${exposable.length} tools: ${exposable.map(c => c.name).join(', ')}`
  );

  // Connect via stdio — this takes over stdin/stdout for MCP protocol
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Block until transport closes
  await new Promise<void>(resolve => {
    transport.onclose = () => resolve();
  });

  return 0;
}
