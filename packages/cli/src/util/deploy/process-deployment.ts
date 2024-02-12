import bytes from 'bytes';
import chalk from 'chalk';
import {
  ArchiveFormat,
  createDeployment,
  DeploymentOptions,
  VercelClientOptions,
} from '@vercel/client';
import { Output } from '../output';
import { progress } from '../output/progress';
import Now from '../../util';
import type { Deployment, Org } from '@vercel-internals/types';
import ua from '../ua';
import { linkFolderToProject } from '../projects/link';
import { prependEmoji, emoji } from '../emoji';
import type { Agent } from 'http';

function printInspectUrl(
  output: Output,
  inspectorUrl: string | null | undefined,
  deployStamp: () => string
) {
  if (!inspectorUrl) {
    return;
  }

  output.print(
    prependEmoji(
      `Inspect: ${chalk.bold(inspectorUrl)} ${deployStamp()}`,
      emoji('inspect')
    ) + `\n`
  );
}

export default async function processDeployment({
  org,
  cwd,
  projectName,
  isSettingUpProject,
  archive,
  skipAutoDetectionConfirmation,
  noWait,
  agent,
  ...args
}: {
  now: Now;
  path: string;
  requestBody: DeploymentOptions;
  uploadStamp: () => string;
  deployStamp: () => string;
  quiet: boolean;
  force?: boolean;
  withCache?: boolean;
  org: Org;
  prebuilt: boolean;
  projectName: string;
  isSettingUpProject: boolean;
  archive?: ArchiveFormat;
  skipAutoDetectionConfirmation?: boolean;
  cwd: string;
  rootDirectory?: string | null;
  noWait?: boolean;
  agent?: Agent;
}) {
  let {
    now,
    path,
    requestBody,
    deployStamp,
    force,
    withCache,
    quiet,
    prebuilt,
    rootDirectory,
  } = args;

  const client = now._client;
  const { output } = client;
  const { env = {} } = requestBody;
  const token = now._token;
  if (!token) {
    throw new Error('Missing authentication token');
  }

  const clientOptions: VercelClientOptions = {
    teamId: org.type === 'team' ? org.id : undefined,
    apiUrl: now._apiUrl,
    token,
    debug: now._debug,
    userAgent: ua,
    path,
    force,
    withCache,
    prebuilt,
    rootDirectory,
    skipAutoDetectionConfirmation,
    archive,
    agent,
  };

  const deployingSpinnerVal = isSettingUpProject
    ? 'Setting up project'
    : `Deploying ${chalk.bold(`${org.slug}/${projectName}`)}`;
  output.spinner(deployingSpinnerVal, 0);

  // collect indications to show the user once
  // the deployment is done
  const indications = [];

  try {
    for await (const event of createDeployment(clientOptions, requestBody)) {
      if (['tip', 'notice', 'warning'].includes(event.type)) {
        indications.push(event);
      }

      if (event.type === 'file-count') {
        const { total, missing, uploads } = event.payload;
        output.debug(`Total files ${total.size}, ${missing.length} changed`);

        const missingSize = missing
          .map((sha: string) => total.get(sha).data.length)
          .reduce((a: number, b: number) => a + b, 0);
        const totalSizeHuman = bytes.format(missingSize, { decimalPlaces: 1 });

        // When stderr is not a TTY then we only want to
        // print upload progress in 25% increments
        let nextStep = 0;
        const stepSize = now._client.stderr.isTTY ? 0 : 0.25;

        const updateProgress = () => {
          const uploadedBytes = uploads.reduce((acc: number, e: any) => {
            return acc + e.bytesUploaded;
          }, 0);

          const bar = progress(uploadedBytes, missingSize);
          if (!bar) {
            output.spinner(deployingSpinnerVal, 0);
          } else {
            const uploadedHuman = bytes.format(uploadedBytes, {
              decimalPlaces: 1,
              fixedDecimals: true,
            });
            const percent = uploadedBytes / missingSize;
            if (percent >= nextStep) {
              output.spinner(
                `Uploading ${chalk.reset(
                  `[${bar}] (${uploadedHuman}/${totalSizeHuman})`
                )}`,
                0
              );
              nextStep += stepSize;
            }
          }
        };

        uploads.forEach((e: any) => e.on('progress', updateProgress));
        updateProgress();
      }

      if (event.type === 'file-uploaded') {
        output.debug(
          `Uploaded: ${event.payload.file.names.join(' ')} (${bytes(
            event.payload.file.data.length
          )})`
        );
      }

      if (event.type === 'created') {
        const deployment: Deployment = event.payload;

        await linkFolderToProject(
          client,
          cwd,
          {
            orgId: org.id,
            projectId: deployment.projectId!,
          },
          projectName,
          org.slug
        );

        now.url = deployment.url;

        output.stopSpinner();

        printInspectUrl(output, deployment.inspectorUrl, deployStamp);

        const isProdDeployment = deployment.target === 'production';
        const previewUrl = `https://${deployment.url}`;

        output.print(
          prependEmoji(
            `${isProdDeployment ? 'Production' : 'Preview'}: ${chalk.bold(
              previewUrl
            )} ${deployStamp()}`,
            emoji('success')
          ) + `\n`
        );

        if (quiet) {
          process.stdout.write(`https://${event.payload.url}`);
        }

        if (noWait) {
          return deployment;
        }

        output.spinner(
          deployment.readyState === 'QUEUED' ? 'Queued' : 'Building',
          0
        );
      }

      if (event.type === 'building') {
        output.spinner('Building', 0);
      }

      if (event.type === 'canceled') {
        output.stopSpinner();
        return event.payload;
      }

      // If `checksState` is present, we can only continue to "Completing" if the checks finished,
      // otherwise we might show "Completing" before "Running Checks".
      if (
        event.type === 'ready' &&
        (event.payload.checksState
          ? event.payload.checksState === 'completed'
          : true)
      ) {
        output.spinner('Completing', 0);
      }

      if (event.type === 'checks-running') {
        output.spinner('Running Checks', 0);
      }

      if (event.type === 'checks-conclusion-failed') {
        output.stopSpinner();
        return event.payload;
      }

      // Handle error events
      if (event.type === 'error') {
        output.stopSpinner();

        const error = await now.handleDeploymentError(event.payload, {
          env,
        });

        if (error.code === 'missing_project_settings') {
          return error;
        }

        if (error.code === 'forbidden') {
          return error;
        }

        throw error;
      }

      // Handle alias-assigned event
      if (event.type === 'alias-assigned') {
        output.stopSpinner();
        event.payload.indications = indications;
        return event.payload;
      }
    }
  } catch (err) {
    output.stopSpinner();
    throw err;
  }
}
