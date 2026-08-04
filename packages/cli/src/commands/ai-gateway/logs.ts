import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import list from './logs-list';
import inspect from './logs-inspect';
import {
  logsInspectSubcommand,
  logsListSubcommand,
  logsSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { AiGatewayLogsTelemetryClient } from '../../util/telemetry/commands/ai-gateway/logs';
import { printError } from '../../util/error';

const COMMAND_CONFIG = {
  inspect: getCommandAliases(logsInspectSubcommand),
  list: getCommandAliases(logsListSubcommand),
};

export default async function logs(client: Client) {
  const telemetry = new AiGatewayLogsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });
  const flagsSpecification = getFlagsSpecification(logsSubcommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(2),
    COMMAND_CONFIG
  );
  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('ai-gateway logs', subcommandOriginal);
    output.print(help(logsSubcommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, { parent: logsSubcommand, columns: client.stderr.columns })
    );
  }

  switch (subcommand) {
    case 'inspect':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway logs', subcommandOriginal);
        printHelp(logsInspectSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandInspect(subcommandOriginal);
      return inspect(client, args);
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway logs', subcommandOriginal);
        printHelp(logsListSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(logsSubcommand, { columns: client.stderr.columns }));
      return 2;
  }
}
