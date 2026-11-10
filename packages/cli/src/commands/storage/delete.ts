import chalk from 'chalk';
import output from '../../output-manager';
import {
  buildCommandWithGlobalFlags,
  outputActionRequired,
} from '../../util/agent-output';
import {
  AGENT_ACTION,
  AGENT_REASON,
  AGENT_STATUS,
} from '../../util/agent-output-constants';
import { canPrompt } from '../../util/can-prompt';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { getCommandName, getCommandNamePlain } from '../../util/pkg-name';
import {
  getStorageProvider,
  loadStoreDetails,
} from '../../util/storage/providers';
import {
  getConnections,
  storeProductLabel,
  type StorageStore,
} from '../../util/storage/store';
import { StorageDeleteTelemetryClient } from '../../util/telemetry/commands/storage/delete';
import { deleteSubcommand } from './command';
import { failWith, resolveStorageAccount, resolveStorageStore } from './shared';

export async function deleteStore(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new StorageDeleteTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const flagsSpecification = getFlagsSpecification(deleteSubcommand.options);
  let parsedArguments;
  try {
    parsedArguments = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }

  const { args, flags } = parsedArguments;
  telemetry.trackCliArgumentStore(args[0]);
  telemetry.trackCliOptionType(flags['--type']);

  if (args.length < 1) {
    return failWith(client, {
      reason: AGENT_REASON.MISSING_ARGUMENTS,
      message: 'You must specify a storage resource. See `--help` for details.',
      next: [
        {
          command: getCommandNamePlain('storage list'),
          when: 'list the storage resources in this scope',
        },
      ],
    });
  }
  if (args.length > 1) {
    return failWith(client, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message:
        'Too many arguments. Usage: `vercel storage delete <store> [--type <type>]`.',
    });
  }

  const account = await resolveStorageAccount(client);
  if (typeof account === 'number') {
    return account;
  }

  const resolved = await resolveStorageStore(
    client,
    args[0],
    account.accountId,
    { type: flags['--type'] }
  );
  if (typeof resolved === 'number') {
    return resolved;
  }

  const provider = getStorageProvider(resolved.type);
  if (!provider) {
    // Marketplace resources have their own lifecycle commands, which also
    // handle billing and provider-side cleanup.
    if (resolved.type === 'integration') {
      return failWith(client, {
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: `${resolved.name} is a Marketplace resource (${storeProductLabel(resolved)}). Use \`vercel integration resource delete\` to delete it.`,
        next: [
          {
            command: getCommandNamePlain(
              `integration resource delete ${resolved.name}`
            ),
            when: 'delete the Marketplace resource',
          },
        ],
      });
    }
    return failWith(client, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: `${storeProductLabel(resolved)} stores cannot be deleted with the CLI yet. Delete ${resolved.name} from the Vercel dashboard instead.`,
    });
  }

  // Deleting a store cannot be undone and drops every project connection with
  // it, so — like `storage disconnect` — it always requires interactive
  // confirmation and cannot be scripted or run by agents. The store is
  // resolved first so not-found, Marketplace, and unsupported types report
  // their own errors instead of asking for confirmation.
  if (!canPrompt(client)) {
    const commandTail = [
      `storage delete ${args[0]}`,
      flags['--type'] ? `--type ${flags['--type']}` : undefined,
    ]
      .filter(Boolean)
      .join(' ');
    outputActionRequired(
      client,
      {
        status: AGENT_STATUS.ACTION_REQUIRED,
        reason: AGENT_REASON.INTERACTIVE_CONFIRMATION_REQUIRED,
        action: AGENT_ACTION.CONFIRMATION_REQUIRED,
        message:
          'Deleting a storage resource cannot be undone, removes its project connections, and requires interactive confirmation. ' +
          'Agents must not make this change on behalf of a user.',
        userActionRequired: true,
        hint: 'A human must run the first command in next[] in an interactive terminal.',
        next: [
          {
            command: buildCommandWithGlobalFlags(client.argv, commandTail),
            when: 'Review the store and confirm in a terminal',
          },
          {
            command: buildCommandWithGlobalFlags(
              client.argv,
              `storage inspect ${args[0]} --json`
            ),
            when: 'Inspect the store and its connections first',
          },
        ],
      },
      1
    );
    output.error(
      'Confirmation required. Deleting a storage resource cannot be undone and must be confirmed in an interactive terminal.'
    );
    return 1;
  }

  // Re-read so the preview shows every connection, not the list snapshot.
  let store: StorageStore;
  output.spinner('Retrieving storage resource…', 500);
  try {
    store = await loadStoreDetails(client, resolved, account.accountId);
  } catch (error) {
    output.stopSpinner();
    printError(error);
    return 1;
  }
  output.stopSpinner();

  const connections = getConnections(store);
  const projectNames = [
    ...new Set(connections.map(connection => connection.name)),
  ];

  printAlignedLabel('Store', store.name);
  printAlignedLabel('ID', store.id);
  printAlignedLabel('Type', provider.label);
  printAlignedLabel(
    'Projects',
    projectNames.length ? projectNames.join(', ') : chalk.dim('not connected')
  );
  output.print('\n');

  const consequence = projectNames.length
    ? ` This disconnects it from ${projectNames.length} ${projectNames.length === 1 ? 'project' : 'projects'} and removes their environment variables.`
    : '';
  const confirmed = await client.input.confirm(
    `Delete ${chalk.bold(store.name)}?${consequence} This cannot be undone.`,
    false
  );
  if (!confirmed) {
    output.log('Canceled');
    return 0;
  }

  output.spinner(`Deleting ${provider.label} store…`, 500);
  try {
    await provider.delete(client, { store, accountId: account.accountId });
  } catch (error) {
    output.stopSpinner();
    return failWith(client, {
      reason: AGENT_REASON.API_ERROR,
      message: `Failed to delete the store: ${(error as Error).message}`,
    });
  }
  output.stopSpinner();

  printAlignedLabel('Deleted', store.name, { gutter: '✓' });
  if (projectNames.length) {
    printAlignedLabel('Disconnected', projectNames.join(', '));
    output.print('\n');
    output.log(
      `Run ${chalk.cyan(getCommandName('env pull'))} in the affected projects to refresh their local environment files.`
    );
  }
  return 0;
}
