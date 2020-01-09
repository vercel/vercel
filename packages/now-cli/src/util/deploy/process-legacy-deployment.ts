import bytes from 'bytes';
import Progress from 'progress';
import chalk from 'chalk';
import pluralize from 'pluralize';
import {
  createLegacyDeployment,
  DeploymentOptions,
  NowClientOptions,
} from 'now-client';
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
  quiet: boolean;
  nowConfig?: NowConfig;
  force?: boolean;
}) {
  const { log, debug } = output;
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

  let fileCount = null;

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
      fileCount = event.payload.missing.length;
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
        if (fileCount) {
          log(`Synced ${pluralize('file', fileCount, true)} ${uploadStamp()}`);
        }
        log(`${event.payload.url} ${chalk.grey('[v1]')} ${deployStamp()}`);
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
