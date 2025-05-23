import type Client from '../../util/client';
import output from '../../output-manager';
import * as blob from '@vercel/blob';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { putSubcommand } from './command';
import { getBlobRWToken } from '../../util/blob/token';
import { readFileSync, statSync } from 'node:fs';
import { isErrnoException } from '@vercel/error-utils';
import { basename } from 'node:path';
import { getCommandName } from '../../util/pkg-name';
import chalk from 'chalk';
import { BlobPutTelemetryClient } from '../../util/telemetry/commands/blob/put';
import { printError } from '../../util/error';

export default async function put(
  client: Client,
  argv: string[]
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
    '--add-random-suffix': addRandomSuffix,
    '--pathname': pathnameFlag,
    '--multipart': multipart,
    '--content-type': contentType,
    '--cache-control-max-age': cacheControlMaxAge,
    '--force': force,
  } = flags;

  telemetryClient.trackCliFlagAddRandomSuffix(addRandomSuffix);
  telemetryClient.trackCliOptionPathname(pathnameFlag);
  telemetryClient.trackCliFlagMultipart(multipart);
  telemetryClient.trackCliOptionContentType(contentType);
  telemetryClient.trackCliOptionCacheControlMaxAge(cacheControlMaxAge);
  telemetryClient.trackCliFlagForce(force);

  const token = await getBlobRWToken(client);
  if (!token) {
    return 1;
  }

  let putBody: string | Buffer;
  let pathname: string;

  try {
    const stats = statSync(filePath);
    const isFile = stats.isFile();

    if (isFile) {
      putBody = readFileSync(filePath);
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

  if (!pathname || !putBody) {
    output.error(
      `Missing pathname or file. Usage: ${chalk.cyan(
        `${getCommandName('blob put <file> [--pathname <pathname>]')}`
      )}`
    );
    return 1;
  }

  let result: blob.PutBlobResult;
  try {
    output.debug('Uploading blob');

    output.spinner('Uploading blob');

    result = await blob.put(pathname, putBody, {
      token,
      access: 'public',
      addRandomSuffix: addRandomSuffix ?? false,
      multipart: multipart ?? true,
      contentType,
      cacheControlMaxAge,
      allowOverwrite: force ?? false,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  output.stopSpinner();

  output.success(result.url);

  return 0;
}
