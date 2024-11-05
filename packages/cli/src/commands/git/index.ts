import Client from '../../util/client';
import { ensureLink } from '../../util/link/ensure-link';
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

const COMMAND_CONFIG = {
  connect: ['connect'],
  disconnect: ['disconnect'],
};

export default async function main(client: Client) {
  let subcommand: string | string[];

  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(gitCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
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
  subcommand = parsedArgs.args[0];

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('git', subcommand);
    output.print(help(gitCommand, { columns: client.stderr.columns }));
    return 2;
  }

  telemetry.trackCliFlagConfirm(parsedArgs.flags['--confirm']);
  telemetry.trackCliFlagYes(parsedArgs.flags['--yes']);

  if ('--confirm' in parsedArgs.flags) {
    output.warn('`--confirm` is deprecated, please use `--yes` instead');
    parsedArgs.flags['--yes'] = parsedArgs.flags['--confirm'];
  }

  const args = parsedArgs.args.slice(1);
  const autoConfirm = Boolean(parsedArgs.flags['--yes']);
  const { cwd } = client;

  const linkedProject = await ensureLink('git', client, cwd, { autoConfirm });
  if (typeof linkedProject === 'number') {
    return linkedProject;
  }

  const { org, project } = linkedProject;
  client.config.currentTeam = org.type === 'team' ? org.id : undefined;

  switch (subcommand) {
    case 'connect':
      telemetry.trackCliSubcommandConnect('connect');
      return await connect(client, parsedArgs.flags, args, project, org);
    case 'disconnect':
      telemetry.trackCliSubcommandDisconnect('disconnect');
      return await disconnect(client, args, project, org);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(gitCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
