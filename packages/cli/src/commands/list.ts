import chalk from 'chalk';
import ms from 'ms';
import table from 'text-table';
import fs from 'fs-extra';
import { basename } from 'path';
import Now from '../util';
import getArgs from '../util/get-args';
import { handleError } from '../util/error';
import logo from '../util/output/logo';
import elapsed from '../util/output/elapsed';
import strlen from '../util/strlen';
// import getScope from '../util/get-scope';
import toHost from '../util/to-host';
import parseMeta from '../util/parse-meta';
import { isValidName } from '../util/is-valid-name';
import getCommandFlags from '../util/get-command-flags';
import { getPkgName, getCommandName } from '../util/pkg-name';
import Client from '../util/client';
import { Deployment } from '../types';
import getUser from '../util/get-user';
import validatePaths from '../util/validate-paths';
import { getLinkedProject } from '../util/projects/link';
import getTeams from '../util/teams/get-teams';

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
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -S, --scope                    Set a custom scope
    -m, --meta                     Filter deployments by metadata (e.g.: ${chalk.dim(
      '`-m KEY=value`'
    )}). Can appear many times.
    -N, --next                     Show next page of results

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} List all deployments

    ${chalk.cyan(`$ ${getPkgName()} ls`)}

  ${chalk.gray('–')} List all deployments for the app ${chalk.dim('`my-app`')}

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
      '--all': Boolean,
      '-a': '--all',
      '--inspect': Boolean,
      '-i': '--inspect',
      '--meta': [String],
      '-m': '--meta',
      '--next': Number,
      '-N': '--next',
      '--prod': Boolean,
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  const user = await getUser(client);

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

  const all = argv['--all'];
  const filterProd = argv['--prod'];
  const inspect = argv['--inspect'];

  if (argv._[0] === 'list' || argv._[0] === 'ls') {
    argv._.shift();
  }

  let paths = [process.cwd()];

  for (const path of paths) {
    try {
      await fs.stat(path);
    } catch (err) {
      output.error(
        `The specified file or directory "${basename(path)}" does not exist.`
      );
      return 1;
    }
  }

  // check paths
  const pathValidation = await validatePaths(output, paths);

  if (!pathValidation.valid) {
    return pathValidation.exitCode;
  }

  const { path } = pathValidation;

  // retrieve `project` and `org` from .vercel
  const link = await getLinkedProject(client, path);

  if (link.status === 'error') {
    return link.exitCode;
  }

  let { org, project, status } = link;
  const appArg: string | undefined = argv._[0];
  let app: string | undefined = appArg || project?.name;
  let host: string | undefined = undefined;

  if (status === 'not_linked' && !app) {
    output.print(
      `Looks like this directory isn't linked to a Vercel deployment. Please run ${getCommandName(
        'link'
      )} to link it.`
    );
    return 0;
  }

  // At this point `org` should be populated
  if (!org) {
    throw new Error(`"org" is not defined`);
  }

  const meta = parseMeta(argv['--meta']);

  let contextName = null;

  let teams;
  try {
    teams = await getTeams(client);
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      error(err.message);
      return 1;
    }
  }
  if (teams && argv['--scope']) {
    const teamSlug: string = argv['--scope'];
    const team = teams.filter(team => team.slug === teamSlug)[0];
    if (team) {
      client.config.currentTeam = team.id;
    } else {
      if (!all && !appArg) {
        print(
          `You can only set a custom scope when you add the ${chalk.cyan(
            '`--all`'
          )} flag or specify a project.`
        );
        return 0;
      }
      client.config.currentTeam = undefined;
    }
  } else {
    client.config.currentTeam = org.type === 'team' ? org.id : undefined;
  }

  contextName = argv['--scope'] ? argv['--scope'] : org.slug;

  const isUserScope = user.username === contextName;

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
  const response = await now.list(all ? undefined : app, {
    version: 6,
    meta,
    nextTimestamp,
  });

  let {
    deployments,
    pagination,
  }: {
    deployments: Deployment[];
    pagination: { count: number; next: number };
  } = response;

  if (app && !all && !deployments.length) {
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

  if (filterProd) {
    deployments = deployments.filter(
      deployment => deployment.target === 'production'
    );
  }

  log(
    `${filterProd ? `Production deployments` : `Deployments`}${
      app && !all ? ` for ${chalk.bold(chalk.magenta(app))}` : ''
    } under ${chalk.bold(chalk.magenta(contextName))} ${elapsed(
      Date.now() - start
    )}`
  );
  if (app && !all) {
    log(
      `To see a list of all of the projects under ${chalk.bold(
        contextName
      )}, type ${getCommandName('ls --all')}.`
    );
  }

  // we don't output the table headers if we have no deployments
  if (!deployments.length) {
    log(`No deployments found.`);
    return 0;
  }

  // information to help the user find other deployments or instances
  if (app == null) {
    log(
      `To list more deployments for a project run ${getCommandName(
        'ls [project]'
      )}`
    );
  }

  print('\n');

  let tablePrint;
  if (app && !all) {
    tablePrint = `${table(
      [
        (isUserScope
          ? [
              'age',
              inspect ? 'inspect url' : 'deployment url',
              'state',
              'duration',
            ]
          : [
              'age',
              inspect ? 'inspect url' : 'deployment url',
              'state',
              'duration',
              'username',
            ]
        ).map(header => chalk.bold(chalk.cyan(header))),
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
              isUserScope ? '' : chalk.gray(dep.creator.username),
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
        align: isUserScope ? ['l', 'l', 'l', 'l'] : ['l', 'l', 'l', 'l', 'l'],
        hsep: ' '.repeat(isUserScope ? 4 : 5),
        stringLength: strlen,
      }
    ).replace(/^/gm, '  ')}\n`;
  } else {
    tablePrint = `${table(
      [
        ['project', 'latest deployment', 'state', 'age'].map(header =>
          chalk.bold(chalk.cyan(header))
        ),
        ...deployments
          .sort(sortRecent())
          .map(dep => [
            [
              getProjectName(dep),
              chalk.bold(getDeployUrl(dep, inspect)),
              stateString(dep.state),
              chalk.gray(ms(Date.now() - dep.createdAt)),
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
        align: ['l', 'l', 'l', 'l'],
        hsep: ' '.repeat(4),
        stringLength: strlen,
      }
    ).replace(/^/gm, '  ')}\n`;
  }

  // print table with deployment information
  console.log(tablePrint);

  if (pagination && pagination.count === 20) {
    const flags = getCommandFlags(argv, ['_', '--next']);
    log(
      `To display the next page run ${getCommandName(
        `ls${app ? ' ' + app : ''}${flags} --next ${pagination.next}`
      )}`
    );
  }
}

function getProjectName(d: Deployment) {
  // We group both file and files into a single project
  if (d.name === 'file') {
    return 'files';
  }

  return d.name;
}

function getDeployUrl(
  deployment: Deployment,
  inspect: boolean | undefined
): string {
  return inspect ? deployment.inspectorUrl : 'https://' + deployment.url;
}

// renders the state string
function stateString(s: string) {
  const CIRCLE = '● ';
  // make `s` title case
  s = `${s.substring(0, 1)}${s.toLowerCase().substring(1)}`;
  switch (s.toUpperCase()) {
    case 'INITIALIZING':
    case 'BUILDING':
      return chalk.yellow(CIRCLE) + s;

    case 'ERROR':
      return chalk.red(CIRCLE) + s;

    case 'READY':
      return chalk.green(CIRCLE) + s;

    case 'QUEUED':
      return chalk.white(CIRCLE) + s;

    case 'CANCELED':
      return chalk.gray(s);

    default:
      return chalk.gray('UNKNOWN');
  }
}

function getDeploymentDuration(dep: Deployment): string {
  if (!dep || !dep.ready || !dep.buildingAt) {
    return '?';
  }
  const duration = ms(dep.ready - dep.buildingAt);
  if (duration === '0ms') {
    return '--';
  }
  return duration;
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
