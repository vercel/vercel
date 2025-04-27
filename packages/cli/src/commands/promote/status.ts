import chalk from 'chalk';
import type Client from '../../util/client';
import type {
  Deployment,
  LastAliasRequest,
  PaginationOptions,
  Project,
} from '@vercel-internals/types';
import elapsed from '../../util/output/elapsed';
import formatDate from '../../util/format-date';
import getDeployment from '../../util/get-deployment';
import { packageName } from '../../util/pkg-name';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';
import getScope from '../../util/get-scope';
import ms from 'ms';
import { ProjectNotFound } from '../../util/errors-ts';
import renderAliasStatus from '../../util/alias/render-alias-status';
import sleep from '../../util/sleep';
import output from '../../output-manager';

interface DeploymentAlias {
  alias: {
    alias: string;
    deploymentId: string;
  };
  id: string;
  status: 'completed' | 'in-progress' | 'pending' | 'failed';
}

interface AliasesResponse {
  aliases: DeploymentAlias[];
  pagination: PaginationOptions;
}

/**
 * Continuously checks a deployment status until it has succeeded, failed, or
 * taken longer than the timeout (default 3 minutes).
 *
 * @param {Client} client - The Vercel client instance
 * @param {string} [contextName] - The scope name; if not specified, it will be
 * extracted from the `client`
 * @param {Deployment} [deployment] - Info about the deployment which is used
 * to display different output following a promotion request
 * @param {Project} project - Project info instance
 * @param {string} [timeout] - Milliseconds to poll for succeeded/failed state
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async function promoteStatus({
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
  const recentThreshold = Date.now() - ms('3m');
  const promoteTimeout = Date.now() + ms(timeout);
  let counter = 0;
  let spinnerMessage = deployment
    ? 'Promote in progress'
    : `Checking promotion status of ${project.name}`;

  if (!contextName) {
    ({ contextName } = await getScope(client));
  }

  try {
    output.spinner(`${spinnerMessage}…`);

    // continuously loop until the promotion has explicitly succeeded, failed,
    // or timed out
    for (;;) {
      const projectCheck = await getProjectByNameOrId(
        client,
        project.id,
        project.accountId,
        true
      );
      if (projectCheck instanceof ProjectNotFound) {
        throw projectCheck;
      }

      const {
        jobStatus,
        requestedAt,
        toDeploymentId,
        type,
      }: Partial<LastAliasRequest> = projectCheck.lastAliasRequest ?? {};

      if (
        !jobStatus ||
        (jobStatus !== 'in-progress' && jobStatus !== 'pending')
      ) {
        output.stopSpinner();
        output.log(`${spinnerMessage}…`);
      }

      if (
        !jobStatus ||
        !requestedAt ||
        !toDeploymentId ||
        requestedAt < recentThreshold
      ) {
        output.log('No deployment promotion in progress');
        return 0;
      }

      if (jobStatus === 'skipped' && type === 'promote') {
        output.log('Promote deployment was skipped');
        return 0;
      }

      if (jobStatus === 'succeeded') {
        return await renderJobSucceeded({
          client,
          contextName,
          performingPromote: !!deployment,
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
        output.log(`Unknown promote deployment status "${jobStatus}"`);
        return 1;
      }

      // check if we have been running for too long
      if (requestedAt < recentThreshold || Date.now() >= promoteTimeout) {
        output.log(
          `The promotion exceeded its deadline - rerun ${chalk.bold(
            `${packageName} promote ${toDeploymentId}`
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
  let nextTimestamp: number | undefined;
  for (;;) {
    let url = `/v9/projects/${project.id}/promote/aliases?failedOnly=true&limit=20`;
    if (nextTimestamp) {
      url += `&until=${nextTimestamp}`;
    }

    const { aliases, pagination } = await client.fetch<AliasesResponse>(url);

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
  performingPromote,
  project,
  requestedAt,
  toDeploymentId,
}: {
  client: Client;
  contextName: string;
  performingPromote: boolean;
  project: Project;
  requestedAt: number;
  toDeploymentId: string;
}) {
  // attempt to get the new deployment url
  let deploymentInfo = '';
  try {
    const deployment = await getDeployment(client, contextName, toDeploymentId);
    deploymentInfo = `${chalk.bold(deployment.url)} (${toDeploymentId})`;
  } catch (err: unknown) {
    output.debug(
      `Failed to get deployment url for ${toDeploymentId}: ${
        err?.toString() || err
      }`
    );
    deploymentInfo = chalk.bold(toDeploymentId);
  }

  const duration = performingPromote ? elapsed(Date.now() - requestedAt) : '';
  output.log(
    `Success! ${chalk.bold(
      project.name
    )} was promoted to ${deploymentInfo} ${duration}`
  );
  return 0;
}
