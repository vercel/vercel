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
): Promise<void> {
  // The batch endpoint expects a bare JSON array as the request body and
  // returns 204 No Content.  `client.fetch` only auto-serialises plain
  // objects (`isJSONObject` rejects arrays), so we stringify manually and
  // pass the result as a string body with the correct content-type header.
  await client.fetch(
    `/v1/integrations/installations/${installationId}/billing/threshold/batch`,
    {
      method: 'POST',
      json: false,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify([
        {
          billingPlanId,
          minimumAmountInCents,
          purchaseAmountInCents,
          maximumAmountPerPeriodInCents,
          metadata: JSON.stringify(metadata),
        },
      ]),
    }
  );
}
