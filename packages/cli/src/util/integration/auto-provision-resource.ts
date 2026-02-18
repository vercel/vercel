import output from '../../output-manager';
import type Client from '../client';
import { APIError } from '../errors-ts';
import type {
  AcceptedPolicies,
  AutoProvisionFallback,
  AutoProvisionResult,
  Metadata,
} from './types';

function isAutoProvisionFallback(
  error: unknown
): error is AutoProvisionFallback {
  return (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    ['metadata', 'unknown'].includes(
      (error as { kind: unknown }).kind as string
    ) &&
    'url' in error &&
    'integration' in error &&
    'product' in error
  );
}

export async function autoProvisionResource(
  client: Client,
  integrationSlug: string,
  productSlug: string,
  name: string,
  metadata: Metadata,
  acceptedPolicies: AcceptedPolicies,
  billingPlanId?: string
): Promise<AutoProvisionResult> {
  const endpoint = `/v1/integrations/integration/${encodeURIComponent(integrationSlug)}/marketplace/auto-provision/${encodeURIComponent(productSlug)}`;
  const body = {
    name,
    metadata,
    acceptedPolicies,
    source: 'cli',
    ...(billingPlanId ? { billingPlanId } : {}),
  };
  output.debug(`Auto-provision request: POST ${endpoint}`);
  output.debug(`Auto-provision body: ${JSON.stringify(body, null, 2)}`);

  try {
    const res = await client.fetch(endpoint, {
      method: 'POST',
      json: false,
      body,
    });

    // 200/201/202 - success
    if (res.ok) {
      return res.json();
    }

    // Shouldn't reach here - client.fetch throws on non-ok responses
    throw new Error(`Auto-provision failed: ${res.status}`);
  } catch (error) {
    // client.fetch throws APIError on 4xx - check if it's a 422 with fallback data
    if (
      error instanceof APIError &&
      error.status === 422 &&
      isAutoProvisionFallback(error)
    ) {
      output.debug(`Auto-provision returned 422 fallback response`);
      return error;
    }

    output.debug(`Auto-provision error: ${error}`);
    // Re-throw other errors (400/403/404/etc)
    throw error;
  }
}
