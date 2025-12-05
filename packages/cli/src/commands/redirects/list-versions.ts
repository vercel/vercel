import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import type Client from '../../util/client';
import output from '../../output-manager';
import { listVersionsSubcommand } from './command';
import { parseSubcommandArgs, ensureProjectLink } from './shared';
import getRedirectVersions from '../../util/redirects/get-redirect-versions';
import type { RedirectVersion } from '../../util/redirects/get-redirect-versions';
import stamp from '../../util/output/stamp';
import formatTable from '../../util/format-table';

export default async function listVersions(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, listVersionsSubcommand);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const teamId = org.type === 'team' ? org.id : undefined;

  const lsStamp = stamp();

  output.spinner(`Fetching redirect versions for ${chalk.bold(project.name)}`);

  const { versions } = await getRedirectVersions(client, project.id, teamId);

  const sortedVersions = sortVersions(versions).slice(0, 20);

  output.log(
    `${plural('Version', sortedVersions.length, true)} found for ${chalk.bold(
      project.name
    )} ${chalk.gray(lsStamp())}`
  );

  if (sortedVersions.length > 0) {
    output.print(formatVersionsTable(sortedVersions));
    output.print('\n');
  }

  return 0;
}

function sortVersions(versions: RedirectVersion[]): RedirectVersion[] {
  return versions.slice().sort((a, b) => {
    if (a.isStaging && !b.isStaging) return -1;
    if (!a.isStaging && b.isStaging) return 1;

    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;

    return b.lastModified - a.lastModified;
  });
}

function formatVersionsTable(versions: RedirectVersion[]) {
  const now = Date.now();

  const rows: string[][] = versions.map(version => {
    const age = ms(now - version.lastModified);
    let status = '';

    if (version.isStaging) {
      status = chalk.yellow('Staging');
    } else if (version.isLive) {
      status = chalk.green('Live');
    } else {
      status = chalk.gray('Previous');
    }

    const name = version.name || chalk.gray('(unnamed)');
    const redirectCountStr =
      version.redirectCount !== undefined && version.redirectCount !== null
        ? version.redirectCount.toString()
        : chalk.gray('-');

    return [
      status,
      name,
      version.id,
      redirectCountStr,
      version.createdBy || chalk.gray('(unknown)'),
      chalk.gray(age + ' ago'),
    ];
  });

  return formatTable(
    ['Status', 'Name', 'ID', 'Redirects', 'Created By', 'Age'],
    ['l', 'l', 'l', 'r', 'l', 'l'],
    [{ rows }]
  );
}
