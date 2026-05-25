import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { restoreSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  confirmAction,
  validateRequiredArgs,
  printDiffSummary,
  findVersionById,
  withGlobalFlags,
} from './shared';
import getRouteVersions from '../../util/routes/get-route-versions';
import updateRouteVersion from '../../util/routes/update-route-version';
import getRoutes from '../../util/routes/get-routes';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';
import { outputAgentError } from '../../util/agent-output';

export default async function restore(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, restoreSubcommand, client);
  if (typeof parsed === 'number') return parsed;

  const error = validateRequiredArgs(parsed.args, ['version-id']);
  if (error) {
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'missing_arguments',
        message: error,
        next: [
          {
            command: withGlobalFlags(
              client,
              'routes restore <version-id> --yes'
            ),
          },
          { command: withGlobalFlags(client, 'routes list-versions') },
        ],
      });
      process.exit(1);
      return 1;
    }
    output.error(error);
    return 1;
  }

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  const [versionIdentifier] = parsed.args;

  output.spinner(`Fetching route versions for ${chalk.bold(project.name)}`);

  const { versions } = await getRouteVersions(client, project.id, { teamId });

  const result = findVersionById(versions, versionIdentifier);
  if (result.error) {
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'invalid_arguments',
        message: result.error,
        next: [{ command: withGlobalFlags(client, 'routes list-versions') }],
      });
      process.exit(1);
      return 1;
    }
    output.error(result.error);
    return 1;
  }
  const version = result.version;
  if (!version) {
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'not_found',
        message: 'Version not found.',
        next: [{ command: withGlobalFlags(client, 'routes list-versions') }],
      });
      process.exit(1);
      return 1;
    }
    output.error('Version not found.');
    return 1;
  }

  if (version.isLive) {
    const liveMsg = `Version ${version.id.slice(0, 12)} is currently live. You cannot restore the live version. Run ${getCommandName('routes list-versions')} to see previous versions you can restore.`;
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'invalid_arguments',
        message: liveMsg,
        next: [{ command: withGlobalFlags(client, 'routes list-versions') }],
      });
      process.exit(1);
      return 1;
    }
    output.error(
      `Version ${chalk.bold(
        version.id.slice(0, 12)
      )} is currently live. You cannot restore the live version.\nRun ${chalk.cyan(
        getCommandName('routes list-versions')
      )} to see previous versions you can restore.`
    );
    return 1;
  }

  if (version.isStaging) {
    const stagingMsg = `Version ${version.id.slice(0, 12)} is staged. Use ${getCommandName('routes publish')} to publish it instead.`;
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'invalid_arguments',
        message: stagingMsg,
        next: [{ command: withGlobalFlags(client, 'routes publish --yes') }],
      });
      process.exit(1);
      return 1;
    }
    output.error(
      `Version ${chalk.bold(
        version.id.slice(0, 12)
      )} is staged. Use ${chalk.cyan(
        getCommandName('routes publish')
      )} to publish it instead.`
    );
    return 1;
  }

  // Fetch diff to show what will change
  output.spinner('Fetching changes');
  const { routes: diffRoutes } = await getRoutes(client, project.id, {
    teamId,
    versionId: version.id,
    diff: true,
  });

  const changedRoutes = diffRoutes.filter(r => r.action !== undefined);

  if (changedRoutes.length > 0) {
    output.print(`\n${chalk.bold('Changes to be restored:')}\n\n`);
    printDiffSummary(changedRoutes);
    output.print('\n');
  } else {
    output.print(
      `\n${chalk.gray('No changes detected from current production version.')}\n\n`
    );
  }

  const confirmed = await confirmAction(
    client,
    parsed.flags['--yes'],
    `Restore version ${chalk.bold(version.id.slice(0, 12))} to production?`,
    `This will replace the current live routes for ${chalk.bold(project.name)}.`
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const updateStamp = stamp();
  output.spinner(`Restoring version ${chalk.bold(version.id.slice(0, 12))}`);

  try {
    const { version: newVersion } = await updateRouteVersion(
      client,
      project.id,
      version.id,
      'restore',
      { teamId }
    );

    output.log(
      `${chalk.cyan('Success!')} Version ${chalk.bold(
        newVersion.id.slice(0, 12)
      )} restored to production ${chalk.gray(updateStamp())}`
    );

    if (newVersion.ruleCount !== undefined) {
      output.print(
        `  ${chalk.bold('Active routes:')} ${newVersion.ruleCount}\n`
      );
    }

    return 0;
  } catch (e: unknown) {
    const error = e as { message?: string };
    const msg = error.message || 'Failed to restore version';
    if (client.nonInteractive) {
      outputAgentError(client, {
        status: 'error',
        reason: 'api_error',
        message: msg,
        next: [
          {
            command: withGlobalFlags(
              client,
              `routes restore ${versionIdentifier} --yes`
            ),
          },
        ],
      });
      process.exit(1);
      return 1;
    }
    output.error(msg);
    return 1;
  }
}
