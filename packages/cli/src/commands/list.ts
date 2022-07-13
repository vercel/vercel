import chalk from 'chalk';
import ms from 'ms';
import table from 'text-table';
import title from 'title';
import terminalLink from 'terminal-link';
import Now from '../util';
import getArgs from '../util/get-args';
import { handleError } from '../util/error';
import logo from '../util/output/logo';
import elapsed from '../util/output/elapsed';
import strlen from '../util/strlen';
import toHost from '../util/to-host';
import parseMeta from '../util/parse-meta';
import { isValidName } from '../util/is-valid-name';
import getCommandFlags from '../util/get-command-flags';
import { getPkgName, getCommandName } from '../util/pkg-name';
import Client from '../util/client';
import { Deployment } from '../types';
import validatePaths from '../util/validate-paths';
import { getLinkedProject } from '../util/projects/link';
import { ensureLink } from '../util/ensure-link';
import getScope from '../util/get-scope';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} list`)} [app]

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    --confirm                      Skip the confirmation prompt
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -S, --scope                    Set a custom scope
    -m, --meta                     Filter deployments by metadata (e.g.: ${chalk.dim(
      '`-m KEY=value`'
    )}). Can appear many times.
    -i, --inspect                  Display dashboard inspect URLs
    --prod                         Filter for production URLs
    -N, --next                     Show next page of results

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} List all deployments for the currently linked project

    ${chalk.cyan(`$ ${getPkgName()} ls`)}

  ${chalk.gray('–')} List all deployments for the project ${chalk.dim(
    '`my-app`'
  )} in the team of the currently linked project
  
    ${chalk.cyan(`$ ${getPkgName()} ls my-app`)}

  ${chalk.gray('–')} Filter deployments by metadata

    ${chalk.cyan(`$ ${getPkgName()} ls -m key1=value1 -m key2=value2`)}

  ${chalk.gray('–')} Paginate deployments for a project, where ${chalk.dim(
    '`1584722256178`'
  )} is the time in milliseconds since the UNIX epoch.

    ${chalk.cyan(`$ ${getPkgName()} ls my-app --next 1584722256178`)}
`);
};

export default async function main(client: Client) {
  let argv;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--meta': [String],
      '-m': '--meta',
      '--next': Number,
      '-N': '--next',
      '--inspect': Boolean,
      '-i': '--inspect',
      '--prod': Boolean,
      '--confirm': Boolean,
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  const { output, config } = client;

  const { print, log, error, note, debug, spinner } = output;

  if (argv._.length > 2) {
    error(`${getCommandName('ls [app]')} accepts at most one argument`);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  const yes = argv['--confirm'] || false;
  const inspect = argv['--inspect'] || false;
  const prod = argv['--prod'] || false;

  const meta = parseMeta(argv['--meta']);

  let paths = [process.cwd()];
  const pathValidation = await validatePaths(client, paths);
  if (!pathValidation.valid) {
    return pathValidation.exitCode;
  }

  const { path } = pathValidation;

  // retrieve `project` and `org` from .vercel
  let link = await getLinkedProject(client, path);

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
    const linkedProject = await ensureLink('list', client, path, yes);
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
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      error(err.message);
      return 1;
    }

    throw err;
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

  const nextTimestamp = argv['--next'];

  if (typeof nextTimestamp !== undefined && Number.isNaN(nextTimestamp)) {
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

  const response = await now.list(
    app,
    {
      version: 6,
      meta,
      nextTimestamp,
    },
    prod
  );

  let {
    deployments,
    pagination,
  }: {
    deployments: Deployment[];
    pagination: { count: number; next: number };
  } = response;

  if (app && !deployments.length) {
    debug(
      'No deployments: attempting to find deployment that matches supplied app name'
    );
    let match;

    try {
      await now.findDeployment(app);
    } catch (err) {
      if (err.status === 404) {
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
    `${prod ? `Production deployments` : `Deployments`} for ${chalk.bold(
      chalk.magenta(app)
    )} under ${chalk.bold(chalk.magenta(contextName))} ${elapsed(
      Date.now() - start
    )}`
  );

  // information to help the user find other deployments or instances
  log(
    `To list more deployments for a project, run ${getCommandName(
      'ls [project]'
    )}.`
  );

  print('\n');

  client.output.print(
    `${table(
      [
        [
          'age',
          inspect ? 'inspect url' : 'deployment url',
          'state',
          'duration',
          'username',
        ].map(header => chalk.bold(chalk.cyan(header))),
        ...deployments
          .sort(sortRecent())
          .map((dep, i) => [
            [
              chalk.gray(ms(Date.now() - dep.createdAt)),
              i === 0
                ? chalk.bold(`${getDeployUrl(dep, inspect)}`)
                : `${getDeployUrl(dep, inspect)}`,
              stateString(dep.state),
              chalk.gray(getDeploymentDuration(dep)),
              chalk.gray(dep.creator.username),
            ],
          ])
          // flatten since the previous step returns a nested
          // array of the deployment and (optionally) its instances
          .flat()
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

  if (pagination && pagination.count === 20) {
    const flags = getCommandFlags(argv, ['_', '--next']);
    log(
      `To display the next page run ${getCommandName(
        `ls${app ? ' ' + app : ''}${flags} --next ${pagination.next}`
      )}`
    );
  }
}

function getDeployUrl(deployment: Deployment, inspect?: boolean): string {
  return formatDeployUrl(deployment, inspect);
}

function formatDeployUrl(deployment: Deployment, inspect?: boolean) {
  const deploymentUrl = inspect
    ? deployment.inspectorUrl
    : 'https://' + deployment.url;
  let id;
  if (inspect) {
    id = deploymentUrl.split('/').slice(-1)[0];
  } else {
    id = deploymentUrl
      .replace(deployment.name + '-', '')
      .replace('https://', '')
      .split(/(\.|-)/g)[0];
  }
  if (terminalLink.isSupported) {
    return terminalLink(id, deploymentUrl);
  } else {
    return deploymentUrl;
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
