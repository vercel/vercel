import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { createConnection } from '../../util/flags/connections';
import output from '../../output-manager';
import { FlagsConnectionsAddTelemetryClient } from '../../util/telemetry/commands/flags/connections';
import { connectionsAddSubcommand } from './command';
import { getProjectNameFromFlags } from './project';
import {
  resolveConsumerProject,
  resolveSourceProject,
} from './connections-common';

export default async function connectionsAdd(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsConnectionsAddTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    connectionsAddSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 2;
  }

  const { args, flags } = parsedArgs;
  const [consumerNameOrId] = args;
  const projectName = getProjectNameFromFlags(flags);

  telemetryClient.trackCliArgumentConsumerProject(consumerNameOrId);
  telemetryClient.trackCliOptionProject(projectName);

  const link = await resolveSourceProject(client, projectName);
  if (typeof link === 'number') {
    return link;
  }

  const consumer = await resolveConsumerProject(
    client,
    link,
    consumerNameOrId,
    'flags connections add <consumer-project>'
  );
  if (typeof consumer === 'number') {
    return consumer;
  }

  const source = link.project;

  try {
    output.spinner('Connecting project...');
    await createConnection(client, source.id, consumer.id);
    output.stopSpinner();
  } catch (err) {
    output.stopSpinner();
    if (isAPIError(err) && err.code === 'flags_project_connection_exists') {
      output.log(
        `${chalk.bold(consumer.name)} already may read the flags of ${chalk.bold(source.name)}`
      );
      return 0;
    }
    printError(err);
    return 1;
  }

  output.success(
    `${chalk.bold(consumer.name)} may now read the flags of ${chalk.bold(source.name)}`
  );
  output.print('\n');
  output.print(`  ${chalk.dim('Source project ID:')}  ${source.id}\n`);

  return 0;
}
