import type Client from '../client';
import type { Resource } from './types';

export interface SecretsEnvVarConflict {
  projectId: string;
  projectName: string;
  connectionId: string;
  key: string;
  envVarId?: string;
  environments: string[];
  managedBy?: { storeId?: string; integrationConfigurationId?: string };
}

export interface SyncResourceSecretsResult {
  dryRun: boolean;
  connectionIds: string[];
  conflicts: SecretsEnvVarConflict[];
}

export async function syncResourceSecrets(
  client: Client,
  resource: Resource,
  options: { dryRun?: boolean; overwriteConflicts?: boolean }
): Promise<SyncResourceSecretsResult> {
  return client.fetch<SyncResourceSecretsResult>(
    `/v1/integrations/installations/${resource.product?.integrationConfigurationId}/resources/${resource.id}/secrets/sync`,
    {
      json: true,
      method: 'POST',
      body: options,
    }
  );
}
