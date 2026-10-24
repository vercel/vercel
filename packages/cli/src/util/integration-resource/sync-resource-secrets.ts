import type Client from '../client';
import { isAPIError } from '../errors-ts';
import type { Resource } from './types';

export interface SecretsEnvVarConflict {
  projectId: string;
  projectName: string;
  connectionId: string;
  key: string;
  envVarId?: string;
  environments: string[];
  managedBy?: { storeId?: string; integrationConfigurationId?: string };
  orphaned?: true;
}

export interface SyncResourceSecretsResult {
  dryRun: boolean;
  connectionCount: number;
  appliedConnectionCount: number;
  conflicts: SecretsEnvVarConflict[];
  hiddenConflictCount: number;
  overwritten: SecretsEnvVarConflict[];
  reclaimed: SecretsEnvVarConflict[];
  hiddenReclaimedCount: number;
}

export type SecretsEnvVarConflictsDetails = Omit<
  SyncResourceSecretsResult,
  'dryRun'
> & { canOverwrite: boolean };

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

/**
 * The API applies the secrets to every connection it can and responds with a
 * 409 listing the env vars that blocked the rest.
 */
export function getSecretsEnvVarConflicts(
  error: unknown
): SecretsEnvVarConflictsDetails | null {
  if (
    !isAPIError(error) ||
    error.code !== 'secrets_env_var_conflicts' ||
    !Array.isArray(error.conflicts)
  ) {
    return null;
  }
  return {
    canOverwrite: error.canOverwrite === true,
    connectionCount: error.connectionCount ?? 0,
    appliedConnectionCount: error.appliedConnectionCount ?? 0,
    conflicts: error.conflicts,
    hiddenConflictCount: error.hiddenConflictCount ?? 0,
    overwritten: error.overwritten ?? [],
    reclaimed: error.reclaimed ?? [],
    hiddenReclaimedCount: error.hiddenReclaimedCount ?? 0,
  };
}
