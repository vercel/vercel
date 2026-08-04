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
import {
  outputLogsError,
  outputMissingLogsSubcommand,
  shouldUseLogsJson,
} from './logs-output';
import { AGENT_REASON } from '../../util/agent-output-constants';

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
    if (shouldUseLogsJson(client, false)) {
      return outputLogsError(
        client,
        {
          reason: AGENT_REASON.INVALID_ARGUMENTS,
          message: error instanceof Error ? error.message : String(error),
        },
        true
      );
    }
    printError(error);
    return 1;
  }

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(2),
    COMMAND_CONFIG
  );
  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && (needHelp || parsedArgs.args.slice(2).length === 0)) {
    if (!needHelp && shouldUseLogsJson(client, false)) {
      return outputMissingLogsSubcommand(client);
    }
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
      if (shouldUseLogsJson(client, false)) {
        return outputLogsError(
          client,
          {
            reason: AGENT_REASON.INVALID_ARGUMENTS,
            message: 'Unknown AI Gateway logs subcommand.',
            next: [
              {
                command: 'vercel ai-gateway logs --help',
                when: 'List available logs subcommands',
              },
            ],
          },
          true
        );
      }
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(logsSubcommand, { columns: client.stderr.columns }));
      return 2;
  }
}
