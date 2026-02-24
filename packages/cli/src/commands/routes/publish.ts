import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { publishSubcommand } from './command';
import {
  parseSubcommandArgs,
  ensureProjectLink,
  confirmAction,
  printDiffSummary,
} from './shared';
import getRouteVersions from '../../util/routes/get-route-versions';
import updateRouteVersion from '../../util/routes/update-route-version';
import getRoutes from '../../util/routes/get-routes';
import stamp from '../../util/output/stamp';
import { getCommandName } from '../../util/pkg-name';

export default async function publish(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, publishSubcommand);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  output.spinner(`Fetching route versions for ${chalk.bold(project.name)}`);

  const { versions } = await getRouteVersions(client, project.id, { teamId });

  const version = versions.find(v => v.isStaging);
  if (!version) {
    output.warn(
      `No staged changes to publish. Make changes first with ${chalk.cyan(
        getCommandName('routes add')
      )}.`
    );
    return 0;
  }

  // Fetch diff to show changes
  output.spinner('Fetching changes');
  const { routes: diffRoutes } = await getRoutes(client, project.id, {
    teamId,
    versionId: version.id,
    diff: true,
  });

  const changedRoutes = diffRoutes.filter(r => r.action !== undefined);

  if (changedRoutes.length > 0) {
    output.print(`\n${chalk.bold('Changes to be published:')}\n\n`);
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
    'Publish these changes to production?',
    `This will make them live for ${chalk.bold(project.name)}.`
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const updateStamp = stamp();
  output.spinner('Publishing to production');

  try {
    const { version: newVersion } = await updateRouteVersion(
      client,
      project.id,
      version.id,
      'promote',
      { teamId }
    );

    output.log(
      `${chalk.cyan('Success!')} Routes published to production ${chalk.gray(
        updateStamp()
      )}`
    );

    if (newVersion.ruleCount !== undefined) {
      output.print(
        `  ${chalk.bold('Active routes:')} ${newVersion.ruleCount}\n`
      );
    }

    return 0;
  } catch (e: unknown) {
    const err = e as { message?: string };
    output.error(err.message || 'Failed to publish routes');
    return 1;
  }
}
