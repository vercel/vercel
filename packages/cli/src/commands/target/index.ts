import Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import { help } from '../help';
import list from './list';
import { targetCommand } from './command';
import { ensureLink } from '../../util/link/ensure-link';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import handleError from '../../util/handle-error';

const COMMAND_CONFIG = {
  ls: ['ls', 'list'],
};

export default async function main(client: Client) {
  let subcommand: string | string[];

  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(targetCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  const { output } = client;

  if (parsedArgs.flags['--help']) {
    output.print(help(targetCommand, { columns: client.stderr.columns }));
    return 2;
  }

  parsedArgs.args = parsedArgs.args.slice(1);
  subcommand = parsedArgs.args[0] || 'list';
  const args = parsedArgs.args.slice(1);
  const { cwd } = client;

  const linkedProject = await ensureLink(targetCommand.name, client, cwd);
  if (typeof linkedProject === 'number') {
    return linkedProject;
  }

  switch (subcommand) {
    case 'ls':
    case 'list':
      return await list(client, parsedArgs.flags, args, linkedProject);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      client.output.print(
        help(targetCommand, { columns: client.stderr.columns })
      );
      return 2;
  }
}
