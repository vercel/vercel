import { isErrnoException } from '@vercel/error-utils';
import format from 'date-fns/format';
import chalk from 'chalk';
import { isReady } from '../../util/build-state';
import Client from '../../util/client';
import { handleError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import getDeployment from '../../util/get-deployment';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import { displayRuntimeLogs } from '../../util/logs';
import { help } from '../help';
import { stateString } from '../list';
import { logsCommand } from './command';
import { Deployment } from '@vercel-internals/types';

export default async function logs(client: Client) {
  let parsedArguments;
  const flagsSpecification = getFlagsSpecification(logsCommand.options);
  const { print, error, spinner, stopSpinner } = client.output;

  try {
    parsedArguments = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (parsedArguments.flags['--help']) {
    print(help(logsCommand, { columns: client.stderr.columns }));
    return 2;
  }

  if (parsedArguments.args[0] === logsCommand.name) {
    parsedArguments.args.shift();
  }

  const asJson = parsedArguments.flags['--json'];

  // extract the first parameter
  let [deploymentIdOrHost] = parsedArguments.args;

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
    return 3;
  }

  printDisclaimer(deployment, print);
  const abortController = new AbortController();
  await displayRuntimeLogs(
    client,
    {
      deploymentId: deployment.id,
      projectId: deployment.projectId,
      parse: !asJson,
    },
    abortController
  );

  return 0;
}

const dateTimeFormat = 'MMM dd HH:mm:ss.SS';

function printDisclaimer(deployment: Deployment, print: (l: string) => void) {
  print(
    `Displaying logs for deployment ${deployment.url} (${chalk.dim(
      deployment.id
    )}) starting from ${chalk.bold(format(Date.now(), dateTimeFormat))}\n\n`
  );
}
