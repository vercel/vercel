import type Client from '../client';
import type { Metadata } from './types';

export async function updateInstallationThreshold(
  client: Client,
  installationId: string,
  billingPlanId: string,
  minimumAmountInCents: number,
  purchaseAmountInCents: number,
  maximumAmountPerPeriodInCents: number,
  metadata: Metadata
) {
  return await client.fetch<{ store: { id: string } }>(
    `/v1/integrations/installations/${installationId}/billing/threshold/batch`,
    {
      method: 'POST',
      json: true,
      body: {
        items: [
          {
            billingPlanId,
            minimumAmountInCents,
            purchaseAmountInCents,
            maximumAmountPerPeriodInCents,
            metadata: JSON.stringify(metadata),
          },
        ],
      },
    }
  );
}
