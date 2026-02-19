import output from '../../output-manager';
import type Client from '../client';
import type { InstallationBalancesAndThresholds } from './types';
import { isAPIError } from '../errors-ts';

export async function fetchInstallationPrepaymentInfo(
  client: Client,
  teamId: string,
  installationId: string
): Promise<InstallationBalancesAndThresholds> {
  const searchParams = new URLSearchParams();
  searchParams.set('teamId', teamId);

  return await client.fetch<InstallationBalancesAndThresholds>(
    `/v1/integrations/installations/${installationId}/billing/balance?${searchParams}`,
    {
      json: true,
    }
  );
}

export async function getBalanceInformation(
  client: Client,
  installationId: string,
  team: { id: string }
) {
  output.spinner('Retrieving balance info…', 500);
  try {
    const prepaymentInfo = await fetchInstallationPrepaymentInfo(
      client,
      team.id,
      installationId
    );

    output.stopSpinner();

    if (!prepaymentInfo) {
      output.error('No balance information found for this integration');
      return;
    }

    return prepaymentInfo;
  } catch (error) {
    output.stopSpinner();
    if (isAPIError(error) && error.code === 'not_prepayment') {
      output.error(error.serverMessage);
      return;
    }
    output.error(`Failed to fetch balance info: ${(error as Error).message}`);
    return;
  }
}
