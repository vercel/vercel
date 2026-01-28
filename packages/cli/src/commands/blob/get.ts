import type Client from '../../util/client';
import type { ReadableStream as WebReadableStream } from 'stream/web';
import output from '../../output-manager';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import * as blob from '@vercel/blob';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getSubcommand } from './command';
import { getCommandName } from '../../util/pkg-name';
import { BlobGetTelemetryClient } from '../../util/telemetry/commands/blob/get';
import { printError } from '../../util/error';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import bytes from 'bytes';

function isAccess(access: string): access is 'private' | 'public' {
  return access === 'private' || access === 'public';
}

interface GetBlobResult {
  stream: ReadableStream;
  blob: {
    url: string;
    pathname: string;
    contentType: string;
    size: number;
  };
}

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

  if (!parsedArgs.args.length) {
    printError(
      `Missing required arguments: ${getCommandName('blob get urlOrPathname --access <public|private>')}`
    );
    return 1;
  }

  const {
    args: [urlOrPathname],
    flags: { '--access': accessFlag, '--output': outputPath },
  } = parsedArgs;

  if (!accessFlag) {
    output.error(
      `Missing access level. Must specify --access with either 'private' or 'public'`
    );
    return 1;
  }

  if (!isAccess(accessFlag)) {
    output.error(
      `Invalid access level: ${accessFlag}. Must be either 'private' or 'public'`
    );
    return 1;
  }

  telemetryClient.trackCliArgumentUrlOrPathname(urlOrPathname);
  telemetryClient.trackCliOptionAccess(accessFlag);
  telemetryClient.trackCliOptionOutput(outputPath);

  let result: GetBlobResult | null;
  try {
    output.debug('Getting blob');

    output.spinner('Getting blob');

    // Use type assertion for the get function which exists in newer @vercel/blob versions
    const blobGet = (
      blob as unknown as {
        get: (
          url: string,
          opts: { token: string; access: 'public' | 'private' }
        ) => Promise<GetBlobResult | null>;
      }
    ).get;
    result = await blobGet(urlOrPathname, {
      token: rwToken,
      access: accessFlag,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  output.stopSpinner();

  if (!result) {
    output.error(`Blob not found: ${urlOrPathname}`);
    return 1;
  }

  if (outputPath) {
    try {
      // Convert web ReadableStream to Node.js Readable stream and pipe to file
      const nodeStream = Readable.fromWeb(result.stream as WebReadableStream);
      const writeStream = createWriteStream(outputPath);
      await pipeline(nodeStream, writeStream);
      output.success(
        `Blob saved to ${outputPath} (${bytes(result.blob.size)}, ${result.blob.contentType})`
      );
    } catch (err) {
      output.error(`Error writing to file: ${err}`);
      return 1;
    }
  } else {
    output.print(`URL: ${result.blob.url}
Pathname: ${result.blob.pathname}
Content-Type: ${result.blob.contentType}
Size: ${bytes(result.blob.size)}
`);
  }

  return 0;
}
