import type Client from '../client';

export interface OwnedIntegrationProduct {
  id: string;
  slug: string;
  name: string;
  agentSkillName?: string;
  agentSkillUrl?: string;
}

export interface OwnedIntegrationResponse {
  id: string;
  slug: string;
  name: string;
  products?: OwnedIntegrationProduct[];
}

export async function fetchOwnedIntegration(
  client: Client,
  slugOrId: string
): Promise<OwnedIntegrationResponse> {
  return client.fetch<OwnedIntegrationResponse>(
    `/v2/integrations/integration/${encodeURIComponent(slugOrId)}/owned`,
    { json: true }
  );
}
