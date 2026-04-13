import type Client from '../../util/client';
import { printError } from '../../util/error';
import output from '../../output-manager';
import * as blob from '@vercel/blob';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { copySubcommand } from './command';
import { BlobCopyTelemetryClient } from '../../util/telemetry/commands/blob/copy';
import { getCommandName } from '../../util/pkg-name';
import { parseAccessFlag } from '../../util/blob/access';

export default async function copy(
  client: Client,
  argv: string[],
  rwToken: string
): Promise<number> {
  const telemetryClient = new BlobCopyTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(copySubcommand.options);

  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  if (!parsedArgs.args || parsedArgs.args.length < 2) {
    printError(
      `Missing required arguments: ${getCommandName(
        'blob copy fromUrlOrPathname toPathname'
      )}`
    );
    return 1;
  }

  const {
    args: [fromUrl, toPathname],
    flags: {
      '--access': accessFlag,
      '--add-random-suffix': addRandomSuffix,
      '--content-type': contentType,
      '--cache-control-max-age': cacheControlMaxAge,
      '--if-match': ifMatch,
    },
  } = parsedArgs;

  const access = parseAccessFlag(accessFlag);
  if (!access) return 1;

  telemetryClient.trackCliArgumentFromUrlOrPathname(fromUrl);
  telemetryClient.trackCliArgumentToPathname(toPathname);
  telemetryClient.trackCliOptionAccess(accessFlag);
  telemetryClient.trackCliFlagAddRandomSuffix(addRandomSuffix);
  telemetryClient.trackCliOptionContentType(contentType);
  telemetryClient.trackCliOptionCacheControlMaxAge(cacheControlMaxAge);
  telemetryClient.trackCliOptionIfMatch(ifMatch);

  let result: blob.PutBlobResult;
  try {
    output.debug('Copying blob');

    output.spinner('Copying blob');

    result = await blob.copy(fromUrl, toPathname, {
      token: rwToken,
      access,
      addRandomSuffix: addRandomSuffix ?? false,
      contentType,
      cacheControlMaxAge,
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
