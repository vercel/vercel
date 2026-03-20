import type Client from '../client';
import type { PublicAWSCustomerAccount } from './create-account';

export default async function refreshVpcAccount(
  client: Client,
  teamId: string,
  awsAccountId: string
): Promise<PublicAWSCustomerAccount> {
  return await client.fetch<PublicAWSCustomerAccount>(
    `/teams/${encodeURIComponent(teamId)}/private-cloud/accounts/${encodeURIComponent(awsAccountId)}/refresh`,
    {
      method: 'POST',
      useCurrentTeam: false,
    }
  );
}
