import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { type Command, help } from '../help';
import init from './init';
import { initSubcommand, agentsCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { AgentsTelemetryClient } from '../../util/telemetry/commands/agents';
import output from '../../output-manager';
import type Client from '../../util/client';
import { getCommandAliases } from '..';

const COMMAND_CONFIG = {
  init: getCommandAliases(initSubcommand),
};

export default async function agents(client: Client) {
  const telemetryClient = new AgentsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArguments;

  const flagsSpecification = getFlagsSpecification(agentsCommand.options);

  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { subcommand, subcommandOriginal } = getSubcommand(
    parsedArguments.args.slice(1),
    COMMAND_CONFIG
  );

  const needHelp = parsedArguments.flags['--help'];

  function printHelp(command: Command) {
    output.print(
      help(command, {
        columns: client.stderr.columns,
        parent: agentsCommand,
      })
    );
  }

  if (!subcommand && needHelp) {
    telemetryClient.trackCliFlagHelp('agents', subcommand);
    output.print(help(agentsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  switch (subcommand) {
    case 'init':
      if (needHelp) {
        telemetryClient.trackCliFlagHelp('agents', subcommandOriginal);
        printHelp(initSubcommand);
        return 2;
      }
      telemetryClient.trackCliSubcommandInit(subcommandOriginal);
      return init(client);
    default: {
      // Default to init if no subcommand is provided
      if (parsedArguments.args.length === 1) {
        telemetryClient.trackCliSubcommandInit('init');
        return init(client);
      }
      output.print(help(agentsCommand, { columns: client.stderr.columns }));
      return 2;
    }
  }
}
