import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { deleteConnection } from '../../util/flags/connections';
import { quoteArg } from '../../util/flags/quote-arg';
import output from '../../output-manager';
import { FlagsConnectionsRmTelemetryClient } from '../../util/telemetry/commands/flags/connections';
import { connectionsRemoveSubcommand } from './command';
import { getProjectNameFromFlags } from './project';
import {
  connectionsError,
  resolveConsumerProject,
  resolveSourceProject,
} from './connections-common';

export default async function connectionsRm(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsConnectionsRmTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    connectionsRemoveSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 2;
  }

  const { args, flags } = parsedArgs;
  const [consumerNameOrId] = args;
  const skipConfirmation = flags['--yes'] as boolean | undefined;
  const projectName = getProjectNameFromFlags(flags);

  telemetryClient.trackCliArgumentConsumerProject(consumerNameOrId);
  telemetryClient.trackCliOptionProject(projectName);
  telemetryClient.trackCliFlagYes(skipConfirmation);

  const link = await resolveSourceProject(client, projectName);
  if (typeof link === 'number') {
    return link;
  }

  const consumer = await resolveConsumerProject(
    client,
    link,
    consumerNameOrId,
    'flags connections remove <consumer-project>'
  );
  if (typeof consumer === 'number') {
    return consumer;
  }

  const source = link.project;

  if (!skipConfirmation) {
    if (client.nonInteractive) {
      return connectionsError(client, {
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        message: `Confirm removing the connection of ${consumer.name} to the flags of ${source.name} by adding --yes.`,
        next: [
          {
            command: `flags connections remove ${quoteArg(consumerNameOrId)} --yes`,
            when: 'confirm and remove the connection',
          },
        ],
      });
    }
    const confirmed = await client.input.confirm(
      `Stop ${chalk.bold(consumer.name)} from reading the flags of ${chalk.bold(source.name)}? Its deployments lose access right away.`,
      false
    );
    if (!confirmed) {
      output.log('Aborted');
      return 0;
    }
  }

  try {
    output.spinner('Removing connection...');
    await deleteConnection(client, source.id, consumer.id);
    output.stopSpinner();

    output.success(
      `${chalk.bold(consumer.name)} may no longer read the flags of ${chalk.bold(source.name)}`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
