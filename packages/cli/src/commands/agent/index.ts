import { help } from '../help';
import { agentCommand } from './command';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { AgentTelemetryClient } from '../../util/telemetry/commands/agent';
import agentInit from './init';

export default async function agent(client: Client): Promise<number> {
  let parsedArgs;

  const flagsSpecification = getFlagsSpecification(agentCommand.options);

  const telemetry = new AgentTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('agent');
    output.print(help(agentCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const subcommand = parsedArgs.args[1];

  if (!subcommand || subcommand === 'init') {
    return agentInit(client);
  }

  output.error(`Unknown subcommand: ${subcommand}`);
  output.print(help(agentCommand, { columns: client.stderr.columns }));
  return 1;
}
