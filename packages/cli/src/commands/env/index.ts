import Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import handleError from '../../util/handle-error';
import { help } from '../help';
import { getCommandName } from '../../util/pkg-name';
import { getLinkedProject } from '../../util/projects/link';

import add from './add';
import ls from './ls';
import pull from './pull';
import rm from './rm';
import { envCommand } from './command';
import parseTarget from '../../util/parse-target';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { EnvTelemetryClient } from '../../util/telemetry/commands/env';

const COMMAND_CONFIG = {
  ls: ['ls', 'list'],
  add: ['add'],
  rm: ['rm', 'remove'],
  pull: ['pull'],
};

export default async function main(client: Client) {
  const telemetryClient = new EnvTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(envCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(1);
  const { subcommand, args } = getSubcommand(subArgs, COMMAND_CONFIG);

  if (parsedArgs.flags['--help']) {
    telemetryClient.trackCliFlagHelp('env', subcommand);
    output.print(help(envCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const { cwd, config } = client;

  const target =
    parseTarget({
      flagName: 'environment',
      flags: parsedArgs.flags,
    }) || 'development';

  const link = await getLinkedProject(client, cwd);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn’t linked to a project on Vercel. Run ${getCommandName(
        'link'
      )} to begin.`
    );
    return 1;
  } else {
    config.currentTeam = link.org.type === 'team' ? link.org.id : undefined;
    switch (subcommand) {
      case 'ls':
        telemetryClient.trackCliSubcommandLs(subcommand);
        return ls(client, link, parsedArgs.flags, args);
      case 'add':
        telemetryClient.trackCliSubcommandAdd(subcommand);
        return add(client, link, parsedArgs.flags, args);
      case 'rm':
        telemetryClient.trackCliSubcommandRm(subcommand);
        return rm(client, link, parsedArgs.flags, args);
      case 'pull':
        telemetryClient.trackCliSubcommandPull(subcommand);
        return pull(
          client,
          link,
          target,
          parsedArgs.flags,
          args,
          cwd,
          'vercel-cli:env:pull'
        );
      default:
        output.error(getInvalidSubcommand(COMMAND_CONFIG));
        output.print(help(envCommand, { columns: client.stderr.columns }));
        return 2;
    }
  }
}
