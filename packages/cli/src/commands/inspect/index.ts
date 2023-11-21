import chalk from 'chalk';
import getArgs from '../../util/get-args.js';
import buildsList from '../../util/output/builds.js';
import routesList from '../../util/output/routes.js';
import indent from '../../util/output/indent.js';
import elapsed from '../../util/output/elapsed.js';
import { handleError } from '../../util/error.js';
import getScope from '../../util/get-scope.js';
import { getCommandName } from '../../util/pkg-name.js';
import Client from '../../util/client.js';
import getDeployment from '../../util/get-deployment.js';
import type { Build, Deployment } from '@vercel-internals/types';
import title from 'title';
import { isErrnoException } from '@vercel/error-utils';
import { URL } from 'node:url';
import readStandardInput from '../../util/input/read-standard-input.js';
import sleep from '../../util/sleep.js';
import ms from 'ms';
import { isDeploying } from '../../util/deploy/is-deploying.js';
import { help } from '../help.js';
import { inspectCommand } from './command.js';

export default async function inspect(client: Client) {
  const { output } = client;
  let argv;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--timeout': String,
      '--wait': Boolean,
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    output.print(help(inspectCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const { print, log, error } = client.output;

  // extract the first parameter
  let [, deploymentIdOrHost] = argv._;

  if (!deploymentIdOrHost) {
    // if the URL is not passed in, check stdin
    // allows cool stuff like `echo my-deployment.vercel.app | vc inspect --wait`
    const stdInput = await readStandardInput(client.stdin);
    if (stdInput) {
      deploymentIdOrHost = stdInput;
    }
  }

  if (!deploymentIdOrHost) {
    error(`${getCommandName('inspect <url>')} expects exactly one argument`);
    output.print(help(inspectCommand, { columns: client.stderr.columns }));
    return 1;
  }

  // validate the timeout
  const timeout = ms(argv['--timeout'] ?? '3m');
  if (timeout === undefined) {
    error(`Invalid timeout "${argv['--timeout']}"`);
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

  const until = Date.now() + timeout;
  const wait = argv['--wait'];

  // resolve the deployment, since we might have been given an alias
  let deployment = await getDeployment(client, contextName, deploymentIdOrHost);

  while (Date.now() < until) {
    if (!wait || !isDeploying(deployment.readyState)) {
      break;
    }

    await sleep(250);

    // check the deployment state again
    deployment = await getDeployment(client, contextName, deploymentIdOrHost);
  }

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
