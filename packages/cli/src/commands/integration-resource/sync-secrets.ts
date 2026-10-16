import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { getResources } from '../../util/integration-resource/get-resources';
import {
  type SecretsEnvVarConflict,
  syncResourceSecrets,
} from '../../util/integration-resource/sync-resource-secrets';
import { IntegrationResourceSyncSecretsTelemetryClient } from '../../util/telemetry/commands/integration-resource/sync-secrets';
import { buildCommandWithYes, outputAgentError } from '../../util/agent-output';
import { syncSecretsSubcommand } from './command';

export async function syncSecrets(client: Client, argv: string[]) {
  const telemetry = new IntegrationResourceSyncSecretsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArguments = null;
  try {
    parsedArguments = parseArguments(
      argv,
      getFlagsSpecification(syncSecretsSubcommand.options)
    );
  } catch (error) {
    printError(error);
    return 1;
  }

  const formatResult = validateJsonOutput(parsedArguments.flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;
  const skipConfirmation = !!parsedArguments.flags['--yes'];
  const overwriteConflicts = !!parsedArguments.flags['--overwrite-conflicts'];
  const dryRun = !!parsedArguments.flags['--dry-run'];

  telemetry.trackCliOptionFormat(parsedArguments.flags['--format']);
  telemetry.trackCliFlagYes(skipConfirmation);
  telemetry.trackCliFlagOverwriteConflicts(overwriteConflicts);
  telemetry.trackCliFlagDryRun(dryRun);

  if (dryRun && overwriteConflicts) {
    output.error('Cannot use `--dry-run` with `--overwrite-conflicts`.');
    return 1;
  }

  if (parsedArguments.args.length !== 1) {
    output.error('You must specify one resource. See `--help` for details.');
    return 1;
  }
  const resourceName = parsedArguments.args[0];
  telemetry.trackCliArgumentResource(resourceName);

  const { team } = await getScope(client);
  if (!team) {
    output.error('Team not found.');
    return 1;
  }
  client.config.currentTeam = team.id;

  output.spinner('Retrieving resource…', 500);
  const resources = await getResources(client);
  const resource = resources.find(r => r.name === resourceName);
  output.stopSpinner();

  if (!resource) {
    output.error(`No resource ${chalk.bold(resourceName)} found.`);
    return 1;
  }
  if (!resource.product?.integrationConfigurationId) {
    output.error(
      `Resource ${chalk.bold(resource.name)} is not a marketplace integration resource.`
    );
    return 1;
  }

  let preview;
  try {
    output.spinner('Checking connected projects…', 500);
    preview = await syncResourceSecrets(client, resource, { dryRun: true });
  } catch (error) {
    output.error(
      `A problem occurred while checking ${chalk.bold(resource.name)}: ${(error as Error).message}`
    );
    return 1;
  } finally {
    output.stopSpinner();
  }

  const { conflicts } = preview;
  const managedConflicts = conflicts.filter(c => c.managedBy);

  if (dryRun) {
    if (asJson) {
      client.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
      return 0;
    }
    output.log(
      `${chalk.bold(resource.name)} is connected to ${preview.connectionIds.length} project connection${preview.connectionIds.length === 1 ? '' : 's'}.`
    );
    if (conflicts.length === 0) {
      output.log('No conflicting environment variables found.');
    } else {
      printConflicts(conflicts);
    }
    return 0;
  }

  if (conflicts.length > 0) {
    if (!asJson) {
      printConflicts(conflicts);
    }

    if (managedConflicts.length > 0) {
      output.error(
        'Some conflicting environment variables are managed by another resource or integration and cannot be overwritten. Disconnect it from the project, then try again.'
      );
      return 1;
    }

    if (!overwriteConflicts) {
      output.error(
        `Environment variables on connected projects conflict with ${chalk.bold(resource.name)}. Re-run with \`--overwrite-conflicts\` to replace them.`
      );
      return 1;
    }

    if (!skipConfirmation) {
      if (client.nonInteractive) {
        outputAgentError(
          client,
          {
            status: 'error',
            reason: 'confirmation_required',
            message:
              'Overwriting conflicting environment variables requires confirmation. Re-run with --yes.',
            next: [{ command: buildCommandWithYes(client.argv) }],
          },
          1
        );
        output.error(
          'Confirmation required. Use `--yes` to skip the confirmation prompt.'
        );
        return 1;
      }
      if (!client.stdin.isTTY || asJson) {
        output.error(
          'Confirmation required. Use `--yes` to skip the confirmation prompt.'
        );
        return 1;
      }
      output.log(
        'These environment variables will be removed from the listed environments and replaced with the values managed by this resource.'
      );
      if (!(await client.input.confirm(chalk.red('Are you sure?'), false))) {
        output.log('Canceled');
        return 0;
      }
    }
  }

  let result;
  try {
    output.spinner('Applying secrets to connected projects…', 500);
    result = await syncResourceSecrets(client, resource, {
      overwriteConflicts: conflicts.length > 0 && overwriteConflicts,
    });
  } catch (error) {
    output.error(
      `A problem occurred while syncing secrets: ${(error as Error).message}`
    );
    return 1;
  } finally {
    output.stopSpinner();
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify({ resource: resource.name, synced: true, ...result }, null, 2)}\n`
    );
    return 0;
  }

  output.success(
    `Applied the current secrets for ${chalk.bold(resource.name)} to ${result.connectionIds.length} project connection${result.connectionIds.length === 1 ? '' : 's'}. Redeploy the affected projects to use them.`
  );
  return 0;
}

function printConflicts(conflicts: SecretsEnvVarConflict[]) {
  output.log('Conflicting environment variables:');
  for (const conflict of conflicts) {
    output.print(
      `  ${chalk.bold(conflict.projectName)}  ${conflict.key}  (${conflict.environments.join(', ')})${conflict.managedBy ? chalk.gray('  managed by another resource or integration') : ''}\n`
    );
  }
}
