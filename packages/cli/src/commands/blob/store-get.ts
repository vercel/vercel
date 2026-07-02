import output from '../../output-manager';
import { getStoreIdFromAuth, type BlobRWToken } from '../../util/blob/token';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getLinkedProject } from '../../util/projects/link';
import getScope from '../../util/get-scope';
import { getStoreInfoSubcommand } from './command';
import { BlobGetStoreTelemetryClient } from '../../util/telemetry/commands/blob/store-get';
import {
  formatStoreDetails,
  type StoreDetails,
} from '../../util/blob/format-store';
import {
  outputAgentError,
  buildCommandWithGlobalFlags,
} from '../../util/agent-output';

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

  const flagsSpecification = getFlagsSpecification(
    getStoreInfoSubcommand.options
  );

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

  const interactive = client.stdin.isTTY && !client.nonInteractive;

  let storeId: string | undefined = storeIdArg;
  if (!storeId) {
    storeId = getStoreIdFromAuth(rwToken) ?? undefined;
  }

  if (!storeId) {
    if (interactive) {
      storeId = await client.input.text({
        message: 'Enter the ID of the blob store you want to get info about',
        validate: value => {
          if (value.length !== 22) {
            return 'ID must be 22 characters long';
          }
          return true;
        },
      });
    } else {
      outputAgentError(client, {
        status: 'error',
        reason: 'missing_arguments',
        message: 'Missing required argument: storeId.',
        next: [
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              'blob get-store <storeId>'
            ),
            when: 'get the blob store details',
          },
        ],
      });
      output.error('Missing required argument: storeId');
      return 1;
    }
  }

  telemetryClient.trackCliArgumentStoreId(storeId);

  try {
    const link = await getLinkedProject(client);

    output.debug('Getting blob store');

    output.spinner('Getting blob store');

    const accountId = link.status === 'linked' ? link.org.id : undefined;

    const store = await client.fetch<{ store: StoreDetails }>(
      `/v1/storage/stores/${storeId}`,
      {
        method: 'GET',
        accountId,
      }
    );

    let teamSlug = link.status === 'linked' ? link.org.slug : undefined;
    if (!teamSlug) {
      const { team } = await getScope(client);
      teamSlug = team?.slug;
    }
    output.print(formatStoreDetails(store.store, teamSlug));
  } catch (err) {
    printError(err);
    return 1;
  }

  output.stopSpinner();

  return 0;
}
