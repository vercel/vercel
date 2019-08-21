import chalk from 'chalk';
import ms from 'ms';
import plural from 'pluralize';
import table from 'text-table';
import Now from '../util';
import getAliases from '../util/alias/get-aliases';
import getArgs from '../util/get-args';
import getDeploymentInstances from '../util/deploy/get-deployment-instances';
import createOutput from '../util/output';
import { handleError } from '../util/error';
import cmd from '../util/output/cmd.ts';
import logo from '../util/output/logo';
import elapsed from '../util/output/elapsed.ts';
import wait from '../util/output/wait';
import strlen from '../util/strlen.ts';
import Client from '../util/client.ts';
import getScope from '../util/get-scope.ts';
import toHost from '../util/to-host';
import parseMeta from '../util/parse-meta';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now list`)} [app]

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.now`'} directory
    -d, --debug                    Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -S, --scope                    Set a custom scope
    -a, --all                      See all instances for each deployment (requires [app])
    -m, --meta                     Filter deployments by metadata (e.g.: ${chalk.dim(
      '`-m KEY=value`'
    )}). Can appear many times.

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} List all deployments

    ${chalk.cyan('$ now ls')}

  ${chalk.gray('–')} List all deployments for the app ${chalk.dim('`my-app`')}

    ${chalk.cyan('$ now ls my-app')}

  ${chalk.gray(
    '–'
  )} List all deployments and all instances for the app ${chalk.dim('`my-app`')}

    ${chalk.cyan('$ now ls my-app --all')}

  ${chalk.gray('–')} Filter deployments by metadata

    ${chalk.cyan('$ now ls -m key1=value1 -m key2=value2')}
`);
};

// Options
// $FlowFixMe
export default async function main(ctx) {
  let argv;

  try {
    argv = getArgs(ctx.argv.slice(2), {
      '--all': Boolean,
      '--meta': [String],
      '-a': '--all',
      '-m': '--meta'
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  const debugEnabled = argv['--debug'];

  const { print, log, error, note, debug } = createOutput({
    debug: debugEnabled
  });

  if (argv._.length > 2) {
    error(`${cmd('now ls [app]')} accepts at most one argument`);
    return 1;
  }

  let app = argv._[1];
  let host = null;

  const apiUrl = ctx.apiUrl;

  if (argv['--help']) {
    help();
    return 0;
  }

  const meta = parseMeta(argv['--meta']);
  const { authConfig: { token }, config } = ctx;
  const { currentTeam, includeScheme } = config;
  const client = new Client({
    apiUrl,
    token,
    currentTeam,
    debug: debugEnabled
  });
  let contextName = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      error(err.message);
      return 1;
    }

    throw err;
  }

  const stopSpinner = wait(
    `Fetching deployments in ${chalk.bold(contextName)}`
  );

  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam });
  const start = new Date();

  if (argv['--all'] && !app) {
    error('You must define an app when using `-a` / `--all`');
    return 1;
  }

  // Some people are using entire domains as app names, so
  // we need to account for this here
  if (app && toHost(app).endsWith('.now.sh')) {
    note(
      'We suggest using `now inspect <deployment>` for retrieving details about a single deployment'
    );

    const asHost = toHost(app);
    const hostParts = asHost.split('-');

    if (hostParts < 2) {
      stopSpinner();
      error('Only deployment hostnames are allowed, no aliases');
      return 1;
    }

    app = null;
    host = asHost;
  }

  let deployments;

  try {
    debug('Fetching deployments');
    deployments = await now.list(app, { version: 4, meta });
  } catch (err) {
    stopSpinner();
    throw err;
  }

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
        stopSpinner();
        throw err;
      }
    }

    if (match !== null && typeof match !== 'undefined') {
      debug('Found deployment that matches app name');
      deployments = Array.of(match);
    }
  }

  if (app && !deployments.length) {
    debug(
      'No deployments: attempting to find aliases that matches supplied app name'
    );
    const aliases = await getAliases(now);
    const item = aliases.find(e => e.uid === app || e.alias === app);

    if (item) {
      debug('Found alias that matches app name');
      const match = await now.findDeployment(item.deploymentId);
      const instances = await getDeploymentInstances(
        now,
        item.deploymentId,
        'now_cli_alias_instances'
      );
      match.instanceCount = Object.keys(instances).reduce(
        (count, dc) => count + instances[dc].instances.length,
        0
      );
      if (match !== null && typeof match !== 'undefined') {
        deployments = Array.of(match);
      }
    }
  }

  now.close();

  if (argv['--all']) {
    await Promise.all(
      deployments.map(async ({ uid, instanceCount }, i) => {
        deployments[i].instances =
          instanceCount > 0 ? await now.listInstances(uid) : [];
      })
    );
  }

  if (host) {
    deployments = deployments.filter(deployment => deployment.url === host);
  }

  stopSpinner();
  log(
    `Fetched ${plural(
      'deployment',
      deployments.length,
      true
    )} under ${chalk.bold(contextName)} ${elapsed(Date.now() - start)}`
  );

  // we don't output the table headers if we have no deployments
  if (!deployments.length) {
    return 0;
  }

  // information to help the user find other deployments or instances
  if (app == null) {
    log(`To list more deployments for a project run ${cmd('now ls [project]')}`);
  } else if (!argv['--all']) {
    log(`To list deployment instances run ${cmd('now ls --all [project]')}`);
  }

  print('\n');

  console.log(
    `${table(
      [
        ['project', 'latest deployment', 'inst #', 'type', 'state', 'age'].map(s => chalk.dim(s)),
        ...deployments
          .sort(sortRecent())
          .map(dep => [
            [
              getProjectName(dep),
              chalk.bold((includeScheme ? 'https://' : '') + dep.url),
              dep.instanceCount == null || dep.type === 'LAMBDAS'
                ? chalk.gray('-')
                : dep.instanceCount,
              dep.type === 'LAMBDAS' ? chalk.gray('-') : dep.type,
              stateString(dep.state),
              chalk.gray(ms(Date.now() - new Date(dep.created)))
            ],
            ...(argv['--all']
              ? dep.instances.map(i => [
                  '',
                  ` ${chalk.gray('-')} ${i.url} `,
                  '',
                  '',
                  ''
                ])
              : [])
          ])
          // flatten since the previous step returns a nested
          // array of the deployment and (optionally) its instances
          .reduce((ac, c) => ac.concat(c), [])
          .filter(
            app == null
              ? // if an app wasn't supplied to filter by,
                // we only want to render one deployment per app
                filterUniqueApps()
              : () => true
          )
      ],
      {
        align: ['l', 'l', 'r', 'l', 'b'],
        hsep: ' '.repeat(4),
        stringLength: strlen
      }
    ).replace(/^/gm, '  ')}\n\n`
  );
}

function getProjectName(d) {
  // We group both file and files into a single project
  if (d.name === 'file') {
    return 'files';
  }

  return d.name
}

// renders the state string
function stateString(s) {
  switch (s) {
    case 'INITIALIZING':
      return chalk.yellow(s);

    case 'ERROR':
      return chalk.red(s);

    case 'READY':
      return s;

    default:
      return chalk.gray('UNKNOWN');
  }
}

// sorts by most recent deployment
function sortRecent() {
  return function recencySort(a, b) {
    return b.created - a.created;
  };
}

// filters only one deployment per app, so that
// the user doesn't see so many deployments at once.
// this mode can be bypassed by supplying an app name
function filterUniqueApps() {
  const uniqueApps = new Set();
  return function uniqueAppFilter([appName]) {
    if (uniqueApps.has(appName)) {
      return false;
    }
    uniqueApps.add(appName);
    return true;
  };
}
