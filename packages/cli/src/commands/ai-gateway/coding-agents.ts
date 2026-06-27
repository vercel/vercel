import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import connect from './coding-agents-connect';
import { codingAgentsSubcommand, connectSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { AiGatewayCodingAgentsTelemetryClient } from '../../util/telemetry/commands/ai-gateway/coding-agents';
import { printError } from '../../util/error';

const COMMAND_CONFIG = {
  connect: getCommandAliases(connectSubcommand),
};

export default async function codingAgents(client: Client) {
  const telemetry = new AiGatewayCodingAgentsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(
    codingAgentsSubcommand.options
  );
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
    telemetry.trackCliFlagHelp('ai-gateway coding-agents', subcommand);
    output.print(
      help(codingAgentsSubcommand, { columns: client.stderr.columns })
    );
    return 2;
  }

  function printHelp(command: Command) {
    output.print(
      help(command, {
        parent: codingAgentsSubcommand,
        columns: client.stderr.columns,
      })
    );
  }

  switch (subcommand) {
    case 'connect':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'ai-gateway coding-agents',
          subcommandOriginal
        );
        printHelp(connectSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandConnect(subcommandOriginal);
      return connect(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(codingAgentsSubcommand, { columns: client.stderr.columns })
      );
      return 2;
  }
}
