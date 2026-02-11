import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import cmd from '../../util/output/cmd';
import { ensureLink } from '../../util/link/ensure-link';
import { addRepoLink, ensureRepoLink } from '../../util/link/repo';
import { type Command, help } from '../help';
import { addSubcommand, linkCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { LinkTelemetryClient } from '../../util/telemetry/commands/link';
import { getCommandAliases } from '..';

const COMMAND_CONFIG = {
  add: getCommandAliases(addSubcommand),
};

export default async function link(client: Client) {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(linkCommand.options);

  // Parse CLI args (permissive to allow subcommand flags to pass through)
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const { subcommand, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const telemetry = new LinkTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: linkCommand, columns: client.stderr.columns })
    );
  }

  if (subcommand === 'add') {
    // `vc link add` subcommand
    // `--yes` is shared with the parent and already parsed by the permissive parse
    if (parsedArgs.flags['--help']) {
      telemetry.trackCliFlagHelp('link', subcommandOriginal);
      printHelp(addSubcommand);
      return 2;
    }

    telemetry.trackCliSubcommandAdd(subcommandOriginal);

    const yes = !!parsedArgs.flags['--yes'];

    try {
      await addRepoLink(client, client.cwd, { yes });
    } catch (err) {
      output.prettyError(err);
      return 1;
    }

    return 0;
  }

  // Default behavior (no subcommand) - original `vc link` flow
  // Re-parse strictly now that we know there's no subcommand
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('link');
    output.print(help(linkCommand, { columns: client.stderr.columns }));
    return 2;
  }

  telemetry.trackCliFlagRepo(parsedArgs.flags['--repo']);
  telemetry.trackCliFlagYes(parsedArgs.flags['--yes']);
  telemetry.trackCliOptionProject(parsedArgs.flags['--project']);

  if ('--confirm' in parsedArgs.flags) {
    telemetry.trackCliFlagConfirm(parsedArgs.flags['--confirm']);
    output.warn('`--confirm` is deprecated, please use `--yes` instead');
    parsedArgs.flags['--yes'] = parsedArgs.flags['--confirm'];
  }

  const yes = !!parsedArgs.flags['--yes'];

  let cwd = parsedArgs.args[1];
  if (cwd) {
    telemetry.trackCliArgumentCwd();
    output.warn(
      `The ${cmd('vc link <directory>')} syntax is deprecated, please use ${cmd(
        `vc link --cwd ${cwd}`
      )} instead`
    );
  } else {
    cwd = client.cwd;
  }

  if (parsedArgs.flags['--repo']) {
    output.warn(`The ${cmd('--repo')} flag is in alpha, please report issues`);
    try {
      await ensureRepoLink(client, cwd, { yes, overwrite: true });
    } catch (err) {
      output.prettyError(err);
      return 1;
    }
  } else {
    const link = await ensureLink('link', client, cwd, {
      autoConfirm: yes,
      forceDelete: true,
      projectName: parsedArgs.flags['--project'],
      successEmoji: 'success',
    });

    if (typeof link === 'number') {
      return link;
    }
  }

  return 0;
}
