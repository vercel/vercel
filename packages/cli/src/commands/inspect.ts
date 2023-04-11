import chalk from 'chalk';
import getArgs from '../util/get-args';
import buildsList from '../util/output/builds';
import routesList from '../util/output/routes';
import indent from '../util/output/indent';
import logo from '../util/output/logo';
import elapsed from '../util/output/elapsed';
import { handleError } from '../util/error';
import getScope from '../util/get-scope';
import { getPkgName, getCommandName } from '../util/pkg-name';
import Client from '../util/client';
import getDeployment from '../util/get-deployment';
import { Build, Deployment } from '@vercel-internals/types';
import title from 'title';
import { isErrnoException } from '@vercel/error-utils';
import { URL } from 'url';

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
    --no-color                     No color mode [off]
    -S, --scope                    Set a custom scope

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Get information about a deployment by its unique URL

    ${chalk.cyan(`$ ${getPkgName()} inspect my-deployment-ji2fjij2.vercel.app`)}

  ${chalk.gray('-')} Get information about the deployment an alias points to

    ${chalk.cyan(`$ ${getPkgName()} inspect my-deployment.vercel.app`)}
  `);
};

export default async function main(client: Client) {
  let argv;

  try {
    argv = getArgs(client.argv.slice(2));
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  const { print, log, error } = client.output;

  // extract the first parameter
  let [, deploymentIdOrHost] = argv._;

  if (argv._.length !== 2) {
    error(`${getCommandName('inspect <url>')} expects exactly one argument`);
    help();
    return 1;
  }

  let contextName: string | null = null;

  try {
    ({ contextName } = await getScope(client));
  } catch (err: unknown) {
    if (
      isErrnoException(err) &&
      (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED')
    ) {
      error(err.message);
      return 1;
    }

    throw err;
  }

  const depFetchStart = Date.now();

  try {
    deploymentIdOrHost = new URL(deploymentIdOrHost).hostname;
  } catch {}
  client.output.spinner(
    `Fetching deployment "${deploymentIdOrHost}" in ${chalk.bold(contextName)}`
  );

  // resolve the deployment, since we might have been given an alias
  const deployment = await getDeployment(
    client,
    contextName,
    deploymentIdOrHost
  );

  const {
    id,
    name,
    url,
    createdAt,
    routes,
    readyState,
    alias: aliases,
  } = deployment;

  const { builds } =
    deployment.version === 2
      ? await client.fetch<{ builds: Build[] }>(`/v11/deployments/${id}/builds`)
      : { builds: [] };

  log(
    `Fetched deployment "${chalk.bold(url)}" in ${chalk.bold(
      contextName
    )} ${elapsed(Date.now() - depFetchStart)}`
  );

  print('\n');
  print(chalk.bold('  General\n\n'));
  print(`    ${chalk.cyan('id')}\t\t${id}\n`);
  print(`    ${chalk.cyan('name')}\t${name}\n`);
  print(`    ${chalk.cyan('status')}\t${stateString(readyState)}\n`);
  print(`    ${chalk.cyan('url')}\t\thttps://${url}\n`);
  if (createdAt) {
    print(
      `    ${chalk.cyan('created')}\t${new Date(createdAt)} ${elapsed(
        Date.now() - createdAt,
        true
      )}\n`
    );
  }
  print('\n\n');

  if (aliases !== undefined && aliases.length > 0) {
    print(chalk.bold('  Aliases\n\n'));
    let aliasList = '';
    for (const alias of aliases) {
      aliasList += `${chalk.gray('╶')} https://${alias}\n`;
    }
    print(indent(aliasList, 4));
    print('\n\n');
  }

  if (builds.length > 0) {
    const times: { [id: string]: string | null } = {};

    for (const build of builds) {
      const { id, createdAt, readyStateAt } = build;
      times[id] =
        createdAt && readyStateAt ? elapsed(readyStateAt - createdAt) : null;
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

function stateString(s: Deployment['readyState']) {
  const CIRCLE = '● ';
  const sTitle = s && title(s);
  switch (s) {
    case 'INITIALIZING':
    case 'BUILDING':
      return chalk.yellow(CIRCLE) + sTitle;
    case 'ERROR':
      return chalk.red(CIRCLE) + sTitle;
    case 'READY':
      return chalk.green(CIRCLE) + sTitle;
    case 'QUEUED':
      return chalk.gray(CIRCLE) + sTitle;
    case 'CANCELED':
      return chalk.gray(CIRCLE) + sTitle;
    default:
      return chalk.gray('UNKNOWN');
  }
}
