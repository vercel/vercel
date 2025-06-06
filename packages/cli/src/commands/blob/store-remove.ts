import type Client from '../../util/client';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { removeStoreSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getLinkedProject } from '../../util/projects/link';

export default async function removeStore(
  client: Client,
  argv: string[]
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(
    removeStoreSubcommand.options
  );

  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  let {
    args: [storeId],
  } = parsedArgs;

  if (!storeId) {
    storeId = await client.input.text({
      message: 'Enter the ID of the blob store you want to remove',
      validate: value => {
        if (value.length !== 22) {
          return 'ID must be 22 characters long';
        }
        return true;
      },
    });
  }

  try {
    output.debug('Deleting blob store');

    output.spinner('Deleting blob store');

    const link = await getLinkedProject(client);

    await client.fetch<{ store: { id: string } }>(
      `/v1/storage/stores/blob/${storeId}`,
      {
        method: 'DELETE',
        accountId: link.status === 'linked' ? link.org.id : undefined,
      }
    );
  } catch (err) {
    printError(err);
    return 1;
  }

  output.stopSpinner();

  output.success('Blob store deleted');

  return 0;
}
