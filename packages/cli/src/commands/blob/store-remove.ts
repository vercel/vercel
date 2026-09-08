import type Client from '../../util/client';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { deleteStoreSubcommand } from './command';
import { parseArguments } from '../../util/get-args';
import { getLinkedProject } from '../../util/projects/link';
import { getStoreIdFromAuth, type BlobRWToken } from '../../util/blob/token';
import { envPullCommandLogic } from '../env/pull';
import {
  formatStoreLabel,
  formatConnectedProjects,
} from '../../util/blob/confirm';
import {
  outputAgentError,
  buildCommandWithGlobalFlags,
} from '../../util/agent-output';

export default async function removeStore(
  client: Client,
  argv: string[],
  rwToken: BlobRWToken
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(
    deleteStoreSubcommand.options
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

  // Deleting a store cannot be undone, so it always requires
  // interactive confirmation and cannot be scripted or run by agents
  if (!interactive) {
    outputAgentError(client, {
      status: 'error',
      reason: 'dangerous_operation_requires_user',
      message:
        'Deleting a blob store cannot be undone and cannot be performed non-interactively. ' +
        'Agents must not make this change on behalf of a user. ' +
        'The user must run this command interactively in a terminal to review the impact and confirm.',
      next: [
        {
          command: buildCommandWithGlobalFlags(
            client.argv,
            'blob delete-store <storeId>'
          ),
          when: 'user runs this command interactively',
        },
      ],
    });
    output.error(
      'Deleting a blob store requires interactive confirmation. Run this command in an interactive terminal.'
    );
    return 1;
  }

  let storeId: string | undefined = storeIdArg;

  if (!storeId) {
    storeId = getStoreIdFromAuth(rwToken) ?? undefined;
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

  const link = await getLinkedProject(client);
  const accountId = link.status === 'linked' ? link.org.id : undefined;

  try {
    const [store, connectionsResponse] = await Promise.all([
      client.fetch<{ store: { id: string; name: string } }>(
        `/v1/storage/stores/${storeId}`,
        {
          method: 'GET',
          accountId,
        }
      ),
      client.fetch<{
        connections: { project: { name: string } }[];
      }>(`/v1/storage/stores/${storeId}/connections`, {
        method: 'GET',
        accountId,
      }),
    ]);

    const label = formatStoreLabel(store.store.name, store.store.id);
    const projectsInfo = formatConnectedProjects(
      connectionsResponse.connections
    );

    const res = await client.input.confirm(
      `Are you sure you want to remove ${label}?${projectsInfo} This action cannot be undone.`,
      false
    );

    if (!res) {
      output.success('Blob store not removed');
      return 0;
    }

    output.debug('Deleting blob store');

    output.spinner('Deleting blob store');

    // Remove all project connections first so that
    // BLOB_READ_WRITE_TOKEN env variables are cleaned up
    await client.fetch(`/v1/storage/stores/${storeId}/connections`, {
      method: 'DELETE',
      accountId,
    });

    await client.fetch<{ store: { id: string } }>(
      `/v1/storage/stores/blob/${storeId}`,
      {
        method: 'DELETE',
        accountId,
      }
    );
  } catch (err) {
    printError(err);
    return 1;
  }

  output.stopSpinner();

  output.success('Blob store deleted');

  if (link.status === 'linked') {
    client.config.currentTeam =
      link.org.type === 'team' ? link.org.id : undefined;

    await envPullCommandLogic(
      client,
      '.env.local',
      true,
      'development',
      link,
      undefined,
      client.cwd,
      'vercel-cli:blob:store-remove'
    );
  }

  return 0;
}
