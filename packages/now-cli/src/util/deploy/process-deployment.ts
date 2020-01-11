import bytes from 'bytes';
import Progress from 'progress';
import chalk from 'chalk';
import pluralize from 'pluralize';
import {
  createDeployment,
  createLegacyDeployment,
  DeploymentOptions,
  NowClientOptions,
} from 'now-client';
import wait from '../output/wait';
import { Output } from '../output';
// @ts-ignore
import Now from '../../util';
import { NowConfig } from '../dev/types';
import ua from '../ua';

interface ProcessDeploymentOptions {
  now: Now;
  output: Output;
  hashes: { [key: string]: any };
  paths: string[];
  requestBody: DeploymentOptions;
  uploadStamp: () => number;
  deployStamp: () => number;
  isLegacy: boolean;
  quiet: boolean;
  nowConfig?: NowConfig;
  force?: boolean;
}

export default async function processDeployment({
  now,
  output,
  hashes,
  paths,
  requestBody,
  uploadStamp,
  deployStamp,
  isLegacy,
  quiet,
  force,
  nowConfig,
}: ProcessDeploymentOptions) {
  const { warn, log, debug, note } = output;
  const { env = {} } = requestBody;
  const nowClientOptions: NowClientOptions = {
    teamId: now.currentTeam,
    apiUrl: now._apiUrl,
    token: now._token,
    debug: now._debug,
    userAgent: ua,
    path: paths[0],
    force,
  };
  const iterator = isLegacy
    ? createLegacyDeployment(nowClientOptions, requestBody, nowConfig)
    : createDeployment(nowClientOptions, requestBody, nowConfig);

  let queuedSpinner = null;
  let buildSpinner = null;
  let deploySpinner = null;
  let bar: Progress | null = null;
  let platformVersion = isLegacy ? 1 : 2;

  for await (const event of iterator) {
    if (event.type === 'hashes-calculated') {
      hashes = event.payload;
    }

    if (event.type === 'warning') {
      warn(event.payload);
    }

    if (event.type === 'notice') {
      note(event.payload);
    }

    if (event.type === 'file_count') {
      debug(
        `Total files ${event.payload.total.size}, ${event.payload.missing.length} changed`
      );

      if (!quiet) {
        log(
          `Synced ${pluralize(
            'file',
            event.payload.missing.length,
            true
          )} ${uploadStamp()}`
        );
      }

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
      now._host = event.payload.url;

      // v1 deployments payload does not contain the version, so check first
      if (typeof event.payload.version === 'number') {
        platformVersion = event.payload.version;
      }

      if (!quiet) {
        const version = platformVersion === 1 ? `${chalk.grey('[v1]')} ` : '';
        log(`${event.payload.url} ${version}${deployStamp()}`);
      } else {
        process.stdout.write(`https://${event.payload.url}`);
      }

      if (platformVersion === 2 && queuedSpinner === null) {
        queuedSpinner = wait('Queued...');
      }
    }

    if (
      event.type === 'build-state-changed' &&
      event.payload.readyState === 'BUILDING'
    ) {
      if (queuedSpinner) {
        queuedSpinner();
      }
      if (platformVersion === 2 && buildSpinner === null) {
        buildSpinner = wait('Building...');
      }
    }

    if (event.type === 'all-builds-completed') {
      if (queuedSpinner) {
        queuedSpinner();
      }
      if (buildSpinner) {
        buildSpinner();
      }
      if (platformVersion === 2) {
        deploySpinner = wait('Finalizing...');
      }
    }

    // Handle "error" event
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

      throw await now.handleDeploymentError(event.payload, { hashes, env });
    }

    // Handle "ready" (final event for v1 legacy deployments)
    if (platformVersion === 1 && event.type === 'ready') {
      log('Build completed');
      return event.payload;
    }

    // Handle "alias-assigned" (final event for v2 deployments)
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

      return event.payload;
    }
  }
}
