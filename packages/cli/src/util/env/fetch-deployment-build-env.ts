import type Client from '../client';
import output from '../../output-manager';
import { pullEnvRecords } from './get-env-records';

const INTEGRATIONS_POLL_INTERVAL_MS = 5000;
const INTEGRATIONS_POLL_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes, matches API timeout

/**
 * Fetches build environment variables for a deployment from the API.
 * If integrations are still provisioning, polls until they complete.
 * Pass `quiet` to skip the progress spinner, e.g. for JSON output.
 */
export async function fetchDeploymentBuildEnv(
  client: Client,
  deploymentId: string,
  { quiet = false }: { quiet?: boolean } = {}
): Promise<{ env: Record<string, string>; buildEnv: Record<string, string> }> {
  const deadline = Date.now() + INTEGRATIONS_POLL_TIMEOUT_MS;
  let isPolling = false;

  while (Date.now() < deadline) {
    try {
      return await pullEnvRecords(client, deploymentId, 'vercel-cli:pull');
    } catch (err: unknown) {
      // If the API returns integrationsStatus: 'pending', poll until ready
      if (
        err &&
        typeof err === 'object' &&
        'integrationsStatus' in err &&
        (err as { integrationsStatus?: string }).integrationsStatus ===
          'pending'
      ) {
        if (!isPolling && !quiet) {
          output.spinner(
            'Waiting for deployment integrations to finish provisioning...'
          );
          isPolling = true;
        }
        await new Promise(resolve =>
          setTimeout(resolve, INTEGRATIONS_POLL_INTERVAL_MS)
        );
        continue;
      }
      throw err;
    }
  }

  throw new Error(
    'Timed out waiting for deployment integrations to complete provisioning.'
  );
}
