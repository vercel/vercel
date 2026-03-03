import chalk from 'chalk';
import ms from 'ms';
import type Client from '../../util/client';
import output from '../../output-manager';
import { listVersionsSubcommand } from './command';
import { parseSubcommandArgs, ensureProjectLink } from './shared';
import getRouteVersions from '../../util/routes/get-route-versions';
import stamp from '../../util/output/stamp';
import formatTable from '../../util/format-table';
import type { RouteVersion } from '../../util/routes/types';

export default async function listVersions(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, listVersionsSubcommand);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const { flags } = parsed;
  const teamId = org.type === 'team' ? org.id : undefined;
  const count = flags['--count'] as number | undefined;

  // Validate count
  if (count !== undefined) {
    if (count < 1 || count > 100) {
      output.error('Count must be between 1 and 100');
      return 1;
    }
  }

  const lsStamp = stamp();
  output.spinner(`Fetching route versions for ${chalk.bold(project.name)}`);

  const { versions } = await getRouteVersions(client, project.id, {
    teamId,
    count,
  });

  output.log(
    `Route versions for ${chalk.bold(project.name)} ${chalk.gray(lsStamp())}`
  );

  if (versions.length === 0) {
    output.log('\n  No versions found\n');
    return 0;
  }

  output.print(formatVersionsTable(versions));
  output.print('\n');

  return 0;
}

function formatVersionsTable(versions: RouteVersion[]): string {
  const rows: string[][] = versions.map(version => {
    let status = '';
    if (version.isStaging) {
      status = chalk.yellow('Staging');
    } else if (version.isLive) {
      status = chalk.green('Live');
    } else {
      status = chalk.gray('Previous');
    }

    const id = version.id.slice(0, 12);
    const routeCount =
      version.ruleCount !== undefined ? version.ruleCount.toString() : '-';
    const age = getRelativeTime(version.lastModified);

    return [status, id, routeCount, age];
  });

  return formatTable(
    ['Status', 'ID', 'Routes', 'Age'],
    ['l', 'l', 'r', 'l'],
    [{ rows }]
  );
}

function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 1000) {
    return 'just now';
  }

  return ms(diff, { long: true }) + ' ago';
}
