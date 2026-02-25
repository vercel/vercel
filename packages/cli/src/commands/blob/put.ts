import type Client from '../../util/client';
import output from '../../output-manager';
import * as blob from '@vercel/blob';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { putSubcommand } from './command';
import { statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { isErrnoException } from '@vercel/error-utils';
import { basename } from 'node:path';
import { getCommandName } from '../../util/pkg-name';
import chalk from 'chalk';
import { BlobPutTelemetryClient } from '../../util/telemetry/commands/blob/put';
import { printError } from '../../util/error';
import { parseAccessFlag } from '../../util/blob/access';

export default async function put(
  client: Client,
  argv: string[],
  rwToken: string
): Promise<number> {
  const telemetryClient = new BlobPutTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(putSubcommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const {
    flags,
    args: [filePath],
  } = parsedArgs;
  const {
    '--access': accessFlag,
    '--add-random-suffix': addRandomSuffix,
    '--pathname': pathnameFlag,
    '--multipart': multipart,
    '--content-type': contentType,
    '--cache-control-max-age': cacheControlMaxAge,
    '--allow-overwrite': allowOverwrite,
    '--force': force,
    '--if-match': ifMatch,
  } = flags;

  if (force) {
    output.warn('--force is deprecated, use --allow-overwrite instead');
  }

  const access = parseAccessFlag(accessFlag);
  if (!access) return 1;

  // Only track file path if one was provided
  if (filePath) {
    telemetryClient.trackCliArgumentPathToFile(filePath);
  }
  telemetryClient.trackCliOptionAccess(accessFlag);
  telemetryClient.trackCliFlagAddRandomSuffix(addRandomSuffix);
  telemetryClient.trackCliOptionPathname(pathnameFlag);
  telemetryClient.trackCliFlagMultipart(multipart);
  telemetryClient.trackCliOptionContentType(contentType);
  telemetryClient.trackCliOptionCacheControlMaxAge(cacheControlMaxAge);
  telemetryClient.trackCliFlagAllowOverwrite(allowOverwrite);
  telemetryClient.trackCliFlagForce(force);
  telemetryClient.trackCliOptionIfMatch(ifMatch);

  // ReadableStream works for both stdin and ReadStream
  let putBody: ReadableStream;
  let pathname: string;

  if (!filePath) {
    // Check if stdin is a TTY (user is typing directly in terminal)
    if (client.stdin.isTTY) {
      output.error(
        `Missing input. Usage: ${chalk.cyan(
          `${getCommandName('blob put <file>')}`
        )} or pipe data: ${chalk.cyan('cat file.txt | vercel blob put --pathname <pathname>')}`
      );
      return 1;
    }

    // Reading from stdin - pathname is required
    if (!pathnameFlag) {
      output.error(
        `Missing pathname. When reading from stdin, you must specify --pathname. Usage: ${chalk.cyan(
          'cat file.txt | vercel blob put --pathname <pathname>'
        )}`
      );
      return 1;
    }

    putBody = process.stdin;
    pathname = pathnameFlag;
    telemetryClient.trackCliInputSourceStdin();
  } else {
    // Reading from file (existing logic)
    try {
      const stats = statSync(filePath);
      const isFile = stats.isFile();

      if (isFile) {
        // we first open the file so we can handle errors with promises
        const file = await open(filePath, 'r');
        putBody = file.createReadStream();
        pathname = pathnameFlag ?? basename(filePath);
      } else {
        output.error('Path to upload is not a file');
        return 1;
      }
    } catch (err) {
      output.debug(`Error reading file: ${err}`);

      if (isErrnoException(err)) {
        output.error(`File doesn't exist at '${filePath}'`);
        return 1;
      }

      output.error('Error while reading file');
      return 1;
    }
  }

  if (!pathname || !putBody) {
    output.error(
      `Missing pathname or input. Usage: ${chalk.cyan(
        `${getCommandName('blob put <file>')}`
      )} or ${chalk.cyan(
        `cat file.txt | ${getCommandName('blob put --pathname <pathname>')}`
      )}`
    );
    return 1;
  }

  let result: blob.PutBlobResult;
  try {
    output.debug('Uploading blob');

    output.spinner('Uploading blob');

    result = await blob.put(pathname, putBody, {
      token: rwToken,
      access,
      addRandomSuffix: addRandomSuffix ?? false,
      multipart: multipart ?? true,
      contentType,
      cacheControlMaxAge,
      allowOverwrite: allowOverwrite ?? force ?? false,
      ifMatch,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  output.stopSpinner();

  output.success(result.url);

  return 0;
}
