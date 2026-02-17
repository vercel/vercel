import type Client from '../../util/client';
import output from '../../output-manager';
import * as blob from '@vercel/blob';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getSubcommand } from './command';
import { getCommandName } from '../../util/pkg-name';
import { BlobGetTelemetryClient } from '../../util/telemetry/commands/blob/get';
import { printError } from '../../util/error';
import { isAccess } from '../../util/blob/access';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebReadableStream } from 'node:stream/web';
import { pipeline } from 'node:stream/promises';
import bytes from 'bytes';

export default async function get(
  client: Client,
  argv: string[],
  rwToken: string
): Promise<number> {
  const telemetryClient = new BlobGetTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(getSubcommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const {
    flags,
    args: [urlOrPathname],
  } = parsedArgs;
  const { '--access': accessFlag, '--output': outputPath } = flags;

  if (!urlOrPathname) {
    output.error(
      `Missing required argument. Usage: ${getCommandName('blob get <urlOrPathname>')}`
    );
    return 1;
  }

  const access = accessFlag ?? 'public';
  if (!isAccess(access)) {
    output.error(
      `Invalid access value: '${access}'. Must be 'public' or 'private'.`
    );
    return 1;
  }

  telemetryClient.trackCliArgumentUrlOrPathname(urlOrPathname);
  telemetryClient.trackCliOptionAccess(accessFlag);
  telemetryClient.trackCliOptionOutput(outputPath);

  try {
    output.debug('Downloading blob');

    if (outputPath) {
      output.spinner('Downloading blob');
    }

    const result = await blob.get(urlOrPathname, {
      token: rwToken,
      access,
    });

    if (!result) {
      output.error(`Blob not found: ${urlOrPathname}`);
      return 1;
    }

    const nodeStream = Readable.fromWeb(result.body as NodeWebReadableStream);

    if (outputPath) {
      const writeStream = createWriteStream(outputPath);
      await pipeline(nodeStream, writeStream);

      output.stopSpinner();

      const sizeInfo = result.contentLength
        ? ` (${bytes(result.contentLength)})`
        : '';
      const typeInfo = result.contentType ? `, ${result.contentType}` : '';
      output.success(`Saved to ${outputPath}${sizeInfo}${typeInfo}`);
    } else {
      await pipeline(nodeStream, client.stdout, { end: false });
    }
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  return 0;
}
