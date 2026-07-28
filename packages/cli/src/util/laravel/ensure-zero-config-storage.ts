import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import output from '../../output-manager';
import type Client from '../client';
import { connectResourceToProject } from '../integration-resource/connect-resource-to-project';

interface LaravelProject {
  id: string;
  name: string;
}

interface LaravelProjectOwner {
  id: string;
}

interface BlobStore {
  id: string;
  name: string;
  type?: string;
  projectsMetadata?: Array<{ projectId: string }>;
}

function isLaravelApplication(projectPath: string): boolean {
  const artisanPath = path.join(projectPath, 'artisan');
  const composerPath = path.join(projectPath, 'composer.json');

  if (!existsSync(artisanPath) || !existsSync(composerPath)) {
    return false;
  }

  try {
    const composer = JSON.parse(readFileSync(composerPath, 'utf8')) as {
      require?: Record<string, string>;
    };
    return typeof composer.require?.['laravel/framework'] === 'string';
  } catch {
    return false;
  }
}

/**
 * A detected Laravel deployment gets a private project Blob store just like it
 * gets its framework runtime. The generated image selects the bundled Blob
 * driver, so application code only uses Laravel's normal Storage contract.
 */
export async function ensureLaravelZeroConfigStorage(
  client: Client,
  projectPath: string,
  project: LaravelProject,
  owner: LaravelProjectOwner
): Promise<void> {
  if (!isLaravelApplication(projectPath)) {
    return;
  }

  const response = await client.fetch<{ stores: BlobStore[] }>(
    '/v1/storage/stores',
    {
      method: 'GET',
      accountId: owner.id,
    }
  );
  const connectedStore = response.stores.find(
    store =>
      (!store.type || store.type === 'blob') &&
      store.projectsMetadata?.some(
        metadata => metadata.projectId === project.id
      )
  );

  if (connectedStore) {
    output.debug(
      `Using Laravel Blob store ${connectedStore.name} (${connectedStore.id})`
    );
    return;
  }

  const name = `${project.name}-laravel-files`.slice(0, 100);
  output.spinner(`Provisioning private Laravel storage for ${project.name}`);

  const created = await client.fetch<{ store: { id: string } }>(
    '/v1/storage/stores/blob',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        region: 'iad1',
        access: 'private',
      }),
      accountId: owner.id,
    }
  );

  await connectResourceToProject(
    client,
    project.id,
    created.store.id,
    ['production', 'preview', 'development'],
    { accountId: owner.id }
  );

  output.stopSpinner();
  output.success(`Laravel storage ready: ${name}`);
}
