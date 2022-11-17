import chalk from 'chalk';
import type Client from '../client';
import type {
  Deployment,
  PaginationOptions,
  Project,
  RollbackTarget,
} from '../../types';
import elapsed from '../output/elapsed';
import formatDate from '../format-date';
import getDeploymentInfo from './get-deployment-info';
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
 * taken longer than 3 minutes.
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
  timeout,
}: {
  client: Client;
  contextName?: string;
  deployment?: Deployment;
  project: Project;
  timeout?: string;
}): Promise<number> {
  const { output } = client;
  const timeoutMS = ms(timeout || '3m');
  const recentThreshold = Date.now() - timeoutMS;
  const rollbackTimeout = Date.now() + timeoutMS;
  let counter = 0;
  let msg = deployment
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
    output.spinner(msg);

    for (;;) {
      const { jobStatus, requestedAt, toDeploymentId }: RollbackTarget =
        (await check()) ?? {};

      output.stopSpinner();

      if (!jobStatus || requestedAt < recentThreshold) {
        output.log('No deployment rollback in progress');
        return 0;
      }

      if (jobStatus === 'succeeded') {
        let deploymentName = '';
        try {
          const deployment = await getDeploymentInfo(
            client,
            contextName,
            toDeploymentId
          );
          deploymentName = `to ${chalk.bold(deployment.url)} `;
        } catch (err: unknown) {
          if (err instanceof Error) {
            output.debug(
              `Failed to get deployment url for ${toDeploymentId}: ${err.toString()}`
            );
          }
        }
        const duration = deployment ? elapsed(Date.now() - requestedAt) : '';
        output.log(
          `Success! ${chalk.bold(
            project.name
          )} was rolled back ${deploymentName}(${toDeploymentId}) ${duration}`
        );
        return 0;
      }

      if (jobStatus === 'failed') {
        try {
          const name = (
            deployment ||
            (await getDeploymentInfo(client, contextName, toDeploymentId))
          )?.url;
          output.log(
            `Failed to remap all aliases to the requested deployment ${name} (${toDeploymentId})`
          );
        } catch (e) {
          output.log(
            `Failed to remap all aliases to the requested deployment ${toDeploymentId}`
          );
        }

        let nextTimestamp;
        for (;;) {
          let url = `/v9/projects/${project.id}/rollback/aliases?failedOnly=true&limit=20`;
          if (nextTimestamp) {
            url += `&until=${nextTimestamp}`;
          }

          const { aliases, pagination } =
            await client.fetch<RollbackAliasesResponse>(url);

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

      if (jobStatus === 'skipped') {
        output.log('Rollback was skipped');
        return 0;
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
        msg += ` requested at ${formatDate(requestedAt)}`;
      }
      output.spinner(msg);

      await sleep(500);
    }
  } finally {
    output.stopSpinner();
  }
}
