import Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { help } from '../help';
import { integrationCommand } from './command';
import add from './add';
import handleError from '../../util/handle-error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import integrationMap from './map';
import { Output } from '../../util/output';

const COMMAND_CONFIG = {
  add: ['add'],
  rm: ['rm', 'remove'],
};

export default async function integration(client: Client): Promise<number> {
  const { cwd, output } = client;

  let parsedArguments = null;
  let subCommand;
  let integrationName;

  const flagsSpecification = getFlagsSpecification(integrationCommand.options);

  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (parsedArguments.args.length > 2) {
    output.error(
      `Invalid number of arguments!. Usage: ${getCommandName(
        'integration i <name> '
      )}`
    );
    return 1;
  }

  if (parsedArguments.flags['--help']) {
    output.print(help(integrationCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const link = await getLinkedProject(client, cwd);
  if (link.status === 'error') {
    return link.exitCode;
  }
  if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn’t linked to a project on Vercel. Run ${getCommandName(
        'link'
      )} to begin.`
    );
    return 1;
  }

  if (parsedArguments.args.includes('add')) {
    subCommand = 'add';
    integrationName = parseIntegrationName(parsedArguments.args, 'add', output);
  }

  if (parsedArguments.args.includes('i')) {
    subCommand = 'add';
    integrationName = parseIntegrationName(parsedArguments.args, 'i', output);
  }

  if (!integrationName) {
    output.log(
      `No integration name found. Usage: ${getCommandName(
        'integration i <name> '
      )}`
    );
    return 1; // Exit if there was an error parsing the integration name
  }

  if (!integrationMap.has(integrationName)) {
    output.error(
      `${integrationName} is not a known Vercel Marketplace Integration.`
    );
    return 1;
  }
  const { project } = link;

  switch (subCommand) {
    case 'add':
      return add(client, project, integrationName, output);

    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      client.output.print(
        help(integrationCommand, { columns: client.stderr.columns })
      );
      return 2;
  }
}

function parseIntegrationName(args: string[], command: string, output: Output) {
  const index = args.indexOf(command);

  if (index === -1) return null;

  if (index + 1 >= args.length) {
    output.error(
      `Invalid number of arguments!. Usage: ${getCommandName(
        `integration ${command} <name>`
      )}`
    );
    return null;
  }

  output.log(`args[index + 1]: ${args[index + 1]}`);
  return args[index + 1];
}
