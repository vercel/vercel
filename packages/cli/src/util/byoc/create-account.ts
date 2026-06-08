import type Client from '../client';

export interface CreateAccountRequest {
  awsAccountId: string;
  roleName: string;
  externalId?: string;
}

export interface PublicAWSCustomerAccount {
  awsAccountId: string;
  roleName: string;
  externalId: string;
  credentialsExpiresAt: string | null;
  createdAt: string;
}

export default async function createByocAccount(
  client: Client,
  teamId: string,
  payload: CreateAccountRequest
): Promise<PublicAWSCustomerAccount> {
  const body: Record<string, string> = {
    awsAccountId: payload.awsAccountId,
    roleName: payload.roleName,
  };
  if (payload.externalId) {
    body.externalId = payload.externalId;
  }
  return await client.fetch<PublicAWSCustomerAccount>(
    `/teams/${encodeURIComponent(teamId)}/private-cloud/accounts`,
    {
      method: 'POST',
      body,
      useCurrentTeam: false,
    }
  );
}
