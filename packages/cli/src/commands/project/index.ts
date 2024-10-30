import Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getScope from '../../util/get-scope';
import handleError from '../../util/handle-error';
import { help } from '../help';
import add from './add';
import list from './list';
import rm from './rm';
import { projectCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { ProjectTelemetryClient } from '../../util/telemetry/commands/project';
import output from '../../output-manager';

const COMMAND_CONFIG = {
  ls: ['ls', 'list'],
  add: ['add'],
  rm: ['rm', 'remove'],
};

export default async function main(client: Client) {
  const telemetryClient = new ProjectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let subcommand: string | string[];

  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(projectCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  parsedArgs.args = parsedArgs.args.slice(1);
  subcommand = parsedArgs.args[0] || 'list';
  const args = parsedArgs.args.slice(1);

  if (parsedArgs.flags['--help']) {
    telemetryClient.trackCliFlagHelp('project', parsedArgs.args[0]);
    output.print(help(projectCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const { contextName } = await getScope(client);

  switch (subcommand) {
    case 'ls':
    case 'list':
      telemetryClient.trackCliSubcommandList(subcommand);
      return await list(client, parsedArgs.flags, args, contextName);
    case 'add':
      telemetryClient.trackCliSubcommandAdd(subcommand);
      return await add(client, args, contextName);
    case 'rm':
    case 'remove':
      telemetryClient.trackCliSubcommandRm(subcommand);
      return await rm(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(projectCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
