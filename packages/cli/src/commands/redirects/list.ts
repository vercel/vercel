import chalk from 'chalk';
import plural from 'pluralize';
import type Client from '../../util/client';
import output from '../../output-manager';
import { listSubcommand } from './command';
import { parseSubcommandArgs, ensureProjectLink } from './shared';
import getRedirects from '../../util/redirects/get-redirects';
import getRedirectVersions from '../../util/redirects/get-redirect-versions';
import stamp from '../../util/output/stamp';
import formatTable from '../../util/format-table';
import { getCommandName } from '../../util/pkg-name';

export default async function list(client: Client, argv: string[]) {
  const parsed = await parseSubcommandArgs(argv, listSubcommand);
  if (typeof parsed === 'number') return parsed;

  const link = await ensureProjectLink(client);
  if (typeof link === 'number') return link;

  const { project, org } = link;
  const { flags } = parsed;
  const teamId = org.type === 'team' ? org.id : undefined;
  const search = flags['--search'];
  const page = flags['--page'];
  const perPage = flags['--per-page'];
  const staging = flags['--staging'];
  const versionIdFlag = flags['--version'];

  let versionId: string | undefined;
  let versionName: string | undefined;

  let useDiff = false;
  if (staging) {
    output.spinner('Fetching staging version');
    const { versions } = await getRedirectVersions(client, project.id, teamId);
    const stagingVersion = versions.find(v => v.isStaging);

    if (!stagingVersion) {
      output.error(
        `No staging version found for ${chalk.bold(project.name)}. Run ${chalk.cyan(
          'vercel redirects list-versions'
        )} to see available versions.`
      );
      return 1;
    }

    versionId = stagingVersion.id;
    versionName = stagingVersion.name || stagingVersion.id;

    if (!search && !page) {
      useDiff = true;
    }
  }

  if (versionIdFlag) {
    if (staging) {
      output.error('Cannot use both --staging and --version flags together');
      return 1;
    }

    output.spinner('Fetching version');
    const { versions } = await getRedirectVersions(client, project.id, teamId);
    const version = versions.find(
      v => v.id === versionIdFlag || v.name === versionIdFlag
    );

    if (!version) {
      output.error(
        `Version "${versionIdFlag}" not found. Run ${chalk.cyan(
          'vercel redirects list-versions'
        )} to see available versions.`
      );
      return 1;
    }

    versionId = version.id;
    versionName = version.name || version.id;
  }

  const lsStamp = stamp();

  let spinnerMessage = `Fetching redirects for ${chalk.bold(project.name)}`;
  if (versionName) {
    spinnerMessage += ` (version: ${versionName})`;
  }
  if (search) {
    spinnerMessage += ` matching "${search}"`;
  }
  output.spinner(spinnerMessage);

  const { redirects, pagination } = await getRedirects(client, project.id, {
    teamId,
    search,
    page,
    perPage,
    versionId,
    diff: useDiff,
  });

  if (useDiff) {
    const added = redirects.filter(r => r.action === '+');
    const removed = redirects.filter(r => r.action === '-');
    const unchanged = redirects.filter(r => !r.action);

    output.log(
      `Changes in staging version ${chalk.bold(versionName || '')} ${chalk.gray(lsStamp())}`
    );

    if (added.length === 0 && removed.length === 0) {
      output.log('\n  No changes from production version\n');
    } else {
      if (added.length > 0) {
        output.print(`\n  ${chalk.bold(chalk.green(`Added (${added.length}):`))}
`);
        output.print(formatRedirectsTable(added, '+'));
      }

      if (removed.length > 0) {
        output.print(`\n  ${chalk.bold(chalk.red(`Removed (${removed.length}):`))}
`);
        output.print(formatRedirectsTable(removed, '-'));
      }

      if (unchanged.length > 0) {
        output.print(
          `\n  ${chalk.gray(`${unchanged.length} redirect${unchanged.length === 1 ? '' : 's'} unchanged`)}\n`
        );
      }

      output.print('\n');
    }
  } else {
    let resultMessage = `${plural('Redirect', redirects.length, true)} found for ${chalk.bold(
      project.name
    )}`;
    if (versionName) {
      resultMessage += ` ${chalk.gray(`(version: ${versionName})`)}`;
    }
    if (search) {
      resultMessage += ` matching "${search}"`;
    }
    if (pagination) {
      resultMessage += ` ${chalk.gray(`(page ${pagination.page} of ${pagination.numPages})`)}`;
    }
    resultMessage += ` ${chalk.gray(lsStamp())}`;

    output.log(resultMessage);

    if (redirects.length > 0) {
      output.print(formatRedirectsTable(redirects));
      output.print('\n');
    }
  }

  if (pagination && pagination.page < pagination.numPages) {
    const nextPage = pagination.page + 1;
    let command = `redirects list --page ${nextPage}`;
    if (search) {
      command += ` --search "${search}"`;
    }
    if (perPage) {
      command += ` --per-page ${perPage}`;
    }
    output.log(`To display the next page, run ${getCommandName(command)}`);
  }

  return 0;
}

function formatRedirectsTable(
  redirects: Array<{
    source: string;
    destination: string;
    permanent?: boolean;
    statusCode?: number;
    action?: '+' | '-';
  }>,
  actionSymbol?: '+' | '-'
) {
  const rows: string[][] = redirects.map(redirect => {
    const status = redirect.statusCode || (redirect.permanent ? 308 : 307);
    const prefix = actionSymbol || '';
    const colorFn =
      actionSymbol === '+'
        ? chalk.green
        : actionSymbol === '-'
          ? chalk.red
          : (s: string) => s;

    return [
      colorFn(`${prefix} ${redirect.source}`),
      colorFn(`${redirect.destination}`),
      colorFn(status.toString()),
    ];
  });

  return formatTable(
    ['Source', 'Destination', 'Status'],
    ['l', 'l', 'l'],
    [{ rows }]
  );
}
