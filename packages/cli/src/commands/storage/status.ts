import chalk from 'chalk';
import output from '../../output-manager';
import { AGENT_REASON } from '../../util/agent-output-constants';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import { validateJsonOutput } from '../../util/output-format';
import table from '../../util/output/table';
import { getCommandName } from '../../util/pkg-name';
import {
  describeStorageAuth,
  inferConnectionAuth,
  type EffectiveStorageAuth,
} from '../../util/storage/auth';
import {
  getConnections,
  getStorageStores,
  storeProductLabel,
  type StorageConnection,
  type StorageStore,
} from '../../util/storage/store';
import { StorageStatusTelemetryClient } from '../../util/telemetry/commands/storage/status';
import { statusSubcommand } from './command';
import { failWith, resolveStorageScope, resolveStorageStore } from './shared';

interface StatusConnection {
  id: string;
  project: { id: string; name: string };
  environments: string[];
  envVarPrefix: string | null;
  auth: EffectiveStorageAuth | 'unknown';
  environmentVariables: string[] | null;
}

interface StatusStore {
  id: string;
  name: string;
  type: string;
  product: string;
  status: string | null;
  connections: StatusConnection[];
}

export async function status(client: Client, argv: string[]): Promise<number> {
  const telemetry = new StorageStatusTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  const flagsSpecification = getFlagsSpecification(statusSubcommand.options);
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
  const all = flags['--all'] ?? false;
  const storeIdentifier = args[0];

  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagJson(flags['--json']);
  telemetry.trackCliFlagAll(all);
  telemetry.trackCliOptionProject(flags['--project']);
  telemetry.trackCliArgumentStore(storeIdentifier);

  if (args.length > 1) {
    return failWith(client, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: 'Too many arguments. Usage: `vercel storage status [store]`.',
    });
  }

  if (all && flags['--project']) {
    return failWith(client, {
      reason: AGENT_REASON.INVALID_ARGUMENTS,
      message: '--all and --project cannot be combined.',
    });
  }

  // `--all` and a named store are scope-wide reads, so they don't need a
  // linked project. A bare `status` is reported through one project's lens.
  const needsProject =
    Boolean(flags['--project']) || (!all && !storeIdentifier);
  let accountId: string | undefined;
  let project: { id: string; name: string } | undefined;

  if (needsProject) {
    const scope = await resolveStorageScope(client, flags['--project']);
    if (typeof scope === 'number') {
      return scope;
    }
    accountId = scope.accountId;
    project = scope.project;
  } else {
    // Resolving the scope also normalizes `currentTeam` (e.g. a Northstar
    // user's default team), which is what scopes the store lookup.
    const { team } = await getScope(client);
    client.config.currentTeam = team?.id;
    accountId = team?.id;
  }

  let stores: StorageStore[];
  if (storeIdentifier) {
    const store = await resolveStorageStore(client, storeIdentifier, accountId);
    if (typeof store === 'number') {
      return store;
    }
    stores = [store];
  } else {
    output.spinner('Retrieving storage resources…', 500);
    try {
      stores = await getStorageStores(client, { accountId });
    } catch (error) {
      output.stopSpinner();
      printError(error);
      return 1;
    }
    output.stopSpinner();
  }

  // Without a resolved project there is nothing to narrow by, so a named store
  // shows every project it touches.
  const scopedProjectId = project?.id;

  const summaries = stores
    .map(store => summarizeStore(store, scopedProjectId))
    .filter(
      summary => all || storeIdentifier || summary.connections.length > 0
    );

  if (asJson) {
    client.stdout.write(`${JSON.stringify({ stores: summaries }, null, 2)}\n`);
    return 0;
  }

  if (summaries.length === 0) {
    output.log(
      project
        ? `No storage resources are connected to ${chalk.bold(project.name)}. Use ${getCommandName('storage status --all')} to list every resource in this scope.`
        : 'No storage resources found in this scope.'
    );
    return 0;
  }

  printStatusTable(summaries);
  return 0;
}

function summarizeStore(
  store: StorageStore,
  projectId: string | undefined
): StatusStore {
  const connections = getConnections(store).filter(
    connection => !projectId || connection.projectId === projectId
  );

  return {
    id: store.id,
    name: store.name,
    type: store.type ?? 'unknown',
    product: storeProductLabel(store),
    status: store.status ?? null,
    connections: connections.map(connection =>
      summarizeConnection(store, connection)
    ),
  };
}

function summarizeConnection(
  store: StorageStore,
  connection: StorageConnection
): StatusConnection {
  return {
    id: connection.id,
    project: { id: connection.projectId, name: connection.name },
    environments: connection.environments,
    envVarPrefix: connection.envVarPrefix ?? null,
    auth: inferConnectionAuth(store, connection.environmentVariables),
    environmentVariables: connection.environmentVariables ?? null,
  };
}

function formatAuthCell(connection: StatusConnection): string {
  if (connection.auth === 'unknown') {
    return chalk.dim('unknown');
  }
  return describeStorageAuth({
    effective: connection.auth,
    readWriteToken: (connection.environmentVariables ?? []).some(name =>
      name.endsWith('_READ_WRITE_TOKEN')
    ),
  });
}

function printStatusTable(summaries: StatusStore[]): void {
  const rows: string[][] = [
    [
      'Store',
      'Product',
      'Project',
      'Environments',
      'Credentials',
      'Env vars',
    ].map(header => chalk.bold(chalk.cyan(header))),
  ];

  for (const store of summaries) {
    if (store.connections.length === 0) {
      rows.push([
        store.name,
        store.product,
        chalk.dim('not connected'),
        chalk.dim('–'),
        chalk.dim('–'),
        chalk.dim('–'),
      ]);
      continue;
    }

    for (const [index, connection] of store.connections.entries()) {
      rows.push([
        index === 0 ? store.name : '',
        index === 0 ? store.product : '',
        connection.project.name,
        connection.environments.join(', '),
        formatAuthCell(connection),
        connection.environmentVariables?.length
          ? connection.environmentVariables.join(', ')
          : chalk.dim('–'),
      ]);
    }
  }

  output.print(`${table(rows, { hsep: 3 }).replace(/^/gm, '  ')}\n\n`);
}
