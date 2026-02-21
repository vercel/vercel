import type Client from '../../util/client';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { emptyStoreSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import * as blob from '@vercel/blob';
import type { BlobRWToken } from '../../util/blob/token';
import { BlobEmptyStoreTelemetryClient } from '../../util/telemetry/commands/blob/store-empty';
import { getLinkedProject } from '../../util/projects/link';
import {
  formatStoreLabel,
  formatConnectedProjects,
} from '../../util/blob/confirm';

export default async function emptyStore(
  client: Client,
  argv: string[],
  rwToken: string,
  fullToken: BlobRWToken
): Promise<number> {
  const telemetryClient = new BlobEmptyStoreTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(
    emptyStoreSubcommand.options
  );

  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const {
    flags: { '--yes': yes },
  } = parsedArgs;

  telemetryClient.trackCliFlagYes(yes);

  if (!fullToken.success) {
    printError(fullToken.error);
    return 1;
  }

  const [, , , id] = fullToken.token.split('_');
  const storeId = `store_${id}`;

  try {
    const link = await getLinkedProject(client);
    const accountId = link.status === 'linked' ? link.org.id : undefined;

    const [storeResponse, connectionsResponse, initialList] = await Promise.all(
      [
        client.fetch<{ store: { name: string } }>(
          `/v1/storage/stores/${storeId}`,
          { method: 'GET', accountId }
        ),
        client.fetch<{
          connections: { project: { name: string } }[];
        }>(`/v1/storage/stores/${storeId}/connections`, {
          method: 'GET',
          accountId,
        }),
        blob.list({ token: rwToken, limit: 1 }),
      ]
    );

    const { name } = storeResponse.store;
    const { connections } = connectionsResponse;

    if (initialList.blobs.length === 0) {
      output.log('Store is already empty');
      return 0;
    }

    const label = formatStoreLabel(name, storeId);
    const projectsInfo = formatConnectedProjects(connections);
    const message = `Are you sure you want to delete all files in ${label}?${projectsInfo} This action cannot be undone.`;

    if (!yes) {
      if (!client.stdin.isTTY) {
        output.error(
          'Missing --yes flag. This is a destructive operation, use --yes to confirm.'
        );
        return 1;
      }

      const confirmed = await client.input.confirm(message, false);
      if (!confirmed) {
        output.log('Canceled');
        return 0;
      }
    }

    let totalDeleted = 0;
    let hasMore = true;

    while (hasMore) {
      output.spinner(`Deleting blobs... (${totalDeleted} deleted)`);

      const listResult = await blob.list({
        token: rwToken,
        limit: 1000,
      });

      if (listResult.blobs.length === 0) {
        hasMore = false;
        break;
      }

      const urls = listResult.blobs.map(b => b.url);
      await blob.del(urls, { token: rwToken });
      totalDeleted += urls.length;
    }

    output.stopSpinner();
    output.success(`All blobs deleted (${totalDeleted} total)`);

    return 0;
  } catch (err) {
    printError(err);
    return 1;
  }
}
