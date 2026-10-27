import type { Build, Deployment } from '@vercel-internals/types';
import { isErrnoException } from '@vercel/error-utils';
import chalk from 'chalk';
import ms from 'ms';
import title from 'title';
import type Client from '../../util/client';
import {
  describeBuildCache,
  getBuildCacheJson,
} from '../../util/deploy/build-cache-summary';
import { getBuildMachineResourceConfig } from '../../util/deploy/get-build-machine-resource-config';
import { isDeploying } from '../../util/deploy/is-deploying';
import {
  type BuildLog,
  collectBuildLogs,
  displayBuildLogs,
} from '../../util/logs';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import getDeployment, {
  type DeploymentWithBuildUsage,
} from '../../util/get-deployment';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { detectExplicitScope, getContextName } from '../../util/get-scope';
import readStandardInput from '../../util/input/read-standard-input';
import buildsList from '../../util/output/builds';
import elapsed from '../../util/output/elapsed';
import indent from '../../util/output/indent';
import { validateJsonOutput } from '../../util/output-format';
import routesList from '../../util/output/routes';
import { parseDeploymentUrl } from '../../util/parse-deployment-url';
import { getCommandName } from '../../util/pkg-name';
import sleep from '../../util/sleep';
import getTeams from '../../util/teams/get-teams';
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
    return 2;
  }

  if (parsedArguments.flags['--help']) {
    telemetry.trackCliFlagHelp('inspect');
    print(
      help(inspectCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  if (parsedArguments.args[0] === inspectCommand.name) {
    parsedArguments.args.shift();
  }

  // extract the first parameter
  let [deploymentIdOrHost] = parsedArguments.args;

  if (!deploymentIdOrHost) {
    // if the URL is not passed in, check stdin
    // allows cool stuff like `echo my-deployment.vercel.app | vc inspect --wait`
    const stdInput = (await readStandardInput(client.stdin)).trim();
    if (stdInput) {
      deploymentIdOrHost = stdInput;
    }
  }

  if (!deploymentIdOrHost) {
    error(
      `${getCommandName('inspect <deployment>')} expects exactly one argument`
    );
    print(
      help(inspectCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 2;
  }

  telemetry.trackCliArgumentDeployment(deploymentIdOrHost);
  telemetry.trackCliOptionTimeout(parsedArguments.flags['--timeout']);
  telemetry.trackCliFlagLogs(parsedArguments.flags['--logs']);
  telemetry.trackCliFlagWait(parsedArguments.flags['--wait']);
  telemetry.trackCliOptionFormat(parsedArguments.flags['--format']);
  telemetry.trackCliFlagJson(parsedArguments.flags['--json']);

  // validate the timeout
  const timeout = ms(parsedArguments.flags['--timeout'] ?? '3m');
  if (timeout === undefined) {
    error(`Invalid timeout "${parsedArguments.flags['--timeout']}"`);
    return 1;
  }

  let contextName: string | null = null;

  // Parse the deployment URL to extract scope and normalize deployment ID
  const parsed = parseDeploymentUrl(deploymentIdOrHost);
  deploymentIdOrHost = parsed.deploymentIdOrHost;
  // If a scope was extracted from a dashboard URL and no explicit scope was provided,
  // use the scope from the URL
  if (parsed.scope && !detectExplicitScope(client)) {
    const teams = await getTeams(client);
    const team = teams.find(t => t.slug === parsed.scope);
    if (team) {
      client.config.currentTeam = team.id;
    }
  }

  try {
    contextName = await getContextName(client);
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
  const formatResult = validateJsonOutput(parsedArguments.flags);
  if (!formatResult.valid) {
    error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;
  const startTimestamp = Date.now();
  if (!(asJson && withLogs)) {
    output.spinner(
      `Fetching deployment "${deploymentIdOrHost}" in ${chalk.bold(
        contextName
      )}`
    );
  }

  // The builds request needs the deployment ID. When we were given one,
  // send it alongside the deployment request instead of after it. With
  // `--wait` the builds must reflect the final state, and `--logs` never
  // prints them, so those keep the sequential request.
  let prefetchedBuilds: Promise<Build[]> | undefined;
  if (!wait && !withLogs && deploymentIdOrHost.startsWith('dpl_')) {
    prefetchedBuilds = fetchBuilds(client, deploymentIdOrHost);
    // Its error, if any, is thrown where the builds are read.
    prefetchedBuilds.catch(() => {});
  }

  // resolve the deployment, since we might have been given an alias
  let deployment = await getDeployment(client, contextName, deploymentIdOrHost);
  if (deployment.id !== deploymentIdOrHost) {
    prefetchedBuilds = undefined;
  }

  let abortController: AbortController | undefined;
  let buildLogsPromise: Promise<BuildLog[]> | undefined;
  if (withLogs) {
    if (asJson) {
      let promise: Promise<BuildLog[]>;
      ({ abortController, promise } = collectBuildLogs(
        client,
        deployment,
        wait
      ));
      buildLogsPromise = promise.catch(error => {
        warn(`Failed to read build logs: ${error}`);
        return [];
      });
    } else {
      let promise: Promise<void>;
      ({ abortController, promise } = displayBuildLogs(
        client,
        deployment,
        wait
      ));
      if (wait) {
        // when waiting for the deployment's end, we don't wait for the logs to finish
        promise.catch(error => warn(`Failed to read build logs: ${error}`));
      } else {
        await promise;
      }
    }
  }
  let timedOut = false;
  while (wait) {
    await sleep(250);
    // check the deployment state again
    deployment = await getDeployment(client, contextName, deploymentIdOrHost);
    if (!isDeploying(deployment.readyState)) {
      abortController?.abort();
      break;
    }
    if (Date.now() > until) {
      warn(
        `stopped waiting after ${ms(timeout, { long: true })}, the deployment is still in progress`
      );
      timedOut = true;
      abortController?.abort();
      break;
    }
  }

  if (asJson) {
    output.stopSpinner();
    if (withLogs) {
      printLogsJson(client, (await buildLogsPromise) ?? []);
    } else {
      await printJson({ deployment, contextName, client, prefetchedBuilds });
    }
  } else if (withLogs) {
    print(`${chalk.cyan('status')}\t${stateString(deployment.readyState)}\n`);
  } else {
    await printDetails({
      deployment,
      contextName,
      client,
      startTimestamp,
      prefetchedBuilds,
    });
  }

  // A deployment that is still building when --wait gives up must not look
  // like a success. Any wait that reaches --timeout exits 1, like a failure.
  return timedOut ? 1 : exitCode(deployment.readyState);
}

function stateString(s: Deployment['readyState']) {
  const CIRCLE = '● ';
  const sTitle = s && title(s);
  switch (s) {
    case 'INITIALIZING':
    case 'BUILDING':
      return chalk.yellow(CIRCLE) + sTitle;
    case 'ERROR':
    case 'BLOCKED':
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
  prefetchedBuilds,
}: {
  deployment: DeploymentWithBuildUsage;
  contextName: string | null;
  client: Client;
  startTimestamp: number;
  prefetchedBuilds?: Promise<Build[]>;
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
    readyStateReason,
    alias: aliases,
  } = deployment;

  const { print, link } = output;

  const builds =
    deployment.version === 2
      ? await (prefetchedBuilds ?? fetchBuilds(client, id))
      : [];

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
  if (readyStateReason) {
    print(`    ${chalk.cyan('reason')}\t${readyStateReason}\n`);
  }
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

  const buildMachine = getBuildMachineResourceConfig(deployment);
  if (buildMachine) {
    const fields = [
      ['requested build machine', buildMachine.machine ?? 'unavailable'],
      [
        'actual assigned cores',
        buildMachine.cores === undefined
          ? 'unavailable'
          : `${buildMachine.cores} vCPU (actual assignment)`,
      ],
      [
        'memory',
        buildMachine.memory === undefined
          ? undefined
          : `${buildMachine.memory} MiB`,
      ],
      ['selection type', buildMachine.selectionType],
      ['selection source', buildMachine.selectionSource],
    ] as const;

    print(chalk.bold('  Build Machine\n\n'));
    const labelWidth = Math.max(...fields.map(([label]) => label.length)) + 1;
    for (const [label, value] of fields) {
      if (value !== undefined) {
        print(`    ${chalk.cyan(label.padEnd(labelWidth))}${value}\n`);
      }
    }
    print('\n\n');
  }

  print(chalk.bold('  Build Cache\n\n'));
  const buildCache = describeBuildCache(deployment.buildCacheSummary);
  if (typeof buildCache === 'string') {
    print(`    ${buildCache}\n`);
  } else {
    const labelWidth =
      Math.max(...buildCache.map(([label]) => label.length)) + 1;
    for (const [label, value] of buildCache) {
      print(`    ${chalk.cyan(label.padEnd(labelWidth))}${value}\n`);
    }
  }
  print('\n\n');

  print(chalk.bold('  Duration\n\n'));
  const { duration } = deployment;
  print(
    `    ${chalk.cyan('build duration')}\t${formatDuration(duration?.timeToReady)}\n`
  );
  print(
    `    ${chalk.cyan('post-build duration')}\t${formatDuration(
      getPostBuildDuration(duration)
    )}\n`
  );
  print(
    `    ${chalk.cyan('billable duration')}\t${formatDuration(duration?.timeForBilling)}\n`
  );
  print(
    `    ${chalk.cyan('CPU Minutes Usage')}\t${formatCpuMinutes(
      duration?.cpuTimeForBilling,
      duration?.timeForBilling,
      deployment.resourceConfig?.buildMachine?.cores
    )}\n`
  );
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

async function printJson({
  deployment,
  contextName,
  client,
  prefetchedBuilds,
}: {
  deployment: DeploymentWithBuildUsage;
  contextName: string | null;
  client: Client;
  prefetchedBuilds?: Promise<Build[]>;
}): Promise<void> {
  const {
    id,
    name,
    url,
    createdAt,
    routes,
    readyState,
    readyStateReason,
    alias: aliases,
    target,
    customEnvironment,
    buildCacheSummary,
  } = deployment;

  const builds =
    deployment.version === 2
      ? await (prefetchedBuilds ?? fetchBuilds(client, id))
      : [];

  const buildMachine = getBuildMachineResourceConfig(deployment);
  const buildCacheJson = getBuildCacheJson(buildCacheSummary);
  const jsonOutput = {
    id,
    name,
    url,
    target: customEnvironment?.slug ?? target ?? 'preview',
    readyState,
    ...(readyStateReason && { readyStateReason }),
    createdAt,
    ...(deployment.duration && { duration: deployment.duration }),
    ...(buildMachine && { buildMachine }),
    ...(buildCacheJson && { buildCacheSummary: buildCacheJson }),
    ...(aliases && aliases.length > 0 && { aliases }),
    ...(builds.length > 0 && { builds }),
    ...(Array.isArray(routes) && routes.length > 0 && { routes }),
    ...(contextName && { contextName }),
  };

  client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
}

async function fetchBuilds(
  client: Client,
  deploymentId: string
): Promise<Build[]> {
  const { builds } = await client.fetch<{ builds: Build[] }>(
    `/v11/deployments/${deploymentId}/builds`
  );
  return builds;
}

function getPostBuildDuration(
  duration: { timeToReady?: number; timeToContainerExit?: number } | undefined
): number | undefined {
  if (
    duration?.timeToReady === undefined ||
    duration.timeToContainerExit === undefined
  ) {
    return undefined;
  }
  const postBuildDuration = duration.timeToContainerExit - duration.timeToReady;
  return postBuildDuration >= 0 ? postBuildDuration : undefined;
}

function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined) return 'unavailable';
  if (durationMs < 1000) return `${durationMs}ms`;

  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function formatCpuMinutes(
  billedBuildCpuMs: number | undefined,
  billableDurationMs: number | undefined,
  assignedCpuCores: number | undefined
): string {
  if (billedBuildCpuMs === undefined) return 'unavailable';
  const minutes = billedBuildCpuMs / 60_000;
  const calculation =
    billableDurationMs !== undefined && assignedCpuCores !== undefined
      ? ` (${formatDuration(billableDurationMs)} x ${assignedCpuCores}vCPU)`
      : '';
  return `${minutes} minutes${calculation}`;
}

function printLogsJson(client: Client, logs: BuildLog[]): void {
  client.stdout.write(`${JSON.stringify(logs, null, 2)}\n`);
}

function exitCode(state: Deployment['readyState']) {
  if (state === 'ERROR' || state === 'CANCELED') {
    return 1;
  }
  return 0;
}
