import type Client from '../../util/client';
import { printError } from '../../util/error';
import output from '../../output-manager';
import * as blob from '@vercel/blob';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { delSubcommand } from './command';
import { getBlobRWToken } from '../../util/blob/token';

export default async function del(
  client: Client,
  argv: string[]
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(delSubcommand.options);

  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args } = parsedArgs;

  const token = await getBlobRWToken(client);
  if (!token) {
    return 1;
  }

  try {
    output.debug('Deleting blob');

    output.spinner('Deleting blob');

    await blob.del(args, {
      token,
    });
  } catch (err) {
    printError(err);
    return 1;
  }

  output.stopSpinner();

  output.success('Blob deleted');

  return 0;
}
