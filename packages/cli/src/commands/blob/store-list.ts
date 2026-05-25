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
import { getLinkFromDir, getVercelDirectory } from '../../util/projects/link';
import getProjectByIdOrName from '../../util/projects/get-project-by-id-or-name';
import { ProjectNotFound } from '../../util/errors-ts';
import { listStoresSubcommand } from './command';
import { BlobListStoresTelemetryClient } from '../../util/telemetry/commands/blob/store-list';
import {
  formatStoreDetails,
  type StoreDetails,
} from '../../util/blob/format-store';
import table from '../../util/output/table';

interface ProjectMetadata {
  projectId: string;
  name: string;
  environments?: string[];
}

interface BlobStoreListItem {
  id: string;
  name: string;
  type?: string;
  createdAt?: number;
  updatedAt?: number | null;
  billingState?: string;
  status?: string | null;
  size?: number;
  count?: number;
  region?: string;
  projectsMetadata?: ProjectMetadata[];
}

interface StoreJson {
  id: string;
  name: string;
  region: string | undefined;
  size: number | undefined;
  count: number | undefined;
  billingState: string | undefined;
  status: string | null | undefined;
  createdAt: number | undefined;
  updatedAt: number | null | undefined;
  projects: Array<{ id: string; name: string }>;
}

export default async function listStores(
  client: Client,
  argv: string[]
): Promise<number> {
  const flagsSpecification = getFlagsSpecification(
    listStoresSubcommand.options
  );

  let parsedArgs: ReturnType<typeof parseArguments<typeof flagsSpecification>>;
  try {
    parsedArgs = parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  const showAll = parsedArgs.flags['--all'] ?? false;
  const jsonOutput = parsedArgs.flags['--json'] ?? false;
  const noProjects = parsedArgs.flags['--no-projects'] ?? false;

  const telemetryClient = new BlobListStoresTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });
  telemetryClient.trackCliFlagAll(showAll || undefined);
  telemetryClient.trackCliFlagJson(jsonOutput || undefined);
  telemetryClient.trackCliFlagNoProjects(noProjects || undefined);

  try {
    let accountId: string;
    let teamSlug: string | undefined;
    let linkedProject: { id: string; name: string } | undefined;

    const dirLink = await getLinkFromDir(getVercelDirectory(client.cwd));
    if (dirLink) {
      accountId = dirLink.orgId;
      const project = await getProjectByIdOrName(
        client,
        dirLink.projectId,
        dirLink.orgId
      );
      if (project && !(project instanceof ProjectNotFound) && !showAll) {
        linkedProject = { id: project.id, name: project.name };
      }
    } else {
      const { team } = await getScope(client);
      if (!team) {
        output.error('Team not found.');
        return 1;
      }
      accountId = team.id;
      teamSlug = team.slug;
    }

    output.spinner('Fetching blob stores');

    const response = await client.fetch<{ stores: BlobStoreListItem[] }>(
      '/v1/storage/stores',
      {
        method: 'GET',
        accountId,
      }
    );

    output.stopSpinner();

    let stores = response.stores;

    if (linkedProject) {
      const projectId = linkedProject.id;
      stores = stores.filter(store =>
        store.projectsMetadata?.some(
          metadata => metadata.projectId === projectId
        )
      );
    }

    stores = stores.filter(store => !store.type || store.type === 'blob');

    if (stores.length === 0) {
      if (jsonOutput) {
        client.stdout.write(`${JSON.stringify({ stores: [] }, null, 2)}\n`);
        return 0;
      }
      if (linkedProject) {
        output.log(
          `No blob stores connected to ${chalk.bold(linkedProject.name)}. Use ${chalk.cyan('--all')} to list all team stores.`
        );
      } else {
        output.log('No blob stores found');
      }
      return 0;
    }

    if (jsonOutput) {
      outputJson(client, stores);
      return 0;
    }

    const header = linkedProject
      ? `Blob stores for project ${chalk.bold(linkedProject.name)}:`
      : `Blob stores:`;
    output.log(header);

    if (!client.stdin.isTTY || !client.stdout.isTTY) {
      output.print(
        table(buildTableRows(stores, noProjects), { hsep: 3 }).replace(
          /^/gm,
          '  '
        ) + '\n\n'
      );
      return 0;
    }

    const choices = [
      ...stores.map(store => ({
        name: `${store.name} (${chalk.dim(store.id)})`,
        value: store.id,
      })),
      { name: 'Cancel', value: '' },
    ];

    const selected = await client.input.select<string>({
      message: 'Select a store to view details',
      choices,
      pageSize: 15,
    });

    if (!selected) {
      return 0;
    }

    output.spinner('Fetching store details');

    const storeResponse = await client.fetch<{ store: StoreDetails }>(
      `/v1/storage/stores/${selected}`,
      {
        method: 'GET',
        accountId,
      }
    );

    output.stopSpinner();
    output.print('\n' + formatStoreDetails(storeResponse.store, teamSlug));

    return 0;
  } catch (err) {
    printError(err);
    return 1;
  }
}

function outputJson(client: Client, stores: BlobStoreListItem[]) {
  const json: { stores: StoreJson[] } = {
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
      projects: (store.projectsMetadata ?? []).map(p => ({
        id: p.projectId,
        name: p.name,
      })),
    })),
  };
  client.stdout.write(`${JSON.stringify(json, null, 2)}\n`);
}

function buildTableRows(
  stores: BlobStoreListItem[],
  noProjects: boolean
): string[][] {
  const headers = noProjects
    ? ['Name', 'ID', 'Status', 'Region', 'Size', 'Files', 'Age']
    : ['Name', 'ID', 'Status', 'Region', 'Size', 'Files', 'Projects', 'Age'];

  const rows = stores.map(store => {
    const age =
      store.createdAt !== undefined ? ms(Date.now() - store.createdAt) : '-';
    const baseRow = [
      store.name,
      chalk.dim(store.id),
      formatStatus(store.billingState),
      store.region || '-',
      store.size !== undefined ? bytes(store.size) || '0B' : '-',
      formatCount(store.count),
    ];

    if (!noProjects) {
      baseRow.push(formatProjects(store.projectsMetadata ?? []));
    }
    baseRow.push(age);
    return baseRow;
  });

  return [headers.map(h => chalk.bold(chalk.cyan(h))), ...rows];
}

function formatStatus(billingState: string | undefined): string {
  if (!billingState) {
    return chalk.gray('–');
  }
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

function formatCount(count: number | undefined): string {
  if (count === undefined) {
    return '-';
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}
