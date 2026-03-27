import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { printError } from '../../util/error';
import createApiKey from './create-api-key';
import { aiGatewayCommand, createApiKeySubcommand } from './command';
import { type Command, help } from '../help';
import { getCommandAliases } from '..';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { AiGatewayTelemetryClient } from '../../util/telemetry/commands/ai-gateway';
import output from '../../output-manager';

const COMMAND_CONFIG = {
  'create-api-key': getCommandAliases(createApiKeySubcommand),
};

export default async function main(client: Client) {
  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(aiGatewayCommand.options);
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new AiGatewayTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const { subcommand, args, subcommandOriginal } = getSubcommand(
    parsedArgs.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('ai-gateway');
    output.print(help(aiGatewayCommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: aiGatewayCommand,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  switch (subcommand) {
    case 'create-api-key':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway', subcommandOriginal);
        return printHelp(createApiKeySubcommand);
      }
      telemetry.trackCliSubcommandCreateApiKey(subcommandOriginal);
      return createApiKey(client, args);
    default:
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway', subcommandOriginal);
        output.print(
          help(aiGatewayCommand, { columns: client.stderr.columns })
        );
        return 2;
      }
      output.error(
        'Please specify a subcommand. Run `vercel ai-gateway --help` for usage information.'
      );
      return 1;
  }
}
