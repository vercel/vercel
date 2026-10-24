import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { validateJsonOutput } from '../../util/output-format';
import { getResources } from '../../util/integration-resource/get-resources';
import {
  getSecretsEnvVarConflicts,
  type SecretsEnvVarConflict,
  type SecretsEnvVarConflictsDetails,
  type SyncResourceSecretsResult,
  syncResourceSecrets,
} from '../../util/integration-resource/sync-resource-secrets';
import type { Resource } from '../../util/integration-resource/types';
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

  // The dry run honors --overwrite-conflicts and the caller's permissions, so
  // it previews exactly what the real run would change.
  if (dryRun || (overwriteConflicts && !skipConfirmation)) {
    let preview;
    try {
      output.spinner('Checking connected projects…', 500);
      preview = await syncResourceSecrets(client, resource, {
        dryRun: true,
        overwriteConflicts,
      });
    } catch (error) {
      output.stopSpinner();
      output.error(
        `A problem occurred while checking ${chalk.bold(resource.name)}: ${getErrorMessage(error)}`
      );
      return 1;
    }
    output.stopSpinner();

    if (dryRun) {
      if (asJson) {
        client.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
        return 0;
      }
      printDryRun(resource, preview, overwriteConflicts);
      return 0;
    }

    if (preview.overwritten.length > 0) {
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
      output.log('These environment variables will be replaced:');
      printEnvVars(preview.overwritten);
      output.log(
        'They will be removed from the listed environments and replaced with the values managed by this resource.'
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
      overwriteConflicts,
    });
  } catch (error) {
    output.stopSpinner();
    const details = getSecretsEnvVarConflicts(error);
    if (details) {
      if (asJson) {
        client.stdout.write(
          `${JSON.stringify({ resource: resource.name, synced: false, ...details }, null, 2)}\n`
        );
      } else {
        printConflictsError(resource, details, overwriteConflicts);
      }
      return 1;
    }
    if (isAPIError(error) && error.code === 'store_rotation_in_progress') {
      output.error(error.serverMessage);
      return 1;
    }
    output.error(
      `A problem occurred while syncing secrets: ${getErrorMessage(error)}`
    );
    return 1;
  }
  output.stopSpinner();

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify({ resource: resource.name, synced: true, ...result }, null, 2)}\n`
    );
    return 0;
  }

  output.success(
    `Applied the current secrets for ${chalk.bold(resource.name)} to ${pluralize(result.appliedConnectionCount, 'project connection')}. Redeploy the affected projects to use them.`
  );
  printReplaced(result);
  return 0;
}

function printDryRun(
  resource: Resource,
  preview: SyncResourceSecretsResult,
  overwriteConflicts: boolean
) {
  output.log(
    `${chalk.bold(resource.name)} would apply its current secrets to ${preview.appliedConnectionCount} of ${pluralize(preview.connectionCount, 'project connection')}.`
  );
  printReplaced(preview, { dryRun: true });

  if (preview.conflicts.length === 0 && preview.hiddenConflictCount === 0) {
    output.log('No conflicting environment variables found.');
    return;
  }
  printConflicts(preview.conflicts, preview.hiddenConflictCount);

  if (overwriteConflicts) {
    output.log(
      getResolutionText({
        canOverwrite: false,
        conflicts: preview.conflicts,
        hiddenConflictCount: preview.hiddenConflictCount,
      })
    );
  } else if (preview.conflicts.some(conflict => !conflict.managedBy)) {
    output.log(
      'Add `--overwrite-conflicts` to see which of them can be replaced.'
    );
  }
}

function printConflictsError(
  resource: Resource,
  details: SecretsEnvVarConflictsDetails,
  overwriteConflicts: boolean
) {
  printReplaced(details);
  printConflicts(details.conflicts, details.hiddenConflictCount);
  output.error(
    `Applied the current secrets for ${chalk.bold(resource.name)} to ${details.appliedConnectionCount} of ${pluralize(details.connectionCount, 'project connection')}. Conflicting environment variables blocked the rest.`
  );
  output.log(
    getResolutionText({
      canOverwrite: details.canOverwrite && !overwriteConflicts,
      conflicts: details.conflicts,
      hiddenConflictCount: details.hiddenConflictCount,
    })
  );
}

// Mirrors the API's canOverwrite: managed conflicts, hidden conflicts, or
// missing env var delete permissions block an overwrite.
function getResolutionText({
  canOverwrite,
  conflicts,
  hiddenConflictCount,
}: {
  canOverwrite: boolean;
  conflicts: SecretsEnvVarConflict[];
  hiddenConflictCount: number;
}): string {
  if (canOverwrite) {
    return 'Re-run with `--overwrite-conflicts` to replace them.';
  }
  if (conflicts.some(conflict => conflict.managedBy)) {
    return 'Some of them are managed by another resource or integration. Disconnect it from the project, then try again.';
  }
  if (hiddenConflictCount > 0) {
    return 'Someone with access to these projects and environments needs to resolve the conflicts.';
  }
  return "You don't have permission to remove these environment variables. Someone with access to these projects needs to resolve the conflicts.";
}

function printReplaced(
  result: Pick<
    SyncResourceSecretsResult,
    'overwritten' | 'reclaimed' | 'hiddenReclaimedCount'
  >,
  { dryRun = false } = {}
) {
  const replaced = [...result.overwritten, ...result.reclaimed];
  if (replaced.length === 0 && result.hiddenReclaimedCount === 0) {
    return;
  }
  output.log(
    dryRun
      ? 'Environment variables that would be replaced:'
      : 'Replaced environment variables:'
  );
  printEnvVars(replaced);
  if (result.hiddenReclaimedCount > 0) {
    output.print(
      chalk.gray(
        `  ${result.hiddenReclaimedCount} more in projects or environments you don't have access to\n`
      )
    );
  }
}

function printConflicts(
  conflicts: SecretsEnvVarConflict[],
  hiddenConflictCount = 0
) {
  output.log('Conflicting environment variables:');
  printEnvVars(conflicts);
  if (hiddenConflictCount > 0) {
    output.print(
      chalk.gray(
        `  ${hiddenConflictCount} more in projects or environments you don't have access to\n`
      )
    );
  }
}

function printEnvVars(envVars: SecretsEnvVarConflict[]) {
  for (const envVar of envVars) {
    let note = '';
    if (envVar.managedBy) {
      note = '  managed by another resource or integration';
    } else if (envVar.orphaned) {
      note = '  left over from a removed integration';
    }
    output.print(
      `  ${chalk.bold(envVar.projectName)}  ${envVar.key}  (${envVar.environments.join(', ')})${chalk.gray(note)}\n`
    );
  }
}

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function getErrorMessage(error: unknown) {
  return isAPIError(error) ? error.serverMessage : (error as Error).message;
}
