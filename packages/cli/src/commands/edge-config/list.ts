import { gray } from 'chalk';
import type {
  CustomEnvironment,
  ProjectEnvTarget,
  ProjectEnvVariable,
} from '@vercel-internals/types';
import type Client from '../../util/client';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { validateJsonOutput } from '../../util/output-format';
import { validateLsArgs } from '../../util/validate-ls-args';
import { exitWithNonInteractiveError } from '../../util/agent-output';
import getScope from '../../util/get-scope';
import stamp from '../../util/output/stamp';
import table from '../../util/output/table';
import output from '../../output-manager';
import { EdgeConfigLsTelemetryClient } from '../../util/telemetry/commands/edge-config/ls';
import { listSubcommand } from './command';
import type { EdgeConfigListEntry } from './resolve-edge-config-id';
import { getLinkedProject } from '../../util/projects/link';
import { getCustomEnvironments } from '../../util/target/get-custom-environments';
import formatEnvironments from '../../util/env/format-environments';
import { formatProject } from '../../util/projects/format-project';
import { getCommandName } from '../../util/pkg-name';

type EdgeConfigRow = EdgeConfigListEntry & {
  itemCount?: number;
  sizeInBytes?: number;
  updatedAt?: number;
  digest?: string;
};

type StorageStoresResponse = {
  stores: StorageEdgeConfigStore[];
};

type StorageEdgeConfigStore = {
  type: string;
  id: string;
  slug?: string;
  projectsMetadata: Array<{
    projectId: string;
    environmentVariables: string[];
    environments: ProjectEnvTarget[];
  }>;
};

export default async function listCmd(
  client: Client,
  argv: string[]
): Promise<number> {
  const telemetry = new EdgeConfigLsTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      argv,
      getFlagsSpecification(listSubcommand.options)
    );
  } catch (error) {
    if (client.nonInteractive) {
      exitWithNonInteractiveError(client, error, 1, { variant: 'edge-config' });
    }
    printError(error);
    return 1;
  }

  const { args, flags } = parsedArgs;
  const lsCheck = validateLsArgs({
    commandName: 'edge-config list',
    args,
    maxArgs: 0,
    exitCode: 2,
  });
  if (lsCheck !== 0) {
    return lsCheck;
  }

  const formatResult = validateJsonOutput(flags);
  if (!formatResult.valid) {
    output.error(formatResult.error);
    return 1;
  }
  const asJson = formatResult.jsonOutput;
  telemetry.trackCliOptionFormat(flags['--format']);
  telemetry.trackCliFlagLinked(flags['--linked']);

  if (flags['--linked']) {
    return listLinkedEdgeConfigs(client, asJson);
  }

  const listStamp = stamp();

  let rows: EdgeConfigRow[];
  try {
    rows = await client.fetch<EdgeConfigRow[]>('/v1/edge-config');
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'edge-config' });
    printError(err);
    return 1;
  }

  if (asJson) {
    client.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return 0;
  }

  const { contextName } = await getScope(client);
  output.print(
    `${gray(`${rows.length} Edge Config${rows.length === 1 ? '' : 's'} found under ${contextName} ${listStamp()}`)}\n`
  );

  if (rows.length === 0) {
    return 0;
  }

  const tableRows = [
    ['id', 'slug', 'items', 'size', 'updated'].map(h => gray(h)),
    ...rows.map(r => [
      r.id,
      r.slug,
      String(r.itemCount ?? ''),
      String(r.sizeInBytes ?? ''),
      r.updatedAt != null ? new Date(r.updatedAt).toISOString() : '',
    ]),
  ];
  client.stderr.write(`${table(tableRows, { hsep: 2 })}\n`);
  return 0;
}

type LinkedRow = {
  envKey: string;
  edgeConfigId: string;
  slug: string;
  environments: string;
};

function syntheticEnvForFormat(
  envKey: string,
  environments: ProjectEnvTarget[]
): ProjectEnvVariable {
  return {
    id: '',
    key: envKey,
    type: 'plain',
    value: '',
    target:
      environments.length === 0
        ? undefined
        : environments.length === 1
          ? environments[0]
          : environments,
    configurationId: null,
  };
}

async function listLinkedEdgeConfigs(
  client: Client,
  asJson: boolean
): Promise<number> {
  const link = await getLinkedProject(client);
  if (link.status === 'error') {
    return link.exitCode;
  }
  if (link.status === 'not_linked') {
    output.error(
      `Your codebase isn’t linked to a project. Run ${getCommandName('link')} to use ${getCommandName('edge-config list --linked')}.`
    );
    return 1;
  }

  client.config.currentTeam =
    link.org.type === 'team' ? link.org.id : undefined;

  const linkedStamp = stamp();

  let storageBody: StorageStoresResponse;
  let customEnvs: CustomEnvironment[];

  try {
    [storageBody, customEnvs] = await Promise.all([
      client.fetch<StorageStoresResponse>('/v1/storage/stores'),
      getCustomEnvironments(client, link.project.id),
    ]);
  } catch (err: unknown) {
    exitWithNonInteractiveError(client, err, 1, { variant: 'edge-config' });
    printError(err);
    return 1;
  }

  const projectId = link.project.id;
  const edgeStores = storageBody.stores.filter(
    (s): s is StorageEdgeConfigStore =>
      s.type === 'edge-config' && Array.isArray(s.projectsMetadata)
  );

  const linkedRows: LinkedRow[] = [];
  for (const store of edgeStores) {
    for (const pm of store.projectsMetadata) {
      if (pm.projectId !== projectId) {
        continue;
      }
      for (const envKey of pm.environmentVariables) {
        linkedRows.push({
          envKey,
          edgeConfigId: store.id,
          slug: store.slug ?? '',
          environments: formatEnvironments(
            link,
            syntheticEnvForFormat(envKey, pm.environments),
            customEnvs
          ),
        });
      }
    }
  }

  if (asJson) {
    client.stdout.write(
      `${JSON.stringify(
        linkedRows.map(r => ({
          envKey: r.envKey,
          edgeConfigId: r.edgeConfigId,
          slug: r.slug || undefined,
          environments: r.environments,
        })),
        null,
        2
      )}\n`
    );
    return 0;
  }

  const projectSlugLink = formatProject(link.org.slug, link.project.name);
  output.print(
    `${gray(`Edge Config references in ${projectSlugLink} env vars ${linkedStamp()}`)}\n`
  );

  if (linkedRows.length === 0) {
    output.print(
      `${gray(
        'No Edge Config stores connected to this project. Connect one in the project’s Edge Config settings.'
      )}\n`
    );
    return 0;
  }

  const tableRows = [
    ['env', 'id', 'slug', 'environments'].map(h => gray(h)),
    ...linkedRows.map(r => [
      r.envKey,
      r.edgeConfigId,
      r.slug || gray('—'),
      r.environments,
    ]),
  ];
  client.stderr.write(`${table(tableRows, { hsep: 2 })}\n`);
  return 0;
}
