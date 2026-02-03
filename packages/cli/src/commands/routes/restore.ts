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
} from './shared';
import getRouteVersions from '../../util/routes/get-route-versions';
import updateRouteVersion from '../../util/routes/update-route-version';
import getRoutes from '../../util/routes/get-routes';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';

export default async function restore(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, restoreSubcommand);
  if (typeof parsed === 'number') return parsed;

  const error = validateRequiredArgs(parsed.args, ['version-id']);
  if (error) {
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

  const version = versions.find(v => v.id === versionIdentifier);

  if (!version) {
    output.error(
      `Version "${versionIdentifier}" not found. Run ${chalk.cyan(
        getCommandName('routes list-versions')
      )} to see available versions.`
    );
    return 1;
  }

  if (version.isLive) {
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
    output.print(`  ${chalk.bold('Active routes:')} ${newVersion.ruleCount}\n`);
  }

  return 0;
}
