import bytes from 'bytes';
import chalk from 'chalk';
import ms from 'ms';
import title from 'title';
import output from '../../output-manager';
import type Client from '../../util/client';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import getScope from '../../util/get-scope';
import table from '../../util/output/table';
import { listStoreSubcommand } from './command';
import { BlobStoreListTelemetryClient } from '../../util/telemetry/commands/blob/store-list';

interface ProjectMetadata {
  projectId: string;
  name: string;
}

interface BlobStore {
  id: string;
  name: string;
  type: string;
  createdAt: number;
  updatedAt: number | null;
  billingState: string;
  status: string | null;
  size: number;
  count: number;
  region?: string;
  projectsMetadata: ProjectMetadata[];
}

interface ListStoresResponse {
  stores: BlobStore[];
}

interface StoreJson {
  id: string;
  name: string;
  region: string | undefined;
  size: number;
  count: number;
  billingState: string;
  status: string | null;
  createdAt: number;
  updatedAt: number | null;
  projects: Array<{ id: string; name: string }>;
}

export default async function listStores(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetryClient = new BlobStoreListTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(listStoreSubcommand.options);

  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const { args, flags } = parsedArgs;

  // Validate no extra arguments
  if (args.length > 0) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan('vercel blob store list')}`
    );
    return 1;
  }

  const jsonOutput = flags['--json'] ?? false;
  const noProjects = flags['--no-projects'] ?? false;

  telemetryClient.trackCliFlagJson(jsonOutput);
  telemetryClient.trackCliFlagNoProjects(noProjects);

  try {
    const { contextName, team } = await getScope(client);

    output.debug('Fetching blob stores');
    output.spinner(`Fetching blob stores in ${chalk.bold(contextName)}`);

    const response = await client.fetch<ListStoresResponse>(
      '/v1/storage/stores',
      {
        method: 'GET',
        accountId: team?.id,
      }
    );

    output.stopSpinner();

    // Filter to only show blob stores
    const blobStores = response.stores.filter(
      (store): store is BlobStore => store.type === 'blob'
    );

    if (blobStores.length === 0 && !jsonOutput){
        output.log(`No blob stores found in ${chalk.bold(contextName)}.`);
      }
      return 0;
    }

    if (jsonOutput) {
      outputJson(client, blobStores);
    } else {
      outputTable(blobStores, contextName, noProjects);
    }

    return 0;
  } catch (err) {
    printError(err);
    return 1;
  }
}

function outputJson(client: Client, stores: BlobStore[]) {
  const jsonOutput: { stores: StoreJson[] } = {
    stores: stores.map(store => ({
      id: store.id,
      name: store.name,
      region: store.region,
      size: store.size,
      count: store.count,
      billingState: store.billingState,
      status: store.status,
      createdAt: store.createdAt,
      updatedAt: store.updatedAt,
      projects: store.projectsMetadata.map(p => ({
        id: p.projectId,
        name: p.name,
      })),
    })),
  };
  client.stdout.write(`${JSON.stringify(jsonOutput, null, 2)}\n`);
}

function outputTable(
  stores: BlobStore[],
  contextName: string,
  noProjects: boolean
) {
  output.log(`Blob stores in ${chalk.bold(contextName)}:`);

  const headers = noProjects
    ? ['Name', 'ID', 'Status', 'Region', 'Size', 'Files', 'Age']
    : ['Name', 'ID', 'Status', 'Region', 'Size', 'Files', 'Projects', 'Age'];

  const rows = stores.map(store => {
    const age = ms(Date.now() - store.createdAt);
    const baseRow = [
      store.name,
      chalk.dim(store.id),
      formatStatus(store.billingState),
      store.region || '-',
      bytes(store.size) || '0B',
      formatCount(store.count),
    ];

    if (noProjects) {
      return [...baseRow, age];
    }

    return [...baseRow, formatProjects(store.projectsMetadata), age];
  });

  const tablePrint = table(
    [headers.map(header => chalk.bold(chalk.cyan(header))), ...rows],
    { hsep: 3 }
  ).replace(/^/gm, '  ');

  output.print(`\n${tablePrint}\n\n`);
}

function formatStatus(billingState: string): string {
  const CIRCLE = '● ';
  const statusText = title(billingState);

  if (billingState === 'active') {
    return chalk.green(CIRCLE) + statusText;
  }
  return chalk.yellow(CIRCLE) + statusText;
}

function formatProjects(projects: ProjectMetadata[]): string {
  if (projects.length === 0) {
    return chalk.gray('–');
  }
  if (projects.length === 1) {
    return projects[0].name;
  }
  if (projects.length === 2) {
    return `${projects[0].name}, ${projects[1].name}`;
  }
  return `${projects[0].name}, ${projects[1].name} (+${projects.length - 2})`;
}

function formatCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}
