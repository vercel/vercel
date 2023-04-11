import chalk from 'chalk';
import type Client from '../client';
import type {
  Deployment,
  PaginationOptions,
  Project,
  RollbackTarget,
} from '@vercel-internals/types';
import elapsed from '../output/elapsed';
import formatDate from '../format-date';
import getDeployment from '../get-deployment';
import getScope from '../get-scope';
import ms from 'ms';
import renderAliasStatus from './render-alias-status';
import sleep from '../sleep';

interface RollbackAlias {
  alias: {
    alias: string;
    deploymentId: string;
  };
  id: string;
  status: 'completed' | 'in-progress' | 'pending' | 'failed';
}

interface RollbackAliasesResponse {
  aliases: RollbackAlias[];
  pagination: PaginationOptions;
}

/**
 * Continuously checks a deployment status until it has succeeded, failed, or
 * taken longer than the timeout (default 3 minutes).
 * @param {Client} client - The Vercel client instance
 * @param {string} [contextName] - The scope name; if not specified, it will be
 * extracted from the `client`
 * @param {Deployment} [deployment] - Info about the deployment which is used
 * to display different output following a rollback request
 * @param {Project} project - Project info instance
 * @param {string} [timeout] - Milliseconds to poll for succeeded/failed state
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async function rollbackStatus({
  client,
  contextName,
  deployment,
  project,
  timeout = '3m',
}: {
  client: Client;
  contextName?: string;
  deployment?: Deployment;
  project: Project;
  timeout?: string;
}): Promise<number> {
  const { output } = client;
  const recentThreshold = Date.now() - ms('3m');
  const rollbackTimeout = Date.now() + ms(timeout);
  let counter = 0;
  let spinnerMessage = deployment
    ? 'Rollback in progress'
    : `Checking rollback status of ${project.name}`;

  const check = async () => {
    const { lastRollbackTarget } = await client.fetch<any>(
      `/v9/projects/${project.id}?rollbackInfo=true`
    );
    return lastRollbackTarget;
  };

  if (!contextName) {
    ({ contextName } = await getScope(client));
  }

  try {
    output.spinner(`${spinnerMessage}…`);

    // continuously loop until the rollback has explicitly succeeded, failed,
    // or timed out
    for (;;) {
      const { jobStatus, requestedAt, toDeploymentId }: RollbackTarget =
        (await check()) ?? {};

      if (
        !jobStatus ||
        (jobStatus !== 'in-progress' && jobStatus !== 'pending')
      ) {
        output.stopSpinner();
        output.log(`${spinnerMessage}…`);
      }

      if (!jobStatus || requestedAt < recentThreshold) {
        output.log('No deployment rollback in progress');
        return 0;
      }

      if (jobStatus === 'skipped') {
        output.log('Rollback was skipped');
        return 0;
      }

      if (jobStatus === 'succeeded') {
        return await renderJobSucceeded({
          client,
          contextName,
          performingRollback: !!deployment,
          requestedAt,
          project,
          toDeploymentId,
        });
      }

      if (jobStatus === 'failed') {
        return await renderJobFailed({
          client,
          contextName,
          deployment,
          project,
          toDeploymentId,
        });
      }

      // lastly, if we're not pending/in-progress, then we don't know what
      // the status is, so bail
      if (jobStatus !== 'pending' && jobStatus !== 'in-progress') {
        output.log(`Unknown rollback status "${jobStatus}"`);
        return 1;
      }

      // check if we have been running for too long
      if (requestedAt < recentThreshold || Date.now() >= rollbackTimeout) {
        output.log(
          `The rollback exceeded its deadline - rerun ${chalk.bold(
            `vercel rollback ${toDeploymentId}`
          )} to try again`
        );
        return 1;
      }

      // if we've done our first poll and not rolling back, then print the
      // requested at date/time
      if (counter++ === 0 && !deployment) {
        spinnerMessage += ` requested at ${formatDate(requestedAt)}`;
      }
      output.spinner(`${spinnerMessage}…`);

      await sleep(250);
    }
  } finally {
    output.stopSpinner();
  }
}

async function renderJobFailed({
  client,
  contextName,
  deployment,
  project,
  toDeploymentId,
}: {
  client: Client;
  contextName: string;
  deployment?: Deployment;
  project: Project;
  toDeploymentId: string;
}) {
  const { output } = client;

  try {
    const name = (
      deployment || (await getDeployment(client, contextName, toDeploymentId))
    )?.url;
    output.error(
      `Failed to remap all aliases to the requested deployment ${name} (${toDeploymentId})`
    );
  } catch (e) {
    output.error(
      `Failed to remap all aliases to the requested deployment ${toDeploymentId}`
    );
  }

  // aliases are paginated, so continuously loop until all of them have been
  // fetched
  let nextTimestamp;
  for (;;) {
    let url = `/v9/projects/${project.id}/rollback/aliases?failedOnly=true&limit=20`;
    if (nextTimestamp) {
      url += `&until=${nextTimestamp}`;
    }

    const { aliases, pagination } = await client.fetch<RollbackAliasesResponse>(
      url
    );

    for (const { alias, status } of aliases) {
      output.log(
        `  ${renderAliasStatus(status).padEnd(11)}  ${alias.alias} (${
          alias.deploymentId
        })`
      );
    }

    if (pagination?.next) {
      nextTimestamp = pagination.next;
    } else {
      break;
    }
  }

  return 1;
}

async function renderJobSucceeded({
  client,
  contextName,
  performingRollback,
  project,
  requestedAt,
  toDeploymentId,
}: {
  client: Client;
  contextName: string;
  performingRollback: boolean;
  project: Project;
  requestedAt: number;
  toDeploymentId: string;
}) {
  const { output } = client;

  // attempt to get the new deployment url
  let deploymentInfo = '';
  try {
    const deployment = await getDeployment(client, contextName, toDeploymentId);
    deploymentInfo = `${chalk.bold(deployment.url)} (${toDeploymentId})`;
  } catch (err: any) {
    output.debug(
      `Failed to get deployment url for ${toDeploymentId}: ${
        err?.toString() || err
      }`
    );
    deploymentInfo = chalk.bold(toDeploymentId);
  }

  const duration = performingRollback ? elapsed(Date.now() - requestedAt) : '';
  output.log(
    `Success! ${chalk.bold(
      project.name
    )} was rolled back to ${deploymentInfo} ${duration}`
  );
  return 0;
}
