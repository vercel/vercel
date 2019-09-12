import bytes from 'bytes';
import Progress from 'progress';
import chalk from 'chalk';
import pluralize from 'pluralize';
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
  deployStamp,
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

        if (!quiet) {
          log(
            `Synced ${pluralize(
              'file',
              event.payload.missing.length,
              true
            )} ${uploadStamp()}`
          );
        }

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

      if (event.type === 'created') {
        now._host = event.payload.url;

        if (!quiet) {
          log(
            `https://${event.payload.url} ${chalk.gray(
              `[v2]`
            )} ${deployStamp()}`
          );
        } else {
          process.stdout.write(`https://${event.payload.url}`);
        }
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
        if (!quiet) {
          log(
            `Synced ${pluralize(
              'file',
              event.payload.missing.length,
              true
            )} ${uploadStamp()}`
          );
        }

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

      if (event.type === 'created') {
        now._host = event.payload.url;

        if (!quiet) {
          log(`${event.payload.url} ${chalk.gray(`[v2]`)} ${deployStamp()}`);
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
