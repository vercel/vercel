import output from '../../output-manager';
import { buildCommandWithGlobalFlags } from '../../util/agent-output';
import { quoteArg } from '../../util/flags/quote-arg';
import type { StorageScope } from './shared';
import type Client from '../../util/client';
import type { StoragePlan } from '../../util/storage/plan';
import { formatStoragePlan } from '../../util/storage/plan';
import {
  getStorageStore,
  resolveProjectConnection,
  type StorageStore,
} from '../../util/storage/store';

/**
 * A plan plus whether it was applied. Dry runs and real runs share one shape so
 * an agent can diff `--dry-run` output against the outcome.
 */
export interface StorageResult extends StoragePlan {
  applied: boolean;
  next?: Array<{ command: string; when?: string }>;
}

/** Suggest a local development refresh only when that environment was affected. */
export function getStorageEnvPullNext(
  client: Client,
  scope: StorageScope,
  environments: string[]
): StorageResult['next'] {
  if (!environments.includes('development')) return undefined;

  const teamFlag = scope.teamSlug ? ` --scope ${quoteArg(scope.teamSlug)}` : '';
  return [
    {
      command: buildCommandWithGlobalFlags(
        client.argv,
        `env pull --environment development --project ${quoteArg(scope.project.id)}${teamFlag}`,
        undefined,
        { excludeFlags: ['--yes'] }
      ),
      when: 'if needed, refresh local development variables in .env.local',
    },
  ];
}

export function writeStorageResult(
  client: Client,
  plan: StoragePlan,
  {
    applied,
    asJson,
    message,
    next,
  }: {
    applied: boolean;
    asJson: boolean;
    message?: string;
    next?: Array<{ command: string; when?: string }>;
  }
): void {
  if (asJson) {
    const result: StorageResult = {
      ...plan,
      applied,
      ...(next?.length ? { next } : {}),
    };
    client.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (!applied) {
    output.print(formatStoragePlan(plan));
    output.log('No changes applied. Re-run without --dry-run to apply them.');
    return;
  }

  if (message) {
    output.success(message);
  }

  const written = [...plan.envVars.add, ...plan.envVars.keep];
  if (written.length) {
    output.log(`Environment variables: ${written.join(', ')}`);
  }
  if (plan.envVars.remove.length) {
    output.log(`Removed: ${plan.envVars.remove.join(', ')}`);
  }
  for (const note of plan.envVars.notes) {
    output.log(note);
  }
}

/**
 * Reads back the env var names the API actually resolved for a connection.
 *
 * This is what makes the reported changes exact for Marketplace resources,
 * whose variable names are chosen by the provider and cannot be predicted
 * client-side. A failure here is not fatal — the caller keeps its planned
 * names rather than aborting a mutation that already succeeded.
 */
export async function readBackConnectionEnvVars(
  client: Client,
  {
    store,
    projectId,
    environments,
    accountId,
  }: {
    store: StorageStore;
    projectId: string;
    environments?: string[];
    accountId?: string;
  }
): Promise<string[] | undefined> {
  try {
    const fresh = await getStorageStore(client, store.id, { accountId });
    const connection = resolveProjectConnection(fresh, projectId, environments);
    if (connection.status !== 'found') {
      return undefined;
    }
    return connection.connection.environmentVariables;
  } catch (error) {
    output.debug(
      `Could not read back storage connection env vars: ${(error as Error).message}`
    );
    return undefined;
  }
}
