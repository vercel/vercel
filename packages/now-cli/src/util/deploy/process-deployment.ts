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
}: {
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
}) {
  const { warn, log, debug, note } = output;
  let bar: Progress | null = null;

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

  if (!isLegacy) {
    let queuedSpinner = null;
    let buildSpinner = null;
    let deploySpinner = null;

    for await (const event of createDeployment(
      nowClientOptions,
      requestBody,
      nowConfig
    )) {
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

        if (!quiet) {
          const version = isLegacy ? `${chalk.grey('[v1]')} ` : '';
          log(`https://${event.payload.url} ${version}${deployStamp()}`);
        } else {
          process.stdout.write(`https://${event.payload.url}`);
        }

        if (queuedSpinner === null) {
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

        if (buildSpinner === null) {
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

        deploySpinner = wait('Finalizing...');
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

        throw await now.handleDeploymentError(event.payload, { hashes, env });
      }

      // Handle ready event
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
  } else {
    for await (const event of createLegacyDeployment(
      nowClientOptions,
      requestBody,
      nowConfig
    )) {
      if (event.type === 'hashes-calculated') {
        hashes = event.payload;
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

        if (!quiet) {
          const version = isLegacy ? `${chalk.grey('[v1]')} ` : '';
          log(`${event.payload.url} ${version}${deployStamp()}`);
        } else {
          process.stdout.write(`https://${event.payload.url}`);
        }
      }

      // Handle error events
      if (event.type === 'error') {
        throw await now.handleDeploymentError(event.payload, { hashes, env });
      }

      // Handle ready event
      if (event.type === 'ready') {
        log(`Build completed`);
        return event.payload;
      }
    }
  }
}
