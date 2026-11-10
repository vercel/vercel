import type Client from '../client';

/**
 * Lists all marketplace integration installations for the authenticated team/account.
 */
export async function fetchAllMarketplaceInstallations(client: Client) {
  const searchParams = new URLSearchParams();
  searchParams.set('view', 'account');
  searchParams.set('installationType', 'marketplace');
  return client.fetch<Record<string, unknown>[]>(
    `/v2/integrations/configurations?${searchParams}`,
    { json: true }
  );
}
