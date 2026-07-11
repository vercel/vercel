import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import { printError } from '../../util/error';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { FlagsSegmentsTelemetryClient } from '../../util/telemetry/commands/flags/segments';
import segmentsLs from './segments-ls';
import segmentsInspect from './segments-inspect';
import segmentsCreate from './segments-create';
import segmentsUpdate from './segments-update';
import segmentsRm from './segments-rm';
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
  rm: getCommandAliases(segmentsRemoveSubcommand),
};

export async function segments(client: Client): Promise<number> {
  const telemetry = new FlagsSegmentsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(segmentsSubcommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(client.argv.slice(4), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
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
        parent: flagsCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
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
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return segmentsLs(client, args);
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags segments', subcommandOriginal);
        printHelp(segmentsInspectSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return segmentsInspect(client, args);
    case 'create':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags segments', subcommandOriginal);
        printHelp(segmentsCreateSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandCreate(subcommandOriginal);
      return segmentsCreate(client, args);
    case 'update':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags segments', subcommandOriginal);
        printHelp(segmentsUpdateSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandUpdate(subcommandOriginal);
      return segmentsUpdate(client, args);
    case 'rm':
      if (needHelp) {
        telemetry.trackCliFlagHelp('flags segments', subcommandOriginal);
        printHelp(segmentsRemoveSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandRemove(subcommandOriginal);
      return segmentsRm(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(segmentsSubcommand, {
          parent: flagsCommand,
          columns: client.stderr.columns,
        })
      );
      return 2;
  }
}
