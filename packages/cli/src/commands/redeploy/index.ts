import chalk from 'chalk';
import { checkDeploymentStatus } from '@vercel/client';
import type Client from '../../util/client';
import { emoji, prependEmoji } from '../../util/emoji';
import { parseArguments } from '../../util/get-args';
import { getCommandName } from '../../util/pkg-name';
import { getDeploymentByIdOrURL } from '../../util/deploy/get-deployment-by-id-or-url';
import getScope from '../../util/get-scope';
import { printError } from '../../util/error';
import { isErrnoException } from '@vercel/error-utils';
import Now from '../../util';
import { printDeploymentStatus } from '../../util/deploy/print-deployment-status';
import stamp from '../../util/output/stamp';
import ua from '../../util/ua';
import type { VercelClientOptions } from '@vercel/client';
import { help } from '../help';
import { redeployCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { RedeployTelemetryClient } from '../../util/telemetry/commands/redeploy';
import type {
  CustomEnvironment,
  Project,
  ProjectRollingRelease,
} from '@vercel-internals/types';
import {
  getCustomEnvironments,
  pickCustomEnvironment,
} from '../../util/target/get-custom-environments';
import type { ProjectNotFound } from '../../util/errors-ts';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';

/**
 * `vc redeploy` command
 * @param {Client} client
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async function redeploy(client: Client): Promise<number> {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(redeployCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  const telemetry = new RedeployTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('redeploy');
    output.print(help(redeployCommand, { columns: client.stderr.columns }));
    return 2;
  }

  const deployIdOrUrl = parsedArgs.args[1];
  if (!deployIdOrUrl) {
    output.error(
      `Missing required deployment id or url: ${getCommandName(
        `redeploy <deployment-id-or-url>`
      )}`
    );
    return 1;
  }

  telemetry.trackCliArgumentUrlOrDeploymentId(deployIdOrUrl);
  telemetry.trackCliFlagNoWait(parsedArgs.flags['--no-wait']);
  telemetry.trackCliOptionTarget(parsedArgs.flags['--target']);

  const { contextName } = await getScope(client);
  const noWait = !!parsedArgs.flags['--no-wait'];
  const targetArgument = parsedArgs.flags['--target'];

  try {
    const fromDeployment = await getDeploymentByIdOrURL({
      client,
      contextName,
      deployIdOrUrl,
    });

    let target: 'production' | 'staging' | string | null | undefined;
    let customEnvironmentSlugOrId: string | undefined;

    if (!targetArgument) {
      target = fromDeployment.target ?? undefined;
      customEnvironmentSlugOrId = fromDeployment.customEnvironment?.id;
    } else if (
      targetArgument === 'staging' ||
      targetArgument === 'production'
    ) {
      target = targetArgument;
    } else if (targetArgument === 'preview') {
      target = undefined;
    } else if (targetArgument) {
      // custom environment
      customEnvironmentSlugOrId = targetArgument;
      target = undefined;
    } else {
      target = fromDeployment.target;
    }

    let customEnvironment: CustomEnvironment | undefined;
    if (fromDeployment?.projectId && customEnvironmentSlugOrId) {
      const customEnvironments = await getCustomEnvironments(
        client,
        fromDeployment.projectId
      );
      customEnvironment = pickCustomEnvironment(
        customEnvironments,
        customEnvironmentSlugOrId
      );
    }

    if (customEnvironmentSlugOrId && !customEnvironment) {
      output.error(
        `The provided argument "${targetArgument}" is not a valid target environment.`
      );
      return 1;
    }

    const deployStamp = stamp();
    output.spinner(`Redeploying project ${fromDeployment.id}`, 0);

    let deployment = await client.fetch<any>(`/v13/deployments?forceNew=1`, {
      body: {
        deploymentId: fromDeployment.id,
        meta: {
          action: 'redeploy',
        },
        name: fromDeployment.name,
        target,
        customEnvironmentSlugOrId,
      },
      method: 'POST',
    });

    output.stopSpinner();

    const previewUrl = `https://${deployment.url}`;
    let isProdDeployment: boolean = target === 'production';

    if (customEnvironmentSlugOrId && customEnvironment) {
      isProdDeployment = customEnvironment.type === 'production';
    }

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
      let project: Project | ProjectNotFound | undefined;
      let rollingRelease: ProjectRollingRelease | undefined;

      if (deployment.projectId && deployment.projectId != '') {
        project = await getProjectByNameOrId(client, deployment.projectId);
        rollingRelease = (project as Project)?.rollingRelease;
      }
      if (
        deployment.readyState === 'READY' &&
        deployment.aliasAssigned &&
        !rollingRelease
      ) {
        output.spinner('Completing', 0);
      } else {
        try {
          const clientOptions: VercelClientOptions = {
            dispatcher: client.dispatcher,
            apiUrl: client.apiUrl,
            debug: output.debugEnabled,
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
            } else if (event.type === 'ready' && rollingRelease) {
              output.spinner('Releasing', 0);
              output.stopSpinner();
              deployment = event.payload;
              break;
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

              if (
                event.type === 'alias-assigned' &&
                !Array.isArray(event.payload) &&
                event.payload.target === 'production' &&
                event.payload.alias &&
                event.payload.alias.length > 0
              ) {
                const primaryDomain = event.payload.alias[0];
                const prodUrl = `https://${primaryDomain}`;
                output.print(
                  prependEmoji(
                    `Aliased: ${chalk.bold(prodUrl)} ${deployStamp()}`,
                    emoji('link')
                  ) + '\n'
                );
              }

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

    return printDeploymentStatus(deployment, deployStamp, noWait, false);
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
