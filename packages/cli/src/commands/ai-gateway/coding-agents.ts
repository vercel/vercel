import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import setup from './coding-agents-setup';
import { codingAgentsSubcommand, setupSubcommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { getCommandAliases } from '..';
import { AiGatewayCodingAgentsTelemetryClient } from '../../util/telemetry/commands/ai-gateway/coding-agents';
import { printError } from '../../util/error';

const COMMAND_CONFIG = {
  setup: getCommandAliases(setupSubcommand),
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
    case 'setup':
      if (needHelp) {
        telemetry.trackCliFlagHelp(
          'ai-gateway coding-agents',
          subcommandOriginal
        );
        printHelp(setupSubcommand);
        return 2;
      }
      telemetry.trackCliSubcommandSetup(subcommandOriginal);
      return setup(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      output.print(
        help(codingAgentsSubcommand, { columns: client.stderr.columns })
      );
      return 2;
  }
}
