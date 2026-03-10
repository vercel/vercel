import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { help } from '../help';
import { mcpCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { packageName } from '../../util/pkg-name';
import { outputAgentError } from '../../util/agent-output';
import mcp from './mcp';
import { MCP_CLIENT_DISPLAY_NAMES } from './constants';

function buildSuggestedMcpCommand(
  client: Client,
  clientsValue: string
): string {
  const args = client.argv.slice(2);
  // args[0] should be 'mcp'
  const preserved: string[] = [];
  let hasNonInteractive = false;
  let seenClients = false;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--non-interactive') {
      hasNonInteractive = true;
      continue;
    }
    if (arg === '--clients') {
      seenClients = true;
      i++;
      continue;
    }
    if (arg.startsWith('--clients=')) {
      continue;
    }
    if (seenClients) {
      // Skip any tokens after an unquoted --clients value to avoid
      // carrying partial client names into the suggestion.
      continue;
    }
    preserved.push(arg);
  }

  // Always quote the clients value with single quotes so it is copy-pastable
  const singleQuotedClients = `'${clientsValue}'`;
  preserved.push('--clients', singleQuotedClients);
  if (hasNonInteractive) {
    preserved.push('--non-interactive');
  }

  const suffix = preserved.join(' ');
  return suffix ? `${packageName} mcp ${suffix}` : `${packageName} mcp`;
}

function parseAndValidateClients(clientsFlag: string | undefined): string[] {
  if (!clientsFlag || !clientsFlag.trim()) return [];
  const requested = clientsFlag
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const normalized = requested.map(name => {
    const lower = name.toLowerCase();
    const match = MCP_CLIENT_DISPLAY_NAMES.find(c => c.toLowerCase() === lower);
    return match ?? name;
  });
  return [...new Set(normalized)];
}

export default async function main(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(mcpCommand.options);

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(help(mcpCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const project = !!parsedArgs.flags['--project'];
  const clientsFlag = parsedArgs.flags['--clients'] as string | undefined;
  const clients = parseAndValidateClients(clientsFlag);

  if (client.nonInteractive) {
    if (clients.length === 0) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'missing_clients',
          message:
            'In non-interactive mode --clients is required. Specify a comma-separated list of MCP clients to set up.',
          next: [
            {
              command: buildSuggestedMcpCommand(
                client,
                'Cursor,VS Code with Copilot'
              ),
            },
          ],
        },
        1
      );
      return 1;
    }
    const invalid = clients.filter(
      c => !MCP_CLIENT_DISPLAY_NAMES.some(v => v === c)
    );
    if (invalid.length > 0) {
      outputAgentError(
        client,
        {
          status: 'error',
          reason: 'invalid_clients',
          message: `Invalid client(s): ${invalid.join(
            ', '
          )}. Valid options: ${MCP_CLIENT_DISPLAY_NAMES.join(', ')}.`,
          next: [
            {
              command: buildSuggestedMcpCommand(
                client,
                'Cursor,VS Code with Copilot'
              ),
            },
          ],
        },
        1
      );
      return 1;
    }
  }

  // Add the parsed flags to client.argv so the mcp function can access them
  if (project) {
    client.argv.push('--project');
  }

  try {
    return await mcp(client, { project, clients });
  } catch (err: unknown) {
    output.prettyError(err);
    return 1;
  }
}
