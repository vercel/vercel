import type Client from '../../util/client';
import { printError } from '../../util/error';
import output from '../../output-manager';
import * as blob from '@vercel/blob';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { putSubcommand } from './command';
import { getBlobRWToken } from '../../util/blob/token';
import { readFileSync, statSync } from 'fs';
import { isErrnoException } from '@vercel/error-utils';
import { basename } from 'path';
import { getCommandName } from '../../util/pkg-name';
import chalk from 'chalk';

export default async function put(
  client: Client,
  argv: string[]
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(putSubcommand.options);

  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const [fileOrContent] = parsedArgs.args;

  const { flags: opts } = parsedArgs;

  const token = await getBlobRWToken(client);
  if (!token) {
    return 1;
  }

  let putBody: string | Buffer | undefined;
  let pathname: string | undefined;

  try {
    const stats = statSync(fileOrContent);
    const isFile = stats.isFile();

    if (isFile) {
      putBody = readFileSync(fileOrContent);
      pathname = basename(fileOrContent);
    }
  } catch (err) {
    if (!isErrnoException(err)) {
      printError(err);
      return 1;
    }

    if (err.code === 'ENOENT') {
      pathname = opts['--pathname'];
      putBody = fileOrContent;
    }
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
      addRandomSuffix: opts['--add-random-suffix'] ?? false,
      multipart: opts['--multipart'] ?? false,
      contentType: opts['--content-type'],
      cacheControlMaxAge: opts['--cache-control-max-age'],
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  output.stopSpinner();

  output.success(result.url);

  return 0;
}
