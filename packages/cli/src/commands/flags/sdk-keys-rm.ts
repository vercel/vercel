import chalk from 'chalk';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getLinkedProject } from '../../util/projects/link';
import { getCommandName } from '../../util/pkg-name';
import {
  buildCommandWithGlobalFlags,
  buildCommandWithYes,
  outputAgentError,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';
import { getSdkKeys, deleteSdkKey } from '../../util/flags/sdk-keys';
import output from '../../output-manager';
import { FlagsSdkKeysRmTelemetryClient } from '../../util/telemetry/commands/flags/sdk-keys';
import { sdkKeysRemoveSubcommand } from './command';

export default async function sdkKeysRm(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new FlagsSdkKeysRmTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  const flagsSpecification = getFlagsSpecification(
    sdkKeysRemoveSubcommand.options
  );
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;
  let [hashKey] = args;
  const skipConfirmation = flags['--yes'] as boolean | undefined;

  telemetryClient.trackCliArgumentKey(hashKey);
  telemetryClient.trackCliFlagYes(skipConfirmation);

  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  } else if (link.status === 'not_linked') {
    if (client.nonInteractive) {
      outputAgentError(
        client,
        {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.NOT_LINKED,
          message: 'Your codebase is not linked to a project. Run link first.',
          next: [
            {
              command: buildCommandWithGlobalFlags(client.argv, 'link'),
            },
          ],
        },
        1
      );
      return 1;
    }
    output.error(
      `Your codebase isn't linked to a project on Vercel. Run ${getCommandName('link')} to begin.`
    );
    return 1;
  }

  if (client.nonInteractive && !skipConfirmation) {
    outputAgentError(
      client,
      {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.CONFIRMATION_REQUIRED,
        message:
          'Deleting an SDK key requires confirmation. Re-run with --yes.',
        next: [{ command: buildCommandWithYes(client.argv) }],
      },
      1
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const { project } = link;

  try {
    // If no hash key provided, let user select from existing keys (or error in non-interactive)
    if (!hashKey) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: AGENT_STATUS.ERROR,
            reason: AGENT_REASON.MISSING_ARGUMENTS,
            message:
              'Please provide the SDK key hash to delete. Run "vercel flags sdk-keys ls" to list keys.',
            next: [
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'flags sdk-keys ls'
                ),
              },
              {
                command: buildCommandWithGlobalFlags(
                  client.argv,
                  'flags sdk-keys rm <hashKey> --yes'
                ),
              },
            ],
          },
          1
        );
        return 1;
      }
      output.spinner('Fetching SDK keys...');
      const keys = await getSdkKeys(client, project.id);
      output.stopSpinner();

      if (keys.length === 0) {
        if (client.nonInteractive) {
          client.stdout.write(
            `${JSON.stringify({ status: 'ok', message: 'No SDK keys found.', keys: [] }, null, 2)}\n`
          );
          return 0;
        }
        output.log('No SDK keys found');
        return 0;
      }

      hashKey = await client.input.select({
        message: 'Select an SDK key to delete:',
        choices: keys.map(key => ({
          name: `${key.hashKey.slice(0, 12)}... (${key.type}, ${key.environment}${key.label ? `, ${key.label}` : ''})`,
          value: key.hashKey,
        })),
      });
    }

    // Confirm deletion
    if (!skipConfirmation) {
      const confirmed = await client.input.confirm(
        `Are you sure you want to delete SDK key ${chalk.bold(hashKey.slice(0, 12) + '...')}?`,
        false
      );

      if (!confirmed) {
        if (!client.nonInteractive) output.log('Aborted');
        return 0;
      }
    }

    if (!client.nonInteractive) {
      output.spinner('Deleting SDK key...');
    }
    await deleteSdkKey(client, project.id, hashKey);
    output.stopSpinner();

    if (client.nonInteractive) {
      client.stdout.write(
        `${JSON.stringify(
          {
            status: 'ok',
            key: { hashKey: hashKey.slice(0, 12) + '...' },
            message: 'SDK key has been deleted.',
          },
          null,
          2
        )}\n`
      );
      return 0;
    }

    output.success(
      `SDK key ${chalk.bold(hashKey.slice(0, 12) + '...')} has been deleted`
    );
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
