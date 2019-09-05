import bytes from 'bytes';
import Progress from 'progress';
import chalk from 'chalk';
import { createDeployment, createLegacyDeployment } from 'now-client';
import wait from '../output/wait';
import createOutput from '../output';

export default async function processDeployment({
  now,
  debug,
  hashes,
  paths,
  requestBody,
  uploadStamp,
  legacy,
  env,
  quiet,
}: any) {
  const { warn, log } = createOutput({ debug });
  let bar: Progress | null = null;

  if (!legacy) {
    let buildSpinner = null;
    let deploySpinner = null;

    for await (const event of createDeployment(paths[0], requestBody)) {
      if (event.type === 'hashes-calculated') {
        hashes = event.payload;
      }

      if (event.type === 'warning') {
        warn(event.payload);
      }

      if (event.type === 'file_count') {
        debug(
          `Total files ${event.payload.total.size}, ${event.payload.missing.length} changed`
        );

        const size = Object.values(hashes).reduce((acc: number, file: any) => {
          const fileSize = file.data.byteLength || file.data.length;

          return acc + fileSize;
        }, 0);

        const missingSize = event.payload.missing
          .map((sha: string) => event.payload.total.get(sha).data.length)
          .reduce((a: number, b: number) => a + b, 0);

        bar = new Progress(
          `${chalk.gray(
            '>'
          )} Upload [:bar] :percent :etas (${size}) [${missingSize}]`,
          {
            width: 20,
            complete: '=',
            incomplete: '',
            total: missingSize,
            clear: true,
          }
        );
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

      if (event.type === 'all-files-uploaded') {
        if (!quiet) {
          log(`Synced ${event.payload.size} ${uploadStamp()}`);
        }
      }

      if (event.type === 'created') {
        now._host = event.payload.url;
      }

      if (event.type === 'build-state-changed') {
        if (buildSpinner === null) {
          buildSpinner = wait('Building...');
        }
      }

      if (event.type === 'all-builds-completed') {
        if (buildSpinner) {
          buildSpinner();
        }

        deploySpinner = wait('Finalizing...');
      }

      // Handle error events
      if (event.type === 'error') {
        if (buildSpinner) {
          buildSpinner();
        }

        if (deploySpinner) {
          deploySpinner();
        }

        throw await now.handleDeploymentError(event.payload, { hashes, env });
      }

      // Handle ready event
      if (event.type === 'ready') {
        if (deploySpinner) {
          deploySpinner();
        }

        return event.payload;
      }
    }
  } else {
    for await (const event of createLegacyDeployment(paths[0], requestBody)) {
      if (event.type === 'hashes-calculated') {
        hashes = event.payload;
      }

      if (event.type === 'file_count') {
        debug(
          `Total files ${event.payload.total.size}, ${event.payload.missing.length} changed`
        );

        const size = Object.values(hashes).reduce((acc: number, file: any) => {
          const fileSize = file.data.byteLength || file.data.length;

          return acc + fileSize;
        }, 0);

        const missingSize = event.payload.missing
          .map((sha: string) => event.payload.total.get(sha).data.length)
          .reduce((a: number, b: number) => a + b, 0);

        bar = new Progress(
          `${chalk.gray(
            '>'
          )} Upload [:bar] :percent :etas (${size}) [${missingSize}]`,
          {
            width: 20,
            complete: '=',
            incomplete: '',
            total: missingSize,
            clear: true,
          }
        );
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

      if (event.type === 'all-files-uploaded') {
        if (!quiet) {
          log(`Synced ${event.payload.size} ${uploadStamp()}`);
        }

        log('Building…');
      }

      if (event.type === 'created') {
        now._host = event.payload.url;
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
