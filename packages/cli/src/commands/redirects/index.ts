import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import list from './list';
import listVersions from './list-versions';
import add from './add';
import remove from './remove';
import promote from './promote';
import restore from './restore';
import {
  redirectsCommand,
  listSubcommand,
  listVersionsSubcommand,
  addSubcommand,
  removeSubcommand,
  promoteSubcommand,
  restoreSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { RedirectsTelemetryClient } from '../../util/telemetry/commands/redirects';

const COMMAND_CONFIG = {
  list: getCommandAliases(listSubcommand),
  'list-versions': getCommandAliases(listVersionsSubcommand),
  add: getCommandAliases(addSubcommand),
  remove: getCommandAliases(removeSubcommand),
  promote: getCommandAliases(promoteSubcommand),
  restore: getCommandAliases(restoreSubcommand),
};

export default async function main(client: Client) {
  const telemetry = new RedirectsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(redirectsCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(1);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('redirects');
    output.print(help(redirectsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: redirectsCommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('redirects', subcommandOriginal);
        printHelp(listSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    case 'list-versions':
      if (needHelp) {
        telemetry.trackCliFlagHelp('redirects', subcommandOriginal);
        printHelp(listVersionsSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandListVersions(subcommandOriginal);
      return listVersions(client, args);
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('redirects', subcommandOriginal);
        printHelp(addSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, args);
    case 'remove':
      if (needHelp) {
        telemetry.trackCliFlagHelp('redirects', subcommandOriginal);
        printHelp(removeSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return remove(client, args);
    case 'promote':
      if (needHelp) {
        telemetry.trackCliFlagHelp('redirects', subcommandOriginal);
        printHelp(promoteSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandPromote(subcommandOriginal);
      return promote(client, args);
    case 'restore':
      if (needHelp) {
        telemetry.trackCliFlagHelp('redirects', subcommandOriginal);
        printHelp(restoreSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRestore(subcommandOriginal);
      return restore(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(redirectsCommand, { columns: client.stderr.columns }));
      return 2;
  }
}
