import chalk from 'chalk';
import type Client from '../../util/client';
import output from '../../output-manager';
import { discardSubcommand } from './command';
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

export default async function discard(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, discardSubcommand);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  output.spinner(`Fetching route versions for ${chalk.bold(project.name)}`);

  const { versions } = await getRouteVersions(client, project.id, { teamId });

  const stagingVersion = versions.find(v => v.isStaging);

  if (!stagingVersion) {
    output.warn(
      `No staged changes to discard. Make changes first with ${chalk.cyan(
        getCommandName('routes add')
      )}.`
    );
    return 0;
  }

  // Fetch diff to show what will be discarded
  output.spinner('Fetching staged changes');
  const { routes: diffRoutes } = await getRoutes(client, project.id, {
    teamId,
    versionId: stagingVersion.id,
    diff: true,
  });

  const changedRoutes = diffRoutes.filter(r => r.action !== undefined);

  if (changedRoutes.length > 0) {
    output.print(`\n${chalk.bold('Changes to be discarded:')}\n\n`);
    printDiffSummary(changedRoutes);
    output.print('\n');
  } else {
    output.print(
      `\n${chalk.gray('No changes detected in staging version.')}\n\n`
    );
  }

  const confirmed = await confirmAction(
    client,
    parsed.flags['--yes'],
    'Discard all staged changes?',
    `This action cannot be undone.`
  );

  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  const updateStamp = stamp();
  output.spinner('Discarding staged changes');

  try {
    await updateRouteVersion(client, project.id, stagingVersion.id, 'discard', {
      teamId,
    });

    output.log(
      `${chalk.cyan('Success!')} Staged changes discarded ${chalk.gray(
        updateStamp()
      )}`
    );

    return 0;
  } catch (e: unknown) {
    const err = e as { message?: string };
    output.error(err.message || 'Failed to discard staged changes');
    return 1;
  }
}
