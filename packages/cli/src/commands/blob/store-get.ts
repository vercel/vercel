import output from '../../output-manager';
import type { BlobRWToken } from '../../util/blob/token';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getLinkedProject } from '../../util/projects/link';
import { getStoreSubcommand } from './command';
import { BlobGetStoreTelemetryClient } from '../../util/telemetry/commands/blob/store-get';
import {
  formatStoreDetails,
  type StoreDetails,
} from '../../util/blob/format-store';

export default async function getStore(
  client: Client,
  argv: string[],
  rwToken: BlobRWToken
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

  const {
    args: [storeIdArg],
  } = parsedArgs;

  let storeId = storeIdArg;
  if (!storeId && rwToken.success) {
    const [, , , id] = rwToken.token.split('_');

    storeId = `store_${id}`;
  }

  if (!storeId) {
    storeId = await client.input.text({
      message: 'Enter the ID of the blob store you want to get info about',
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

    const store = await client.fetch<{ store: StoreDetails }>(
      `/v1/storage/stores/${storeId}`,
      {
        method: 'GET',
        accountId: link.status === 'linked' ? link.org.id : undefined,
      }
    );

    const teamSlug = link.status === 'linked' ? link.org.slug : undefined;
    output.print(formatStoreDetails(store.store, teamSlug));
  } catch (err) {
    printError(err);
    return 1;
  }

  output.stopSpinner();

  return 0;
}
