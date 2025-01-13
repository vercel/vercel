import type { Build, Deployment } from '@vercel-internals/types';
import { isErrnoException } from '@vercel/error-utils';
import chalk from 'chalk';
import ms from 'ms';
import title from 'title';
import { URL } from 'url';
import type Client from '../../util/client';
import { isDeploying } from '../../util/deploy/is-deploying';
import { displayBuildLogs } from '../../util/logs';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import getDeployment from '../../util/get-deployment';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import readStandardInput from '../../util/input/read-standard-input';
import buildsList from '../../util/output/builds';
import elapsed from '../../util/output/elapsed';
import indent from '../../util/output/indent';
import routesList from '../../util/output/routes';
import { getCommandName } from '../../util/pkg-name';
import sleep from '../../util/sleep';
import { help } from '../help';
import { inspectCommand } from './command';
import output from '../../output-manager';

import { InspectTelemetryClient } from '../../util/telemetry/commands/inspect';

export default async function inspect(client: Client) {
  const { print, error, warn } = output;
  const telemetry = new InspectTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArguments;

  const flagsSpecification = getFlagsSpecification(inspectCommand.options);

  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  if (parsedArguments.flags['--help']) {
    telemetry.trackCliFlagHelp('inspect');
    print(help(inspectCommand, { columns: client.stderr.columns }));
    return 2;
  }

  if (parsedArguments.args[0] === inspectCommand.name) {
    parsedArguments.args.shift();
  }

  // extract the first parameter
  let [deploymentIdOrHost] = parsedArguments.args;

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
    print(help(inspectCommand, { columns: client.stderr.columns }));
    return 1;
  }

  telemetry.trackCliArgumentUrlOrDeploymentId(deploymentIdOrHost);
  telemetry.trackCliOptionTimeout(parsedArguments.flags['--timeout']);
  telemetry.trackCliFlagLogs(parsedArguments.flags['--logs']);
  telemetry.trackCliFlagWait(parsedArguments.flags['--wait']);

  // validate the timeout
  const timeout = ms(parsedArguments.flags['--timeout'] ?? '3m');
  if (timeout === undefined) {
    error(`Invalid timeout "${parsedArguments.flags['--timeout']}"`);
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

  const until = Date.now() + timeout;
  const wait = parsedArguments.flags['--wait'] ?? false;
  const withLogs = parsedArguments.flags['--logs'];
  const startTimestamp = Date.now();

  try {
    deploymentIdOrHost = new URL(deploymentIdOrHost).hostname;
  } catch {}
  output.spinner(
    `Fetching deployment "${deploymentIdOrHost}" in ${chalk.bold(contextName)}`
  );

  // resolve the deployment, since we might have been given an alias
  let deployment = await getDeployment(client, contextName, deploymentIdOrHost);

  let abortController: AbortController | undefined;
  if (withLogs) {
    let promise: Promise<void>;
    ({ abortController, promise } = displayBuildLogs(client, deployment, wait));
    if (wait) {
      // when waiting for the deployment's end, we don't wait for the logs to finish
      promise.catch(error => warn(`Failed to read build logs: ${error}`));
    } else {
      await promise;
    }
  }
  while (wait) {
    await sleep(250);
    // check the deployment state again
    deployment = await getDeployment(client, contextName, deploymentIdOrHost);
    if (!isDeploying(deployment.readyState)) {
      abortController?.abort();
      break;
    }
    if (Date.now() > until) {
      warn(`stopped waiting after ${ms(timeout, { long: true })}`);
      abortController?.abort();
      break;
    }
  }
  if (withLogs) {
    print(`${chalk.cyan('status')}\t${stateString(deployment.readyState)}\n`);
  } else {
    await printDetails({ deployment, contextName, client, startTimestamp });
  }

  return exitCode(deployment.readyState);
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

async function printDetails({
  deployment,
  contextName,
  client,
  startTimestamp,
}: {
  deployment: Deployment;
  contextName: string | null;
  client: Client;
  startTimestamp: number;
}): Promise<void> {
  output.log(
    `Fetched deployment "${chalk.bold(deployment.url)}" in ${chalk.bold(
      contextName
    )} ${elapsed(Date.now() - startTimestamp)}`
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

  const { print, link } = output;

  const { builds } =
    deployment.version === 2
      ? await client.fetch<{ builds: Build[] }>(`/v11/deployments/${id}/builds`)
      : { builds: [] };

  print('\n');
  print(chalk.bold('  General\n\n'));
  print(`    ${chalk.cyan('id')}\t\t${id}\n`);
  print(`    ${chalk.cyan('name')}\t${name}\n`);
  const customEnvironmentSlug = deployment.customEnvironment?.slug;
  const target = customEnvironmentSlug ?? deployment.target ?? 'preview';
  print(`    ${chalk.cyan('target')}\t`);
  // TODO: once custom environments is shipped for all users,
  // make all deployments link to the environment settings page
  print(
    deployment.customEnvironment && deployment.team?.slug
      ? `${link(
          `${target}`,
          `https://vercel.com/${deployment.team.slug}/${name}/settings/environments/${deployment.customEnvironment.id}`,
          { fallback: () => target, color: false }
        )}\n`
      : `${target}\n`
  );
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
}

function exitCode(state: Deployment['readyState']) {
  if (state === 'ERROR' || state === 'CANCELED') {
    return 1;
  }
  return 0;
}
