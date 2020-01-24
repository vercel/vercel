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

export default async function processLegacyDeployment({
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
  uploadStamp: () => string;
  deployStamp: () => string;
  quiet: boolean;
  nowConfig?: NowConfig;
  force?: boolean;
}) {
  let platformVersion = 1;
  const { log, debug, note, warn } = output;
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
    if (event.type === 'notice') {
      note(event.payload);
    }

    if (event.type === 'warning') {
      warn(event.payload);
    }

    if (event.type === 'hashes-calculated') {
      hashes = event.payload;
    }

    if (event.type === 'file-count') {
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

      if (typeof event.payload.version === 'number') {
        platformVersion = event.payload.version;
      }

      if (!quiet) {
        if (fileCount) {
          log(`Synced ${pluralize('file', fileCount, true)} ${uploadStamp()}`);
        }
        log(
          chalk`https://${event.payload.url} {gray [v${String(
            platformVersion
          )}]} ${deployStamp()}`
        );
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

      if (platformVersion === 1) {
        return event.payload;
      }
    }

    // Handle alias-assigned event
    if (platformVersion > 1 && event.type === 'alias-assigned') {
      log(`Alias assigned`);

      return event.payload;
    }
  }
}
