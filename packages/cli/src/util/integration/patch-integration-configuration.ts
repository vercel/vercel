import type Client from '../client';

export type PatchIntegrationConfigurationBody =
  | {
      billingPlanId: string;
      authorizationId?: string;
    }
  | {
      projects: 'all' | string[];
    };

export async function patchIntegrationConfiguration(
  client: Client,
  configurationId: string,
  body: PatchIntegrationConfigurationBody
): Promise<unknown> {
  return client.fetch(
    `/v1/integrations/configuration/${encodeURIComponent(configurationId)}`,
    {
      method: 'PATCH',
      body,
      json: true,
    }
  );
}
