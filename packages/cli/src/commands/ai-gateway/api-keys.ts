import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import create from './api-keys-create';
import { apiKeysSubcommand, createSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { AiGatewayApiKeysTelemetryClient } from '../../util/telemetry/commands/ai-gateway/api-keys';
import { printError } from '../../util/error';

const COMMAND_CONFIG = {
  create: getCommandAliases(createSubcommand),
};

export default async function apiKeys(client: Client) {
  const telemetry = new AiGatewayApiKeysTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(apiKeysSubcommand.options);
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
    telemetry.trackCliFlagHelp('ai-gateway api-keys', subcommand);
    output.print(help(apiKeysSubcommand, { columns: client.stderr.columns }));
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: apiKeysSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'create':
      if (needHelp) {
        telemetry.trackCliFlagHelp('ai-gateway api-keys', subcommandOriginal);
        printHelp(createSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandCreate(subcommandOriginal);
      return create(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(help(apiKeysSubcommand, { columns: client.stderr.columns }));
      return 2;
  }
}
