import chalk from 'chalk';
import ms from 'ms';
import table from 'text-table';
import title from 'title';
import Now from '../../util';
import getArgs from '../../util/get-args';
import { handleError } from '../../util/error';
import elapsed from '../../util/output/elapsed';
import strlen from '../../util/strlen';
import toHost from '../../util/to-host';
import parseMeta from '../../util/parse-meta';
import { isValidName } from '../../util/is-valid-name';
import getCommandFlags from '../../util/get-command-flags';
import { getCommandName } from '../../util/pkg-name';
import Client from '../../util/client';
import { Deployment } from '@vercel/client';
import { getLinkedProject } from '../../util/projects/link';
import { ensureLink } from '../../util/link/ensure-link';
import getScope from '../../util/get-scope';
import { isAPIError } from '../../util/errors-ts';
import { isErrnoException } from '@vercel/error-utils';
import { help } from '../help';
import { listCommand } from './command';

export default async function list(client: Client) {
  let argv;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--environment': String,
      '--meta': [String],
      '-m': '--meta',
      '--next': Number,
      '-N': '--next',
      '--prod': Boolean, // this can be deprecated someday
      '--yes': Boolean,
      '-y': '--yes',

      // deprecated
      '--confirm': Boolean,
      '-c': '--confirm',
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  const { cwd, output, config } = client;

  if ('--confirm' in argv) {
    output.warn('`--confirm` is deprecated, please use `--yes` instead');
    argv['--yes'] = argv['--confirm'];
  }

  const { print, log, error, note, debug, spinner } = output;

  if (argv._.length > 2) {
    error(`${getCommandName('ls [app]')} accepts at most one argument`);
    return 1;
  }

  if (argv['--help']) {
    output.print(help(listCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const autoConfirm = !!argv['--yes'];
  const meta = parseMeta(argv['--meta']);

  const target = argv['--prod']
    ? 'production'
    : typeof argv['--environment'] === 'string'
    ? argv['--environment'].toLowerCase()
    : undefined;

  // retrieve `project` and `org` from .vercel
  let link = await getLinkedProject(client, cwd);

  if (link.status === 'error') {
    return link.exitCode;
  }

  let { org, project, status } = link;
  const appArg: string | undefined = argv._[1];
  let app: string | undefined = appArg || project?.name;
  let host: string | undefined = undefined;

  if (app && !isValidName(app)) {
    error(`The provided argument "${app}" is not a valid project name`);
    return 1;
  }

  // If there's no linked project and user doesn't pass `app` arg,
  // prompt to link their current directory.
  if (status === 'not_linked' && !app) {
    const linkedProject = await ensureLink('list', client, cwd, {
      autoConfirm,
      link,
    });
    if (typeof linkedProject === 'number') {
      return linkedProject;
    }
    org = linkedProject.org;
    project = linkedProject.project;
    app = project.name;
  }

  let contextName;
  let team;

  try {
    ({ contextName, team } = await getScope(client));
  } catch (err: unknown) {
    if (
      isErrnoException(err) &&
      (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED')
    ) {
      error(err.message);
      return 1;
    }
  }

  // If user passed in a custom scope, update the current team & context name
  if (argv['--scope']) {
    client.config.currentTeam = team?.id || undefined;
    if (team?.slug) contextName = team.slug;
  } else {
    client.config.currentTeam = org?.type === 'team' ? org.id : undefined;
    if (org?.slug) contextName = org.slug;
  }

  const { currentTeam } = config;

  ({ contextName } = await getScope(client));

  const nextTimestamp = argv['--next'];

  if (typeof nextTimestamp !== 'undefined' && Number.isNaN(nextTimestamp)) {
    error('Please provide a number for flag `--next`');
    return 1;
  }

  spinner(`Fetching deployments in ${chalk.bold(contextName)}`);

  const now = new Now({
    client,
    currentTeam,
  });
  const start = Date.now();

  if (app && !isValidName(app)) {
    error(`The provided argument "${app}" is not a valid project name`);
    return 1;
  }

  // Some people are using entire domains as app names, so
  // we need to account for this here
  const asHost = app ? toHost(app) : '';
  if (asHost.endsWith('.now.sh') || asHost.endsWith('.vercel.app')) {
    note(
      `We suggest using ${getCommandName(
        'inspect <deployment>'
      )} for retrieving details about a single deployment`
    );

    const hostParts: string[] = asHost.split('-');

    if (hostParts.length < 2) {
      error('Only deployment hostnames are allowed, no aliases');
      return 1;
    }

    app = undefined;
    host = asHost;
  }

  debug('Fetching deployments');

  const response = await now.list(app, {
    version: 6,
    meta,
    nextTimestamp,
    target,
  });

  let {
    deployments,
    pagination,
  }: {
    deployments: Deployment[];
    pagination: { count: number; next: number };
  } = response;

  let showUsername = false;
  for (const deployment of deployments) {
    const username = deployment.creator?.username;
    if (username !== contextName) {
      showUsername = true;
    }
  }

  if (app && !deployments.length) {
    debug(
      'No deployments: attempting to find deployment that matches supplied app name'
    );
    let match;

    try {
      await now.findDeployment(app);
    } catch (err: unknown) {
      if (isAPIError(err) && err.status === 404) {
        debug('Ignore findDeployment 404');
      } else {
        throw err;
      }
    }

    if (match !== null && typeof match !== 'undefined') {
      debug('Found deployment that matches app name');
      deployments = Array.of(match);
    }
  }

  now.close();

  if (host) {
    deployments = deployments.filter(deployment => deployment.url === host);
  }

  // we don't output the table headers if we have no deployments
  if (!deployments.length) {
    log(`No deployments found.`);
    return 0;
  }

  log(
    `${
      target === 'production' ? `Production deployments` : `Deployments`
    } for ${chalk.bold(app)} under ${chalk.bold(contextName)} ${elapsed(
      Date.now() - start
    )}`
  );

  // information to help the user find other deployments or instances
  log(
    `To list deployments for a project, run ${getCommandName('ls [project]')}.`
  );

  print('\n');

  const headers = ['Age', 'Deployment', 'Status', 'Environment', 'Duration'];
  if (showUsername) headers.push('Username');
  const urls: string[] = [];

  client.output.print(
    `${table(
      [
        headers.map(header => chalk.bold(chalk.cyan(header))),
        ...deployments
          .sort(sortRecent())
          .map(dep => {
            urls.push(`https://${dep.url}`);
            return [
              chalk.gray(ms(Date.now() - dep.createdAt)),
              `https://${dep.url}`,
              stateString(dep.state || ''),
              dep.target === 'production' ? 'Production' : 'Preview',
              chalk.gray(getDeploymentDuration(dep)),
              showUsername ? chalk.gray(dep.creator?.username) : '',
            ];
          })
          .filter(app =>
            // if an app wasn't supplied to filter by,
            // we only want to render one deployment per app
            app === null ? filterUniqueApps() : () => true
          ),
      ],
      {
        align: ['l', 'l', 'l', 'l', 'l'],
        hsep: ' '.repeat(5),
        stringLength: strlen,
      }
    ).replace(/^/gm, '  ')}\n\n`
  );

  if (!client.stdout.isTTY) {
    client.stdout.write(urls.join('\n'));
    client.stdout.write('\n');
  }

  if (pagination && pagination.count === 20) {
    const flags = getCommandFlags(argv, ['_', '--next']);
    log(
      `To display the next page, run ${getCommandName(
        `ls${app ? ' ' + app : ''}${flags} --next ${pagination.next}`
      )}`
    );
  }
}

export function getDeploymentDuration(dep: Deployment): string {
  if (!dep || !dep.ready || !dep.buildingAt) {
    return '?';
  }
  const duration = ms(dep.ready - dep.buildingAt);
  if (duration === '0ms') {
    return '--';
  }
  return duration;
}

// renders the state string
export function stateString(s: string) {
  const CIRCLE = '● ';
  // make `s` title case
  const sTitle = title(s);
  switch (s) {
    case 'INITIALIZING':
    case 'BUILDING':
    case 'DEPLOYING':
    case 'ANALYZING':
      return chalk.yellow(CIRCLE) + sTitle;
    case 'ERROR':
      return chalk.red(CIRCLE) + sTitle;
    case 'READY':
      return chalk.green(CIRCLE) + sTitle;
    case 'QUEUED':
      return chalk.white(CIRCLE) + sTitle;
    case 'CANCELED':
      return chalk.gray(sTitle);
    default:
      return chalk.gray('UNKNOWN');
  }
}

// sorts by most recent deployment
function sortRecent() {
  return function recencySort(a: Deployment, b: Deployment) {
    return b.createdAt - a.createdAt;
  };
}

// filters only one deployment per app, so that
// the user doesn't see so many deployments at once.
// this mode can be bypassed by supplying an app name
function filterUniqueApps() {
  const uniqueApps = new Set();
  return function uniqueAppFilter([appName]: [appName: string]) {
    if (uniqueApps.has(appName)) {
      return false;
    }
    uniqueApps.add(appName);
    return true;
  };
}
