import bytes from 'bytes';
import output from '../../output-manager';
import { getBlobRWToken } from '../../util/blob/token';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getLinkedProject } from '../../util/projects/link';
import { getStoreSubcommand } from './command';
import { format } from 'date-fns';
import chalk from 'chalk';
import { BlobGetStoreTelemetryClient } from '../../util/telemetry/commands/blob/store-get';

export default async function getStore(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new BlobGetStoreTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(getStoreSubcommand.options);

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

  const token = await getBlobRWToken(client);

  if (!storeId && token.success) {
    const [, , , id] = token.token.split('_');

    storeId = `store_${id}`;
  }

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

  telemetryClient.trackCliArgumentStoreId(storeId);

  try {
    const link = await getLinkedProject(client);

    output.debug('Getting blob store');

    output.spinner('Getting blob store');

    const store = await client.fetch<{
      store: {
        id: string;
        name: string;
        createdAt: number;
        updatedAt: number;
        billingState: string;
        size: number;
      };
    }>(`/v1/storage/stores/${storeId}`, {
      method: 'GET',
      accountId: link.status === 'linked' ? link.org.id : undefined,
    });

    const dateTimeFormat = 'MM/DD/YYYY HH:mm:ss.SS';

    output.print(
      `Blob Store: ${chalk.bold(store.store.name)} (${chalk.dim(store.store.id)})
Billing State: ${
        store.store.billingState === 'active'
          ? chalk.green('Active')
          : chalk.red('Inactive')
      }
Size: ${bytes(store.store.size)}
Created At: ${format(new Date(store.store.createdAt), dateTimeFormat)}
Updated At: ${format(new Date(store.store.updatedAt), dateTimeFormat)}\n`
    );
  } catch (err) {
    printError(err);
    return 1;
  }

  output.stopSpinner();

  return 0;
}
