import type Client from '../client';
import type { Metadata } from '../integration/types';

export async function updateThreshold(
  client: Client,
  installationId: string,
  resourceId: string,
  billingPlanId: string,
  minimumAmountInCents: number,
  purchaseAmountInCents: number,
  maximumAmountPerPeriodInCents: number,
  metadata: Metadata
) {
  return await client.fetch<{ store: { id: string } }>(
    `/v1/integrations/installations/${installationId}/resources/${resourceId}/billing/threshold`,
    {
      method: 'POST',
      json: true,
      body: {
        billingPlanId,
        minimumAmountInCents,
        purchaseAmountInCents,
        maximumAmountPerPeriodInCents,
        metadata: JSON.stringify(metadata),
      },
    }
  );
}
