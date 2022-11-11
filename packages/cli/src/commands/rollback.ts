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

  let paths = [process.cwd()];
  const pathValidation = await validatePaths(client, paths);
  if (!pathValidation.valid) {
    return pathValidation.exitCode;
  }
  const { path } = pathValidation;

  const linkedProject = await ensureLink('rollback', client, path, {
    autoConfirm: Boolean(argv['--yes']),
  });
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
 * TODO
 * @param {Client} client - ?
 * @param {string} contextName - ?
 * @param {Project} project - ?
 * @param {string} deployId - ?
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

  try {
    const deployment = await getDeploymentInfo(client, contextName, deployId);
    if (typeof deployment === 'number') {
      return deployment;
    }
    deployId = deployment.uid;
  } finally {
    output.stopSpinner();
  }

  // create the rollback
  await client.fetch<any>(`/v1/projects/${project.id}/rollback/${deployId}`, {
    body: {}, // required
    method: 'POST',
  });

  // check the status
  return await status({
    client,
    contextName,
    isRollingBack: true,
    project,
  });
}

/**
 * TODO
 * @param client
 * @param contextName
 * @param deployId
 * @returns
 */
async function getDeploymentInfo(
  client: Client,
  contextName: string,
  deployId: string
): Promise<number | Deployment> {
  try {
    const { output } = client;

    const deployment = handleCertError(
      output,
      await getDeploymentByIdOrHost(client, contextName, deployId)
    );

    if (deployment === 1) {
      return deployment;
    }

    if (deployment instanceof Error) {
      output.error(deployment.message);
      return 1;
    }

    if (!deployment) {
      output.error(
        `Couldn't find a deployment to alias. Please provide one as an argument.`
      );
      return 1;
    }

    return deployment;
  } catch (e) {
    return 1;
  }
}

/**
 * TODO
 * @param {Client} client - ?
 * @param {Project} project - ?
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
async function status({
  client,
  contextName,
  isRollingBack,
  project,
}: {
  client: Client;
  contextName?: string;
  isRollingBack?: boolean;
  project: Project;
}): Promise<number> {
  const { output } = client;

  if (!contextName) {
    ({ contextName } = await getScope(client));
  }

  const check = async () => {
    const { lastRollbackTarget } = await client.fetch<any>(
      `/v9/projects/${project.id}?rollbackInfo=true`
    );
    return lastRollbackTarget;
  };

  try {
    const recentThreshold = Date.now() + 3 * 60 * 1000; // 3 minutes
    let msg = isRollingBack
      ? 'Rollback in progress'
      : `Checking rollback status of ${project.name}`;

    output.spinner(msg);

    for (let i = 0; ; i++) {
      const { jobStatus, requestedAt, toDeploymentId }: RollbackTarget =
        (await check()) ?? {};
      output.stopSpinner();

      if (
        !jobStatus ||
        (requestedAt < Date.now() && requestedAt > recentThreshold)
      ) {
        output.log('No deployment rollback in progress');
        return 0;
      }

      if (jobStatus === 'succeeded') {
        const deployment = await getDeploymentInfo(
          client,
          contextName,
          toDeploymentId
        );
        let deploymentName = '';
        if (typeof deployment === 'object' && deployment !== null) {
          deploymentName = chalk.bold(`to ${deployment.name} `);
        }
        const duration = isRollingBack ? elapsed(Date.now() - requestedAt) : '';
        output.log(
          `Success! ${chalk.bold(
            project.name
          )} was rolled back ${deploymentName}(${toDeploymentId}) ${duration}`
        );
        return 0;
      }

      if (jobStatus === 'failed') {
        output.log('Rollback failed, please check the logs');
        return 1;
      }

      if (jobStatus === 'skipped') {
        output.log('Rollback was skipped');
        return 0;
      }

      if (jobStatus !== 'pending' && jobStatus !== 'in-progress') {
        output.log(`Unknown rollback status "${jobStatus}"`);
        return 1;
      }

      if (i === 0 && !isRollingBack) {
        msg += ` requested at ${formatDate(requestedAt)}`;
      }
      output.spinner(msg);

      await sleep(1000);
    }
  } finally {
    output.stopSpinner();
  }
}

interface RollbackTarget {
  fromDeploymentId: string;
  jobStatus: 'pending' | 'in-progress' | 'succeeded' | 'failed' | 'skipped';
  requestedAt: number;
  toDeploymentId: string;
}
