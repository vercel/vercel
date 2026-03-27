import chalk from 'chalk';
import output from '../../output-manager';
import type Client from '../client';
import { getLinkedProject } from '../projects/link';
import { connectResourceToProject } from '../integration-resource/connect-resource-to-project';
import { getCommandName } from '../pkg-name';
import { generateDefaultResourceName } from './generate-resource-name';

export interface FirstPartyProvisionOptions {
  cwd?: string;
}

type ProvisionFunction = (
  client: Client,
  options: FirstPartyProvisionOptions
) => Promise<number>;

const FIRST_PARTY_INTEGRATIONS: Record<string, ProvisionFunction> = {
  blob: provisionBlobStore,
};

export function isFirstPartyIntegration(slug: string): boolean {
  return slug in FIRST_PARTY_INTEGRATIONS;
}

export async function provisionFirstPartyIntegration(
  client: Client,
  slug: string,
  options: FirstPartyProvisionOptions = {}
): Promise<number> {
  const handler = FIRST_PARTY_INTEGRATIONS[slug];
  if (!handler) {
    output.error(`Unknown first-party integration: "${slug}"`);
    return 1;
  }
  return handler(client, options);
}

async function provisionBlobStore(
  client: Client,
  _options: FirstPartyProvisionOptions
): Promise<number> {
  const link = await getLinkedProject(client);
  const name = generateDefaultResourceName('blob');

  output.spinner('Creating Blob store...');

  let storeId: string;
  let storeRegion: string | undefined;
  try {
    const res = await client.fetch<{ store: { id: string; region?: string } }>(
      '/v1/storage/stores/blob',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, region: 'iad1', access: 'public' }),
        accountId: link.status === 'linked' ? link.org.id : undefined,
      }
    );

    storeId = res.store.id;
    storeRegion = res.store.region;
  } catch (err) {
    output.stopSpinner();
    output.error(`Failed to create Blob store: ${(err as Error).message}`);
    return 1;
  }

  output.stopSpinner();

  const regionInfo = storeRegion ? ` in ${storeRegion}` : '';
  output.success(`Blob store created: ${chalk.bold(name)}${regionInfo}`);

  if (link.status === 'linked') {
    const environments = ['production', 'preview', 'development'];

    output.spinner(
      `Connecting ${chalk.bold(name)} to ${chalk.bold(link.project.name)}...`
    );

    try {
      await connectResourceToProject(
        client,
        link.project.id,
        storeId,
        environments,
        { accountId: link.org.id }
      );

      output.stopSpinner();
      output.success(
        `Blob store ${chalk.bold(name)} linked to ${chalk.bold(
          link.project.name
        )}. Run ${getCommandName('env pull')} to update your local environment variables.`
      );
    } catch (err) {
      output.stopSpinner();
      output.warn(
        `Blob store created but failed to link to project: ${(err as Error).message}`
      );
    }
  }

  return 0;
}
