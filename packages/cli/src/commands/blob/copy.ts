import type Client from '../../util/client';
import { printError } from '../../util/error';
import output from '../../output-manager';
import * as blob from '@vercel/blob';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { putSubcommand } from './command';
import { getBlobRWToken } from '../../util/blob/token';

export default async function copy(
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

  const {
    args: [fromUrl, toPathname],
    flags: opts,
  } = parsedArgs;

  const token = await getBlobRWToken(client);
  if (!token) {
    return 1;
  }

  let result: blob.PutBlobResult;
  try {
    output.debug('Copying blob');

    output.spinner('Copying blob');

    result = await blob.copy(fromUrl, toPathname, {
      token,
      access: 'public',
      addRandomSuffix: opts['--add-random-suffix'] ?? false,
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
