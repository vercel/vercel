import chalk from 'chalk';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import formatDate from '../../util/format-date';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { validateJsonOutput } from '../../util/output-format';
import { printAlignedLabel } from '../../util/output/print-aligned-label';
import { getCommandNamePlain } from '../../util/pkg-name';
import {
  getStorageProvider,
  loadStoreDetails,
  storeTypeName,
} from '../../util/storage/providers';
import {
  getConnections,
  storeProductLabel,
  type StorageStore,
} from '../../util/storage/store';
import { StorageGetTelemetryClient } from '../../util/telemetry/commands/storage/get';
import { getSubcommand } from './command';
import {
  failWith,
  labelFor,
  resolveStorageAccount,
  resolveStorageStore,
} from './shared';

/** The document `storage inspect --json` writes to stdout. */
export interface StorageGetResult {
  id: string;
  name: string;
  type: string;
  product: string;
  status: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  dashboardUrl: string | null;
  details: Record<string, string | number | boolean | null>;
  connections: Array<{
    id: string;
    project: { id: string; name: string };
    environments: string[];
  }>;
}

export async function get(client: Client, argv: string[]): Promise<number> {
  const telemetry = new StorageGetTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const flagsSpecification = getFlagsSpecification(getSubcommand.options);
  let parsedArguments;
  try {
    parsedArguments = parseArguments(argv, flagsSpecification);
  } catch (error) {
    printError(error);
    return 2;
  }

  const { args, flags } = parsedArguments;

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 2;
  }
  const asJson = formatResult.jsonOutput;

  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);
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
        'Too many arguments. Usage: `vercel storage inspect <store> [--type <type>]`.',
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

  let store: StorageStore;
  let details: Record<string, string | number | boolean | null> = {};
  output.spinner('Retrieving storage resource…', 500);
  try {
    store = await loadStoreDetails(client, resolved, account.accountId);
    const provider = getStorageProvider(store.type);
    if (provider) {
      details = await provider.describe(client, {
        store,
        accountId: account.accountId,
      });
    }
  } catch (error) {
    output.stopSpinner();
    printError(error);
    return 1;
  }
  output.stopSpinner();

  const result = summarizeStore(store, details, account.teamSlug);

  if (asJson) {
    client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  printDetails(result);
  return 0;
}

function summarizeStore(
  store: StorageStore,
  details: Record<string, string | number | boolean | null>,
  teamSlug: string | undefined
): StorageGetResult {
  const raw = store as StorageStore & {
    createdAt?: number;
    updatedAt?: number;
  };
  return {
    id: store.id,
    name: store.name,
    type: storeTypeName(store),
    product: storeProductLabel(store),
    status: store.status ?? null,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
    dashboardUrl: teamSlug
      ? `https://vercel.com/${teamSlug}/~/stores/${encodeURIComponent(store.type ?? 'unknown')}/${encodeURIComponent(store.id)}`
      : null,
    details,
    connections: getConnections(store).map(connection => ({
      id: connection.id,
      project: { id: connection.projectId, name: connection.name },
      environments: connection.environments,
    })),
  };
}

function printDetails(result: StorageGetResult): void {
  printAlignedLabel('Store', result.name);
  printAlignedLabel('ID', result.id);
  printAlignedLabel('Type', result.product);
  if (result.status) {
    printAlignedLabel('Status', result.status);
  }
  for (const [key, value] of Object.entries(result.details)) {
    if (value !== null && value !== '') {
      printAlignedLabel(labelFor(key), String(value));
    }
  }
  if (result.createdAt) {
    printAlignedLabel('Created', formatDate(result.createdAt));
  }
  if (result.updatedAt) {
    printAlignedLabel('Updated', formatDate(result.updatedAt));
  }
  if (result.dashboardUrl) {
    printAlignedLabel(
      'Dashboard',
      output.link(result.dashboardUrl, result.dashboardUrl) ||
        result.dashboardUrl
    );
  }
  printAlignedLabel(
    'Projects',
    result.connections.length
      ? result.connections
          .map(
            connection =>
              `${connection.project.name} (${connection.environments.join(', ')})`
          )
          .join(', ')
      : chalk.dim('not connected')
  );
  output.print('\n');
}
