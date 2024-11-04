import Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import handleError from '../../util/handle-error';
import { type Command, help } from '../help';
import add from './add';
import ls from './ls';
import pull from './pull';
import rm from './rm';
import {
  envCommand,
  addSubcommand,
  listSubcommand,
  pullSubcommand,
  removeSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { EnvTelemetryClient } from '../../util/telemetry/commands/env';
import { getAliases } from '..';

const COMMAND_CONFIG = {
  ls: getAliases(listSubcommand),
  add: getAliases(addSubcommand),
  rm: getAliases(removeSubcommand),
  pull: getAliases(pullSubcommand),
};

export default async function main(client: Client) {
  const telemetry = new EnvTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(envCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(1);
  const { subcommand, args } = getSubcommand(subArgs, COMMAND_CONFIG);

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('env', subcommand);
    output.print(help(envCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: envCommand, columns: client.stderr.columns })
    );
  }

  switch (subcommand) {
    case 'ls':
      if (needHelp) {
        telemetry.trackCliFlagHelp('env', 'list');
        printHelp(listSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommand);
      return ls(client, args);
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('env', 'add');
        printHelp(addSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAdd(subcommand);
      return add(client, args);
    case 'rm':
      if (needHelp) {
        telemetry.trackCliFlagHelp('env', 'remove');
        printHelp(removeSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRemove(subcommand);
      return rm(client, args);
    case 'pull':
      if (needHelp) {
        telemetry.trackCliFlagHelp('env', 'pull');
        printHelp(pullSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandPull(subcommand);
      return pull(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(envCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
