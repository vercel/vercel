import chalk from 'chalk';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { validateJsonOutput } from '../../util/output-format';
import table from '../../util/output/table';
import { getCommandName } from '../../util/pkg-name';
import {
  getStorageProvider,
  listStorageProviderTypes,
  storeMatchesType,
  storeTypeName,
} from '../../util/storage/providers';
import {
  getConnections,
  getStorageStores,
  storeProductLabel,
  type StorageStore,
} from '../../util/storage/store';
import { StorageListTelemetryClient } from '../../util/telemetry/commands/storage/list';
import { listSubcommand } from './command';
import { failWith, resolveStorageAccount } from './shared';

/** One store as reported by `storage list --json`. */
export interface StorageListEntry {
  id: string;
  name: string;
  type: string;
  product: string;
  status: string | null;
  projects: Array<{ id: string; name: string }>;
}

export async function list(client: Client, argv: string[]): Promise<number> {
  const telemetry = new StorageListTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const flagsSpecification = getFlagsSpecification(listSubcommand.options);
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
  const typeFlag = flags['--type'];

  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);
  telemetry.trackCliOptionType(typeFlag);

  if (args.length > 0) {
    return failWith(client, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message:
        'Too many arguments. Usage: `vercel storage list [--type <type>]`.',
    });
  }

  // `--type` accepts provider names and aliases (e.g. `edge-config`) as well
  // as any raw type the API reports, so Marketplace (`integration`) stays
  // filterable.
  const typeFilter = typeFlag
    ? (getStorageProvider(typeFlag)?.type ?? typeFlag.toLowerCase())
    : undefined;

  const account = await resolveStorageAccount(client);
  if (typeof account === 'number') {
    return account;
  }

  let stores: StorageStore[];
  output.spinner('Retrieving storage resources…', 500);
  try {
    stores = await getStorageStores(client, { accountId: account.accountId });
  } catch (error) {
    output.stopSpinner();
    printError(error);
    return 1;
  }
  output.stopSpinner();

  const entries = stores
    .filter(store => !typeFilter || storeMatchesType(store, typeFilter))
    .map(summarizeStore);

  if (asJson) {
    client.stdout.write(`${JSON.stringify({ stores: entries }, null, 2)}\n`);
    return 0;
  }

  if (entries.length === 0) {
    if (typeFilter) {
      output.log(
        `No storage resources of type ${chalk.bold(typeFilter)} found in this scope. Known types: ${listStorageProviderTypes().join(', ')}.`
      );
    } else {
      output.log(
        `No storage resources found in this scope. Run ${getCommandName('storage create <name> --type <type>')} to create one.`
      );
    }
    return 0;
  }

  printListTable(entries);
  return 0;
}

function summarizeStore(store: StorageStore): StorageListEntry {
  const projects = new Map<string, string>();
  for (const connection of getConnections(store)) {
    projects.set(connection.projectId, connection.name);
  }
  return {
    id: store.id,
    name: store.name,
    type: storeTypeName(store),
    product: storeProductLabel(store),
    status: store.status ?? null,
    projects: [...projects.entries()].map(([id, name]) => ({ id, name })),
  };
}

function printListTable(entries: StorageListEntry[]): void {
  const rows: string[][] = [
    ['Store', 'ID', 'Product', 'Status', 'Projects'].map(header =>
      chalk.bold(chalk.cyan(header))
    ),
  ];

  for (const entry of entries) {
    rows.push([
      entry.name,
      chalk.dim(entry.id),
      entry.product,
      entry.status ?? chalk.dim('–'),
      entry.projects.length
        ? entry.projects.map(project => project.name).join(', ')
        : chalk.dim('not connected'),
    ]);
  }

  output.print(`${table(rows, { hsep: 3 }).replace(/^/gm, '  ')}\n\n`);
}
