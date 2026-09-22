import type Client from '../../util/client';
import output from '../../output-manager';
import * as blob from '@vercel/blob';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { putImageSubcommand } from './command';
import { statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { isErrnoException } from '@vercel/error-utils';
import { getCommandName } from '../../util/pkg-name';
import { BlobPutImageTelemetryClient } from '../../util/telemetry/commands/blob/put-image';
import { printError } from '../../util/error';
import { parseAccessFlag } from '../../util/blob/access';
import { blobOpts, type BlobRWToken } from '../../util/blob/token';

export default async function putImage(
  client: Client,
  argv: string[],
  auth: BlobRWToken
): Promise<number> {
  const telemetryClient = new BlobPutImageTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(putImageSubcommand.options);
  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const {
    flags,
    args: [source],
  } = parsedArgs;
  const {
    '--access': accessFlag,
    '--width': width,
    '--quality': quality,
    '--format': formatFlag,
    '--pathname': pathnameFlag,
    '--add-random-suffix': addRandomSuffix,
    '--allow-overwrite': allowOverwrite,
    '--cache-control-max-age': cacheControlMaxAge,
    '--json': asJson,
  } = flags;

  if (!source) {
    output.error(
      `Missing required argument. Usage: ${getCommandName(
        'blob put-image <file-or-url> --pathname <pathname> --width <pixels> --access <public|private>'
      )}`
    );
    return 1;
  }

  const isUrl = /^https?:\/\//i.test(source);

  const access = parseAccessFlag(accessFlag);
  if (!access) {
    return 1;
  }

  // Width, quality, and format are validated by the SDK and the API — the
  // CLI passes them through so the rules live in one place.
  const optimizeImage = {
    width,
    quality,
    format: formatFlag,
  } as blob.OptimizeImageOptions;
  const format = optimizeImage.format;

  if (!pathnameFlag) {
    output.error(
      'Missing required --pathname flag. Set the pathname to store the optimized image at in the Blob store.'
    );
    return 1;
  }
  const pathname = pathnameFlag;

  telemetryClient.trackCliArgumentPathToFileOrUrl(source);
  telemetryClient.trackCliOptionAccess(accessFlag);
  telemetryClient.trackCliOptionWidth(width);
  telemetryClient.trackCliOptionQuality(quality);
  telemetryClient.trackCliOptionFormat(formatFlag);
  telemetryClient.trackCliOptionPathname(pathnameFlag);
  telemetryClient.trackCliFlagAddRandomSuffix(addRandomSuffix);
  telemetryClient.trackCliFlagAllowOverwrite(allowOverwrite);
  telemetryClient.trackCliOptionCacheControlMaxAge(cacheControlMaxAge);
  telemetryClient.trackCliFlagJson(asJson);

  if (!auth.success || auth.kind !== 'oidc') {
    output.error(
      `Image optimization requires OIDC credentials. Pass --oidc-token and --store-id, or set the VERCEL_OIDC_TOKEN and BLOB_STORE_ID environment variables (available in .env.local after ${getCommandName('env pull')}).`
    );
    return 1;
  }

  const commonOptions = {
    ...blobOpts(auth),
    access,
    optimizeImage,
    addRandomSuffix: addRandomSuffix ?? false,
    allowOverwrite: allowOverwrite ?? false,
    cacheControlMaxAge,
  };

  let result: blob.PutBlobResult;
  try {
    output.debug('Optimizing and uploading image');
    output.spinner('Optimizing and uploading image');

    if (isUrl) {
      result = await blob.putImage(pathname, new URL(source), commonOptions);
    } else {
      let putBody: ReadableStream;
      try {
        const stats = statSync(source);
        if (!stats.isFile()) {
          output.stopSpinner();
          output.error('Path to optimize is not a file');
          return 1;
        }
        // we first open the file so we can handle errors with promises
        const file = await open(source, 'r');
        putBody = file.createReadStream();
      } catch (err) {
        output.stopSpinner();
        output.debug(`Error reading file: ${err}`);
        if (isErrnoException(err)) {
          output.error(`File doesn't exist at '${source}'`);
          return 1;
        }
        output.error('Error while reading file');
        return 1;
      }

      result = await blob.putImage(pathname, putBody, commonOptions);
    }
  } catch (err) {
    output.stopSpinner();
    printError(err);
    return 1;
  }

  output.stopSpinner();

  // The optimizer keeps the original image when the "optimized" output would
  // be larger; the stored content type is the only client-visible signal.
  const storedMimeType = result.contentType.split(';')[0].trim().toLowerCase();
  if (format && storedMimeType !== `image/${format}`) {
    output.warn(
      `The image was not converted to ${format}: it was stored unchanged as ${storedMimeType}. This usually means the optimized output would have been larger than the source image. Try a lower --quality.`
    );
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        {
          url: result.url,
          downloadUrl: result.downloadUrl,
          pathname: result.pathname,
          contentType: result.contentType,
        },
        null,
        2
      )}\n`
    );
  } else {
    client.stdout.write(`${result.url}\n`);
  }

  return 0;
}
