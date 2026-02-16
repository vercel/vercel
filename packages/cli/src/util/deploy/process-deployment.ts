import type {
  Deployment,
  Org,
  Project,
  ProjectRollingRelease,
} from '@vercel-internals/types';
import {
  type ArchiveFormat,
  type DeploymentOptions,
  type VercelClientOptions,
  createDeployment,
} from '@vercel/client';
import { isErrorLike } from '@vercel/error-utils';
import bytes from 'bytes';
import chalk from 'chalk';
import type { Dispatcher } from 'undici';
import type Now from '../../util';
import { emoji, prependEmoji } from '../emoji';
import { displayBuildLogs, type BuildLog, parseLogLines } from '../logs';
import { progress } from '../output/progress';
import ua from '../ua';
import output from '../../output-manager';
import eraseLines from '../output/erase-lines';
import getProjectByNameOrId from '../projects/get-project-by-id-or-name';
import type { ProjectNotFound } from '../errors-ts';
import printEvents from '../events';

function printInspectUrl(
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
  projectName,
  isSettingUpProject,
  archive,
  skipAutoDetectionConfirmation,
  noWait,
  withFullLogs,
  dispatcher,
  manual,
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
  vercelOutputDir?: string;
  projectName: string;
  isSettingUpProject: boolean;
  archive?: ArchiveFormat;
  skipAutoDetectionConfirmation?: boolean;
  rootDirectory?: string | null;
  noWait?: boolean;
  withFullLogs?: boolean;
  dispatcher?: Dispatcher;
  bulkRedirectsPath?: string | null;
  manual?: boolean;
}) {
  const {
    now,
    path,
    requestBody,
    deployStamp,
    force,
    withCache,
    quiet,
    prebuilt,
    vercelOutputDir,
    rootDirectory,
    bulkRedirectsPath,
  } = args;

  const client = now._client;

  const { env = {} } = requestBody;
  const token = now._token;
  if (!token) {
    throw new Error('Missing authentication token');
  }

  const clientOptions: VercelClientOptions = {
    teamId: org.type === 'team' ? org.id : undefined,
    apiUrl: now._apiUrl,
    token,
    debug: output.isDebugEnabled(),
    userAgent: ua,
    path,
    force,
    withCache,
    prebuilt,
    vercelOutputDir,
    rootDirectory,
    skipAutoDetectionConfirmation,
    archive,
    dispatcher,
    projectName,
    bulkRedirectsPath,
    manual,
  };

  const deployingSpinnerVal = isSettingUpProject
    ? 'Setting up project'
    : `Deploying ${chalk.bold(`${org.slug}/${projectName}`)}`;
  output.spinner(deployingSpinnerVal, 0);

  // collect indications to show the user once
  // the deployment is done
  const indications = [];

  let abortController: AbortController | undefined;

  function stopSpinner(): void {
    abortController?.abort();
    output.stopSpinner();
  }

  let rollingRelease: ProjectRollingRelease | undefined;
  let project: Project | ProjectNotFound | undefined;
  let latestLogMessage = '';

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

        now.url = deployment.url;

        stopSpinner();

        printInspectUrl(deployment.inspectorUrl, deployStamp);

        const isProdDeployment = deployment.target === 'production';
        const previewUrl = `https://${deployment.url}`;

        output.print(
          prependEmoji(
            `${isProdDeployment ? 'Production' : 'Preview'}: ${chalk.bold(
              previewUrl
            )} ${deployStamp()}`,
            emoji(withFullLogs ? 'link' : 'loading')
          ) + `\n`
        );

        if (quiet || process.env.FORCE_TTY === '1') {
          process.stdout.write(`https://${event.payload.url}`);
        }

        if (noWait) {
          return deployment;
        }

        latestLogMessage =
          deployment.readyState === 'QUEUED' ? 'Queued...' : 'Building...';

        if (withFullLogs) {
          let promise: Promise<void>;
          ({ abortController, promise } = displayBuildLogs(
            client,
            deployment,
            true
          ));
          promise.catch(error =>
            output.warn(`Failed to read build logs: ${error}`)
          );
        } else {
          abortController = new AbortController();
          const promise = printEvents(
            client,
            deployment.id,
            {
              mode: 'logs',
              onEvent: (event: BuildLog) => {
                if (!event.created) return;
                const lines = parseLogLines(event);
                const message = lines[0];
                if (message) {
                  latestLogMessage = `Building: ${message}`;
                  output.spinner(latestLogMessage, 0);
                }
              },
              quiet: false,
              findOpts: { direction: 'forward', follow: true },
            },
            abortController
          );
          promise.catch(error =>
            output.warn(`Failed to read build logs: ${error}`)
          );
        }
        output.spinner(latestLogMessage, 0);
      }

      if (event.type === 'building' && !withFullLogs) {
        output.spinner(latestLogMessage || 'Building...', 0);
      }

      if (event.type === 'canceled') {
        stopSpinner();
        return event.payload;
      }

      if (project === undefined) {
        project = await getProjectByNameOrId(client, projectName);
        rollingRelease = (project as Project)?.rollingRelease;
      }

      if (event.type === 'ready' && rollingRelease) {
        output.spinner('Releasing...', 0);
        stopSpinner();
        return event.payload;
      }

      // If `checksState` is present, we can only continue to "Completing" if the checks finished,
      // otherwise we might show "Completing" before "Running Checks".
      if (
        event.type === 'ready' &&
        (event.payload.checksState
          ? event.payload.checksState === 'completed'
          : true) &&
        !withFullLogs
      ) {
        stopSpinner();
        process.stderr.write(eraseLines(2));
        const isProdDeployment = event.payload.target === 'production';
        const previewUrl = `https://${event.payload.url}`;
        output.print(
          prependEmoji(
            `${isProdDeployment ? 'Production' : 'Preview'}: ${chalk.bold(
              previewUrl
            )} ${deployStamp()}`,
            emoji('success')
          ) + `\n`
        );
        output.spinner('Completing...', 0);
      }

      if (event.type === 'checks-running' && !withFullLogs) {
        output.spinner('Running Checks...', 0);
      }

      if (event.type === 'checks-conclusion-failed') {
        stopSpinner();
        return event.payload;
      }

      // Handle error events
      if (event.type === 'error') {
        stopSpinner();

        if (!archive) {
          const maybeError = handleErrorSolvableWithArchive(event.payload);
          if (maybeError) {
            throw maybeError;
          }
        }

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
        stopSpinner();

        if (
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

        event.payload.indications = indications;
        return event.payload;
      }
    }
  } catch (err) {
    stopSpinner();
    throw err;
  }
}

export const archiveSuggestionText =
  'Try using `--archive=tgz` to limit the amount of files you upload.';

export class UploadErrorMissingArchive extends Error {
  link = 'https://vercel.com/docs/cli/deploy#archive';
}

export function handleErrorSolvableWithArchive(error: unknown) {
  if (isErrorLike(error)) {
    const isUploadRateLimit =
      'errorName' in error &&
      typeof error.errorName === 'string' &&
      error.errorName.startsWith('api-upload-');
    const isTooManyFilesLimit =
      'code' in error && error.code === 'too_many_files';

    if (isUploadRateLimit || isTooManyFilesLimit) {
      return new UploadErrorMissingArchive(
        `${error.message}\n${archiveSuggestionText}`
      );
    }
  }
}
