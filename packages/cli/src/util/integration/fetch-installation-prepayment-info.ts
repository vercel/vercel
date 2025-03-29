import type Client from '../client';
import type { InstallationBalancesAndThresholds } from './types';

export async function fetchInstallationPrepaymentInfo(
  client: Client,
  teamId: string,
  installationId: string
): Promise<InstallationBalancesAndThresholds> {
  const searchParams = new URLSearchParams();
  searchParams.set('teamId', teamId);

  return await client.fetch<InstallationBalancesAndThresholds>(
    `/v1/integrations/installations/${installationId}/billing/balance?teamId=${searchParams}`,
    {
      json: true,
    }
  );
}
