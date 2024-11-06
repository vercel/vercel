import { Deployment } from '@vercel-internals/types';
import { isErrnoException } from '@vercel/error-utils';
import chalk from 'chalk';
import format from 'date-fns/format';
import { isReady } from '../../util/build-state';
import Client from '../../util/client';
import { isDeploying } from '../../util/deploy/is-deploying';
import { emoji, prependEmoji } from '../../util/emoji';
import { handleError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import getDeployment from '../../util/get-deployment';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import { displayRuntimeLogs } from '../../util/logs';
import param from '../../util/output/param';
import { getCommandName } from '../../util/pkg-name';
import { LogsTelemetryClient } from '../../util/telemetry/commands/logs';
import { help } from '../help';
import { stateString } from '../list';
import { logsCommand } from './command';
import output from '../../output-manager';

const deprecatedFlags = [
  '--follow',
  '--limit',
  '--since',
  '--until',
  '--output',
];

export default async function logs(client: Client) {
  let parsedArguments;
  const flagsSpecification = getFlagsSpecification(logsCommand.options);
  const { print, error, spinner, stopSpinner } = output;

  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    handleError(err);
    return 1;
  }

  // TODO: This behavior should be centralized in `parseArguments`
  for (const flag of Object.keys(parsedArguments.flags)) {
    if (deprecatedFlags.includes(flag)) {
      print(
        `${prependEmoji(
          `The ${param(
            flag
          )} option was ignored because it is now deprecated. Please remove it.`,
          emoji('warning')
        )}\n`
      );
    }
  }

  const telemetry = new LogsTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (parsedArguments.flags['--help']) {
    telemetry.trackCliFlagHelp('logs');
    print(help(logsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  if (parsedArguments.args[0] === logsCommand.name) {
    parsedArguments.args.shift();
  }

  const asJson = parsedArguments.flags['--json'];

  // extract the first parameter
  let [deploymentIdOrHost] = parsedArguments.args;
  if (!deploymentIdOrHost) {
    error(
      `${getCommandName('logs <deployment>')} expects exactly one argument`
    );
    print(help(logsCommand, { columns: client.stderr.columns }));
    return 1;
  }

  telemetry.trackCliArgumentUrlOrDeploymentId(deploymentIdOrHost);
  telemetry.trackCliFlagJson(asJson);
  telemetry.trackCliFlagFollow(parsedArguments.flags['--follow']);
  telemetry.trackCliOptionLimit(parsedArguments.flags['--limit']);
  telemetry.trackCliOptionSince(parsedArguments.flags['--since']);
  telemetry.trackCliOptionUntil(parsedArguments.flags['--until']);

  // Note: only send literal values to telemetry for known values
  const outputMode = parsedArguments.flags['--output'];
  telemetry.trackCliOptionOutput(
    outputMode,
    outputMode === 'raw' || outputMode === 'short'
  );

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

  try {
    deploymentIdOrHost = new URL(deploymentIdOrHost).hostname;
  } catch {}
  spinner(
    `Fetching deployment "${deploymentIdOrHost}" in ${chalk.bold(contextName)}`
  );

  // resolve the deployment, since we might have been given an alias
  let deployment;
  try {
    deployment = await getDeployment(client, contextName, deploymentIdOrHost);
  } finally {
    stopSpinner();
  }

  if (!isReady(deployment)) {
    error(
      `Deployment not ready. Currently: ${stateString(deployment.readyState)}.`
    );
    if (isDeploying(deployment.readyState)) {
      print(
        `To follow build logs, run \`vercel inspect --logs --wait ${deploymentIdOrHost}\``
      );
    }
    return 1;
  }

  printDisclaimer(deployment);
  const abortController = new AbortController();
  return await displayRuntimeLogs(
    client,
    {
      deploymentId: deployment.id,
      projectId: deployment.projectId,
      parse: !asJson,
    },
    abortController
  );
}

const dateTimeFormat = 'MMM dd HH:mm:ss.SS';

function printDisclaimer(deployment: Deployment) {
  // Could be temporary until users get used to this change
  output.warn(
    `This command now displays runtime logs. To access your build logs, run \`vercel inspect --logs ${deployment.url}\``
  );
  output.print(
    `Displaying runtime logs for deployment ${deployment.url} (${chalk.dim(
      deployment.id
    )}) starting from ${chalk.bold(format(Date.now(), dateTimeFormat))}\n\n`
  );
}
