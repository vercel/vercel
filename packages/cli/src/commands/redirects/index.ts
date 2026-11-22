import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import { type Command, help } from '../help';
import list from './list';
import listVersions from './list-versions';
import add from './add';
import upload from './upload';
import remove from './remove';
import promote from './promote';
import restore from './restore';
import {
  redirectsCommand,
  listSubcommand,
  listVersionsSubcommand,
  addSubcommand,
  uploadSubcommand,
  removeSubcommand,
  promoteSubcommand,
  restoreSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { RedirectsTelemetryClient } from '../../util/telemetry/commands/redirects';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';
import { getProjectOptionFromArgs } from '../../util/arg-common';

const COMMAND_CONFIG = {
  list: getCommandAliases(listSubcommand),
  'list-versions': getCommandAliases(listVersionsSubcommand),
  add: getCommandAliases(addSubcommand),
  import: getCommandAliases(uploadSubcommand),
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
    return 2;
  }

  const subArgs = parsedArgs.args.slice(1);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('redirects');
    output.print(
      help(redirectsCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        stream: client.stderr,
        parent: redirectsCommand,
        columns: client.stderr.columns,
      })
    );
  }

  if (subcommand && !needHelp) {
    telemetry.trackCliOptionProject(getProjectOptionFromArgs(args));
  }

  switch (subcommand) {
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('redirects', subcommandOriginal);
        printHelp(listSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    case 'list-versions':
      if (needHelp) {
        telemetry.trackCliFlagHelp('redirects', subcommandOriginal);
        printHelp(listVersionsSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandListVersions(subcommandOriginal);
      if (subcommandOriginal === 'ls-versions') {
        warnDeprecatedSubcommand(
          client,
          'redirects ls-versions',
          'redirects list-versions'
        );
      }
      return listVersions(client, args);
    case 'add':
      if (needHelp) {
        telemetry.trackCliFlagHelp('redirects', subcommandOriginal);
        printHelp(addSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandAdd(subcommandOriginal);
      return add(client, args);
    case 'import':
      if (needHelp) {
        telemetry.trackCliFlagHelp('redirects', subcommandOriginal);
        printHelp(uploadSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandImport(subcommandOriginal);
      if (subcommandOriginal === 'upload') {
        warnDeprecatedSubcommand(
          client,
          'redirects upload',
          'redirects import'
        );
      }
      return upload(client, args, subcommandOriginal);
    case 'remove':
      if (needHelp) {
        telemetry.trackCliFlagHelp('redirects', subcommandOriginal);
        printHelp(removeSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return remove(client, args);
    case 'promote':
      if (needHelp) {
        telemetry.trackCliFlagHelp('redirects', subcommandOriginal);
        printHelp(promoteSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandPromote(subcommandOriginal);
      return promote(client, args);
    case 'restore':
      if (needHelp) {
        telemetry.trackCliFlagHelp('redirects', subcommandOriginal);
        printHelp(restoreSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandRestore(subcommandOriginal);
      return restore(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(redirectsCommand, {
          stream: client.stderr,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
