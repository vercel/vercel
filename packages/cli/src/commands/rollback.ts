import { PaginationOptions } from '../types';
import chalk from 'chalk';
import type Client from '../util/client';
import type { Deployment, Project } from '../types';
import elapsed from '../util/output/elapsed';
import { ensureLink } from '../util/link/ensure-link';
import formatDate from '../util/format-date';
import getArgs from '../util/get-args';
import getDeploymentByIdOrHost from '../util/deploy/get-deployment-by-id-or-host';
import { getPkgName } from '../util/pkg-name';
import getScope from '../util/get-scope';
import handleCertError from '../util/certs/handle-cert-error';
import handleError from '../util/handle-error';
import { isValidName } from '../util/is-valid-name';
import logo from '../util/output/logo';
import sleep from '../util/sleep';
import validatePaths from '../util/validate-paths';

const help = () => {
  console.log(`
  ${chalk.bold(
    `${logo} ${getPkgName()} rollback`
  )} [deploymentId|deploymentName]

  Quickly revert back to a previous deployment.

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -y, --yes                      Skip questions when setting up new project using default scope and settings

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Show the status of any current pending rollbacks

    ${chalk.cyan(`$ ${getPkgName()} rollback`)}
    ${chalk.cyan(`$ ${getPkgName()} rollback status`)}

  ${chalk.gray('–')} Rollback a deployment using id or url

    ${chalk.cyan(`$ ${getPkgName()} rollback <deploymnent id/url>`)}
`);
};

/**
 * `vc rollback` command
 * @param {Client} client
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async (client: Client): Promise<number> => {
  let argv;
  try {
    argv = getArgs(client.argv.slice(2), {
      '--yes': Boolean,
      '-y': '--yes',
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help'] || argv._[0] === 'help') {
    help();
    return 2;
  }

  // ensure the current directory is good
  const pathValidation = await validatePaths(client, [process.cwd()]);
  if (!pathValidation.valid) {
    return pathValidation.exitCode;
  }

  // ensure the current directory is a linked project
  const linkedProject = await ensureLink(
    'rollback',
    client,
    pathValidation.path,
    {
      autoConfirm: Boolean(argv['--yes']),
    }
  );
  if (typeof linkedProject === 'number') {
    return linkedProject;
  }

  const { project } = linkedProject;
  const actionOrDeployId = argv._[1] || 'status';

  if (actionOrDeployId === 'status') {
    return await status({
      client,
      project,
    });
  }

  return await rollback({
    client,
    deployId: actionOrDeployId,
    project,
  });
};

/**
 * Requests a rollback and waits for it complete.
 * @param {Client} client - The Vercel client instance
 * @param {Project} project - Project info instance
 * @param {string} deployId - The deployment name or id to rollback
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
async function rollback({
  client,
  deployId,
  project,
}: {
  client: Client;
  deployId: string;
  project: Project;
}): Promise<number> {
  const { output } = client;
  const { contextName } = await getScope(client);

  if (!isValidName(deployId)) {
    output.error(
      `The provided argument "${deployId}" is not a valid deployment or project`
    );
    return 1;
  }

  output.spinner(
    `Fetching deployment "${deployId}" in ${chalk.bold(contextName)}`
  );

  let deployment;
  try {
    deployment = await getDeploymentInfo(client, contextName, deployId);
  } catch (e) {
    return 1;
  } finally {
    output.stopSpinner();
  }

  // create the rollback
  await client.fetch<any>(
    `/v1/projects/${project.id}/rollback/${deployment.uid}`,
    {
      body: {}, // required
      method: 'POST',
    }
  );

  // check the status
  return await status({
    client,
    contextName,
    deployment,
    project,
  });
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
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
async function status({
  client,
  contextName,
  deployment,
  project,
}: {
  client: Client;
  contextName?: string;
  deployment?: Deployment;
  project: Project;
}): Promise<number> {
  const { output } = client;
  const recentThreshold = Date.now() - 3 * 60 * 1000; // 3 minutes
  const timeout = Date.now() + 3 * 60 * 1000;
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
        } catch (e) {
          // squelch
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
          let url = `/api/v9/projects/${project.id}/rollback/aliases?failedOnly=true&limit=20`;
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
      if (requestedAt < recentThreshold || Date.now() >= timeout) {
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

/**
 * Attempts to find the deployment by name or id.
 * @param {Client} client - The Vercel client instance
 * @param {string} contextName - The scope name
 * @param {string} deployId - The deployment name or id to rollback
 * @returns {Promise<Deployment>} Resolves an exit code or deployment info
 */
async function getDeploymentInfo(
  client: Client,
  contextName: string,
  deployId: string
): Promise<Deployment> {
  const deployment = handleCertError(
    client.output,
    await getDeploymentByIdOrHost(client, contextName, deployId)
  );

  if (deployment === 1) {
    throw new Error('Failed to get deployment');
  }

  if (deployment instanceof Error) {
    throw deployment;
  }

  if (!deployment) {
    throw new Error(`Couldn't find the deployment "${deployId}"`);
  }

  return deployment;
}

/**
 * Stylize the alias status label.
 * @param {AliasStatus} status - The status label
 * @returns {string}
 */
function renderAliasStatus(status: string): string {
  if (status === 'completed') {
    return chalk.green(status);
  }
  if (status === 'failed') {
    return chalk.red(status);
  }
  if (status === 'skipped') {
    return chalk.gray(status);
  }
  return chalk.yellow(status);
}

type AliasStatus =
  | 'pending'
  | 'in-progress'
  | 'succeeded'
  | 'failed'
  | 'skipped';

interface RollbackTarget {
  fromDeploymentId: string;
  jobStatus: AliasStatus;
  requestedAt: number;
  toDeploymentId: string;
}

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
