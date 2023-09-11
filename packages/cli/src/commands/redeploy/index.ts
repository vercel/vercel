import chalk from 'chalk';
import { checkDeploymentStatus } from '@vercel/client';
import type Client from '../../util/client';
import { emoji, prependEmoji } from '../../util/emoji';
import getArgs from '../../util/get-args';
import { getCommandName } from '../../util/pkg-name';
import { getDeploymentByIdOrURL } from '../../util/deploy/get-deployment-by-id-or-url';
import getScope from '../../util/get-scope';
import handleError from '../../util/handle-error';
import { isErrnoException } from '@vercel/error-utils';
import Now from '../../util';
import { printDeploymentStatus } from '../../util/deploy/print-deployment-status';
import stamp from '../../util/output/stamp';
import ua from '../../util/ua';
import type { VercelClientOptions } from '@vercel/client';
import { help } from '../help';
import { redeployCommand } from './command';

/**
 * `vc redeploy` command
 * @param {Client} client
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async function redeploy(client: Client): Promise<number> {
  let argv;
  const { output } = client;
  try {
    argv = getArgs(client.argv.slice(2), {
      '--no-wait': Boolean,
      '--yes': Boolean,
      '-y': '--yes',
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help'] || argv._[0] === 'help') {
    output.print(help(redeployCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const deployIdOrUrl = argv._[1];
  if (!deployIdOrUrl) {
    output.error(
      `Missing required deployment id or url: ${getCommandName(
        `redeploy <deployment-id-or-url>`
      )}`
    );
    return 1;
  }

  const { contextName } = await getScope(client);
  const noWait = !!argv['--no-wait'];

  try {
    const fromDeployment = await getDeploymentByIdOrURL({
      client,
      contextName,
      deployIdOrUrl,
    });

    const deployStamp = stamp();
    output.spinner(`Redeploying project ${fromDeployment.id}`, 0);

    let deployment = await client.fetch<any>(`/v13/deployments?forceNew=1`, {
      body: {
        deploymentId: fromDeployment.id,
        meta: {
          action: 'redeploy',
        },
        name: fromDeployment.name,
        target: fromDeployment.target ?? undefined,
      },
      method: 'POST',
    });

    output.stopSpinner();

    const isProdDeployment = deployment.target === 'production';
    const previewUrl = `https://${deployment.url}`;
    output.print(
      `${prependEmoji(
        `Inspect: ${chalk.bold(deployment.inspectorUrl)} ${deployStamp()}`,
        emoji('inspect')
      )}\n`
    );
    output.print(
      prependEmoji(
        `${isProdDeployment ? 'Production' : 'Preview'}: ${chalk.bold(
          previewUrl
        )} ${deployStamp()}`,
        emoji('success')
      ) + `\n`
    );

    if (!client.stdout.isTTY) {
      client.stdout.write(`https://${deployment.url}`);
    }

    if (!noWait) {
      output.spinner(
        deployment.readyState === 'QUEUED' ? 'Queued' : 'Building',
        0
      );

      if (deployment.readyState === 'READY' && deployment.aliasAssigned) {
        output.spinner('Completing', 0);
      } else {
        try {
          const clientOptions: VercelClientOptions = {
            agent: client.agent,
            apiUrl: client.apiUrl,
            debug: client.output.debugEnabled,
            path: '', // unused by checkDeploymentStatus()
            teamId: fromDeployment.team?.id,
            token: client.authConfig.token!,
            userAgent: ua,
          };

          for await (const event of checkDeploymentStatus(
            deployment,
            clientOptions
          )) {
            if (event.type === 'building') {
              output.spinner('Building', 0);
            } else if (
              event.type === 'ready' &&
              ((event.payload as any).checksState
                ? (event.payload as any).checksState === 'completed'
                : true)
            ) {
              output.spinner('Completing', 0);
            } else if (event.type === 'checks-running') {
              output.spinner('Running Checks', 0);
            } else if (
              event.type === 'alias-assigned' ||
              event.type === 'checks-conclusion-failed'
            ) {
              output.stopSpinner();
              deployment = event.payload;
              break;
            } else if (event.type === 'canceled') {
              output.stopSpinner();
              output.print('The deployment has been canceled.\n');
              return 1;
            } else if (event.type === 'error') {
              output.stopSpinner();

              const now = new Now({
                client,
                currentTeam: fromDeployment.team?.id,
              });
              const error = await now.handleDeploymentError(event.payload, {
                env: {},
              });
              throw error;
            }
          }
        } catch (err: unknown) {
          output.prettyError(err);
          process.exit(1);
        }
      }
    }

    return printDeploymentStatus(client, deployment, deployStamp, noWait);
  } catch (err: unknown) {
    output.prettyError(err);
    if (isErrnoException(err) && err.code === 'ERR_INVALID_TEAM') {
      output.error(
        `Use ${chalk.bold('vc switch')} to change your current team`
      );
    }
    return 1;
  }
}
