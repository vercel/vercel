import bytes from 'bytes';
import Progress from 'progress';
import chalk from 'chalk';
import {
  createDeployment,
  DeploymentOptions,
  NowClientOptions,
} from 'now-client';
import { Output } from '../output';
// @ts-ignore
import Now from '../../util';
import { NowConfig } from '../dev/types';
import { Org } from '../../types';
import ua from '../ua';
import processLegacyDeployment from './process-legacy-deployment';
import { linkFolderToProject } from '../projects/link';
import { prependEmoji, emoji } from '../emoji';

function printInspectUrl(
  output: Output,
  deploymentUrl: string,
  deployStamp: () => string,
  orgSlug: string
) {
  const url = deploymentUrl.replace('https://', '');

  // example urls:
  // lucim-fyulaijvg.now.sh
  // s-66p6vb23x.n8.io (custom domain suffix)
  const [sub, ...p] = url.split('.');
  const apex = p.join('.');

  const q = sub.split('-');
  const deploymentShortId = q.pop();
  const projectName = q.join('-');

  const inspectUrl = `https://zeit.co/${orgSlug}/${projectName}/${deploymentShortId}${
    apex !== 'now.sh' ? `/${apex}` : ''
  }`;

  output.print(
    prependEmoji(
      `Inspect: ${chalk.bold(inspectUrl)} ${deployStamp()}`,
      emoji('inspect')
    ) + `\n`
  );
}

export default async function processDeployment({
  isLegacy,
  org,
  cwd,
  projectName,
  isSettingUpProject,
  skipAutoDetectionConfirmation,
  ...args
}: {
  now: Now;
  output: Output;
  hashes: { [key: string]: any };
  paths: string[];
  requestBody: DeploymentOptions;
  uploadStamp: () => string;
  deployStamp: () => string;
  isLegacy: boolean;
  quiet: boolean;
  nowConfig?: NowConfig;
  force?: boolean;
  org: Org;
  projectName: string;
  isSettingUpProject: boolean;
  skipAutoDetectionConfirmation?: boolean;
  cwd?: string;
}) {
  if (isLegacy) return processLegacyDeployment(args);

  let {
    now,
    output,
    hashes,
    paths,
    requestBody,
    deployStamp,
    force,
    nowConfig,
    quiet,
  } = args;

  const { debug } = output;
  let bar: Progress | null = null;

  const { env = {} } = requestBody;

  const nowClientOptions: NowClientOptions = {
    teamId: org.type === 'team' ? org.id : undefined,
    apiUrl: now._apiUrl,
    token: now._token,
    debug: now._debug,
    userAgent: ua,
    path: paths[0],
    force,
    skipAutoDetectionConfirmation,
  };

  let queuedSpinner = null;
  let buildSpinner = null;
  let deploySpinner = null;

  let deployingSpinner = output.spinner(
    isSettingUpProject
      ? `Setting up project`
      : `Deploying ${chalk.bold(`${org.slug}/${projectName}`)}`,
    0
  );

  // collect indications to show the user once
  // the deployment is done
  const indications = [];

  for await (const event of createDeployment(
    nowClientOptions,
    requestBody,
    nowConfig
  )) {
    if (event.type === 'hashes-calculated') {
      hashes = event.payload;
    }

    if (['tip', 'notice', 'warning'].includes(event.type)) {
      indications.push(event);
    }

    if (event.type === 'file-count') {
      debug(
        `Total files ${event.payload.total.size}, ${event.payload.missing.length} changed`
      );

      const missingSize = event.payload.missing
        .map((sha: string) => event.payload.total.get(sha).data.length)
        .reduce((a: number, b: number) => a + b, 0);

      bar = new Progress(`${chalk.gray('>')} Upload [:bar] :percent :etas`, {
        width: 20,
        complete: '=',
        incomplete: '',
        total: missingSize,
        clear: true,
      });
    }

    if (event.type === 'file-uploaded') {
      debug(
        `Uploaded: ${event.payload.file.names.join(' ')} (${bytes(
          event.payload.file.data.length
        )})`
      );

      if (bar) {
        bar.tick(event.payload.file.data.length);
      }
    }

    if (event.type === 'created') {
      if (deployingSpinner) {
        deployingSpinner();
      }

      now._host = event.payload.url;

      await linkFolderToProject(
        output,
        cwd || paths[0],
        {
          orgId: org.id,
          projectId: event.payload.projectId,
        },
        projectName,
        org.slug
      );

      printInspectUrl(output, event.payload.url, deployStamp, org.slug);

      if (quiet) {
        process.stdout.write(`https://${event.payload.url}`);
      }

      if (queuedSpinner === null) {
        queuedSpinner =
          event.payload.readyState === 'QUEUED'
            ? output.spinner('Queued', 0)
            : output.spinner('Building', 0);
      }
    }

    if (event.type === 'building') {
      if (queuedSpinner) {
        queuedSpinner();
      }

      if (buildSpinner === null) {
        buildSpinner = output.spinner('Building', 0);
      }
    }

    if (event.type === 'ready') {
      if (queuedSpinner) {
        queuedSpinner();
      }
      if (buildSpinner) {
        buildSpinner();
      }

      deploySpinner = output.spinner('Completing', 0);
    }

    // Handle error events
    if (event.type === 'error') {
      if (queuedSpinner) {
        queuedSpinner();
      }
      if (buildSpinner) {
        buildSpinner();
      }
      if (deploySpinner) {
        deploySpinner();
      }
      if (deployingSpinner) {
        deployingSpinner();
      }

      const error = await now.handleDeploymentError(event.payload, {
        hashes,
        env,
      });

      if (error.code === 'missing_project_settings') {
        return error;
      }

      throw error;
    }

    // Handle alias-assigned event
    if (event.type === 'alias-assigned') {
      if (queuedSpinner) {
        queuedSpinner();
      }
      if (buildSpinner) {
        buildSpinner();
      }
      if (deploySpinner) {
        deploySpinner();
      }
      if (deployingSpinner) {
        deployingSpinner();
      }

      event.payload.indications = indications;
      return event.payload;
    }
  }
}
