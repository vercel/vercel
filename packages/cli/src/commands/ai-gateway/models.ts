import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import list from './models-list';
import endpoints from './models-endpoints';
import {
  modelsSubcommand,
  modelsListSubcommand,
  modelsEndpointsSubcommand,
} from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { AiGatewayModelsTelemetryClient } from '../../util/telemetry/commands/ai-gateway/models';
import { printError } from '../../util/error';

const COMMAND_CONFIG = {
  list: getCommandAliases(modelsListSubcommand),
  endpoints: getCommandAliases(modelsEndpointsSubcommand),
};

export default async function models(client: Client) {
  const telemetry = new AiGatewayModelsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(modelsSubcommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification, {
      permissive: true,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  const subArgs = parsedArgs.args.slice(2);
  const { subcommand, args, subcommandOriginal } = getSubcommand(
    subArgs,
    COMMAND_CONFIG
  );

  const needHelp = parsedArgs.flags['--help'];

  if (!subcommand && needHelp) {
    telemetry.trackCliFlagHelp('ai-gateway models', subcommandOriginal);
    output.print(help(modelsSubcommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: modelsSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'list':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway models', subcommandOriginal);
        printHelp(modelsListSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandList(subcommandOriginal);
      return list(client, args);
    case 'endpoints':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway models', subcommandOriginal);
        printHelp(modelsEndpointsSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandEndpoints(subcommandOriginal);
      return endpoints(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(modelsSubcommand, { columns: client.stderr.columns }));
      return 2;
  }
}
