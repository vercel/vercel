import chalk from 'chalk';
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

interface StoreListItem {
  id: string;
  name: string;
  projectsMetadata?: {
    projectId: string;
    name: string;
    environments: string[];
  }[];
}

export default async function listStores(
  client: Client,
  argv: string[]
): Promise<number> {
  new BlobListStoresTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  const flagsSpecification = getFlagsSpecification(
    listStoresSubcommand.options
  );

  try {
    parseArguments(argv, flagsSpecification);
  } catch (err) {
    printError(err);
    return 1;
  }

  try {
    // Resolve team and optional project context without interactive prompts.
    // Read the local project link file directly (non-interactive) instead of
    // getLinkedProject which can prompt for project selection in monorepos.
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
      if (project && !(project instanceof ProjectNotFound)) {
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

    const response = await client.fetch<{ stores: StoreListItem[] }>(
      '/v1/storage/stores',
      {
        method: 'GET',
        accountId,
      }
    );

    output.stopSpinner();

    let stores = response.stores;

    // Filter by linked project if applicable
    if (linkedProject) {
      const projectId = linkedProject.id;
      stores = stores.filter(store =>
        store.projectsMetadata?.some(
          metadata => metadata.projectId === projectId
        )
      );
    }

    if (stores.length === 0) {
      output.log('No blob stores found');
      return 0;
    }

    const header = linkedProject
      ? `Blob stores for project ${chalk.bold(linkedProject.name)}:`
      : `Blob stores:`;
    output.log(header);

    // Non-TTY (piped output or non-interactive input): print table and exit
    if (!client.stdin.isTTY || !client.stdout.isTTY) {
      output.print(
        table(
          [
            ['Name', 'Store ID'].map(h => chalk.dim(h)),
            ...stores.map(store => [store.name, store.id]),
          ],
          { hsep: 4 }
        ) + '\n'
      );
      return 0;
    }

    // TTY: interactive select then show details

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
