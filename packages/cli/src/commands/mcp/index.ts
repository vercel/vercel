import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { help } from '../help';
import { mcpCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandName } from '../../util/pkg-name';
import mcp from './mcp';

const VALID_CLIENTS = [
  'Claude Code',
  'Claude.ai and Claude for desktop',
  'Cursor',
  'VS Code with Copilot',
];

function parseAndValidateClients(clientsFlag: string | undefined): string[] {
  if (!clientsFlag || !clientsFlag.trim()) return [];
  const requested = clientsFlag
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const normalized = requested.map(name => {
    const lower = name.toLowerCase();
    const match = VALID_CLIENTS.find(c => c.toLowerCase() === lower);
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
      output.error(
        `In non-interactive mode --clients is required. Use: ${getCommandName('mcp --clients "Cursor,VS Code with Copilot"')}`
      );
      return 1;
    }
    const invalid = clients.filter(c => !VALID_CLIENTS.some(v => v === c));
    if (invalid.length > 0) {
      output.error(
        `Invalid client(s): ${invalid.join(', ')}. Valid options: ${VALID_CLIENTS.join(', ')}.`
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
