import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { findCommandShorthands } from '../../util/command-shorthands';
import { FlagsSegmentsTelemetryClient } from '../../util/telemetry/commands/flags/segments';
import segmentsLs from './segments-ls';
import segmentsInspect from './segments-inspect';
import segmentsCreate from './segments-create';
import segmentsUpdate from './segments-update';
import segmentsRm from './segments-rm';
import { warnDeprecatedSubcommand } from '../../util/warn-deprecated-subcommand';
import {
  flagsCommand,
  segmentsCreateSubcommand,
  segmentsInspectSubcommand,
  segmentsListSubcommand,
  segmentsRemoveSubcommand,
  segmentsSubcommand,
  segmentsUpdateSubcommand,
} from './command';

const COMMAND_CONFIG = {
  ls: getCommandAliases(segmentsListSubcommand),
  inspect: getCommandAliases(segmentsInspectSubcommand),
  create: getCommandAliases(segmentsCreateSubcommand),
  update: getCommandAliases(segmentsUpdateSubcommand),
  delete: getCommandAliases(segmentsRemoveSubcommand),
};

export async function segments(client: Client): Promise<number> {
  const telemetry = new FlagsSegmentsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(segmentsSubcommand.options);
  const argv = client.argv.slice(4);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    // Leaves a subcommand's own `-d` (`--description`) to the subcommand.
    parsedArgs = parseArguments(argv, flagsSpecification, {
      permissive: true,
      commandShorthands: findCommandShorthands(
        segmentsSubcommand.subcommands,
        argv
      ),
    });
  } catch (err) {
    printError(err);
    return 2;
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('flags segments', subcommand);
    output.print(
      help(segmentsSubcommand, {
        stream: client.stderr,
        parent: flagsCommand,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        stream: client.stderr,
        parent: segmentsSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'ls':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags segments', subcommandOriginal);
        printHelp(segmentsListSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return segmentsLs(client, args);
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags segments', subcommandOriginal);
        printHelp(segmentsInspectSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return segmentsInspect(client, args);
    case 'create':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags segments', subcommandOriginal);
        printHelp(segmentsCreateSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandCreate(subcommandOriginal);
      if (subcommandOriginal === 'add') {
        warnDeprecatedSubcommand(
          client,
          'flags segments add',
          'flags segments create'
        );
      }
      return segmentsCreate(client, args);
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags segments', subcommandOriginal);
        printHelp(segmentsUpdateSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      return segmentsUpdate(client, args);
    case 'delete':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags segments', subcommandOriginal);
        printHelp(segmentsRemoveSubcommand);
        return 0;
      }
      telemetry.trackCliSubcommandDelete(subcommandOriginal);
      if (subcommandOriginal === 'remove') {
        warnDeprecatedSubcommand(
          client,
          'flags segments remove',
          'flags segments delete'
        );
      }
      return segmentsRm(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(segmentsSubcommand, {
          stream: client.stderr,
          parent: flagsCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
