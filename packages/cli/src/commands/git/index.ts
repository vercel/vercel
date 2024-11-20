import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import handleError from '../../util/handle-error';
import connect from './connect';
import disconnect from './disconnect';
import { help } from '../help';
import { gitCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { GitTelemetryClient } from '../../util/telemetry/commands/git';
import type Client from '../../util/client';

const COMMAND_CONFIG = {
  connect: ['connect'],
  disconnect: ['disconnect'],
};

export default async function main(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(gitCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    handleError(error);
    return 1;
  }
  const telemetry = new GitTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  parsedArgs.args = parsedArgs.args.slice(1);
  const subcommand = parsedArgs.args[0];
  const args = parsedArgs.args.slice(1);

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('git', subcommand);
    output.print(help(gitCommand, { columns: client.stderr.columns }));
    return 2;
  }

  switch (subcommand) {
    case 'connect':
      telemetry.trackCliSubcommandConnect('connect');
      return connect(client, args);
    case 'disconnect':
      telemetry.trackCliSubcommandDisconnect('disconnect');
      return disconnect(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(gitCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
