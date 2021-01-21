import chalk from 'chalk';
import getArgs from '../util/get-args';
import buildsList from '../util/output/builds';
import routesList from '../util/output/routes';
import indent from '../util/output/indent';
import Now from '../util';
import logo from '../util/output/logo';
import elapsed from '../util/output/elapsed.ts';
import { handleError } from '../util/error';
import Client from '../util/client.ts';
import getScope from '../util/get-scope.ts';
import { getPkgName, getCommandName } from '../util/pkg-name.ts';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} inspect`)} <url>

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -d, --debug                    Debug mode [off]
    -S, --scope                    Set a custom scope

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Get information about a deployment by its unique URL

    ${chalk.cyan(`$ ${getPkgName()} inspect my-deployment-ji2fjij2.now.sh`)}

  ${chalk.gray('-')} Get information about the deployment an alias points to

    ${chalk.cyan(`$ ${getPkgName()} inspect my-deployment.now.sh`)}
  `);
};

export default async function main(ctx) {
  let deployment;
  let argv;

  try {
    argv = getArgs(ctx.argv.slice(2));
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  const {
    apiUrl,
    output,
    authConfig: { token },
    config,
  } = ctx;
  const debugEnabled = argv['--debug'];
  const { print, log, error } = output;

  // extract the first parameter
  const [, deploymentIdOrHost] = argv._;

  if (argv._.length !== 2) {
    error(`${getCommandName('inspect <url>')} expects exactly one argument`);
    help();
    return 1;
  }

  const { currentTeam } = config;
  const client = new Client({
    apiUrl,
    token,
    currentTeam,
    debug: debugEnabled,
    output,
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

  const now = new Now({
    apiUrl,
    token,
    debug: debugEnabled,
    currentTeam,
    output,
  });

  // resolve the deployment, since we might have been given an alias
  const depFetchStart = Date.now();
  output.spinner(
    `Fetching deployment "${deploymentIdOrHost}" in ${chalk.bold(contextName)}`
  );

  try {
    deployment = await now.findDeployment(deploymentIdOrHost);
  } catch (err) {
    if (err.status === 404) {
      error(
        `Failed to find deployment "${deploymentIdOrHost}" in ${chalk.bold(
          contextName
        )}`
      );
      return 1;
    }
    if (err.status === 403) {
      error(
        `No permission to access deployment "${deploymentIdOrHost}" in ${chalk.bold(
          contextName
        )}`
      );
      return 1;
    }
    // unexpected
    throw err;
  }

  const { id, name, url, created, routes, readyState } = deployment;

  const { builds } =
    deployment.version === 2
      ? await now.fetch(`/v1/now/deployments/${id}/builds`)
      : { builds: [] };

  log(
    `Fetched deployment "${url}" in ${chalk.bold(contextName)} ${elapsed(
      Date.now() - depFetchStart
    )}`
  );

  print('\n');
  print(chalk.bold('  General\n\n'));
  print(`    ${chalk.cyan('id')}\t\t${id}\n`);
  print(`    ${chalk.cyan('name')}\t${name}\n`);
  print(`    ${chalk.cyan('readyState')}\t${stateString(readyState)}\n`);
  print(`    ${chalk.cyan('url')}\t\t${url}\n`);
  if (created) {
    print(
      `    ${chalk.cyan('createdAt')}\t${new Date(created)} ${elapsed(
        Date.now() - created,
        true
      )}\n`
    );
  }
  print('\n\n');

  if (builds.length > 0) {
    const times = {};

    for (const build of builds) {
      const { id, createdAt, readyStateAt } = build;
      times[id] = createdAt ? elapsed(readyStateAt - createdAt) : null;
    }

    print(chalk.bold('  Builds\n\n'));
    print(indent(buildsList(builds, times).toPrint, 4));
    print('\n\n');
  }

  if (Array.isArray(routes) && routes.length > 0) {
    print(chalk.bold('  Routes\n\n'));
    print(indent(routesList(routes), 4));
    print(`\n\n`);
  }

  return 0;
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
      return chalk.gray(s || 'UNKNOWN');
  }
}
