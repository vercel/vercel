import { isAPIError } from '../errors-ts';
import type Client from '../client';
import { packageName } from '../pkg-name';
import type { Resource } from './types';

export class ClaimUrlError extends Error {
  /** Stable code so callers can branch on the failure type. */
  code:
    | 'installation_not_found'
    | 'not_marketplace'
    | 'resource_not_found'
    | 'not_sandbox'
    | 'forbidden'
    | 'partner_error'
    | 'unknown';
  status?: number;

  constructor(message: string, code: ClaimUrlError['code'], status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface CreateClaimUrlResponse {
  claimUrl: string;
}

export async function createClaimUrl(
  client: Client,
  resource: Resource
): Promise<CreateClaimUrlResponse> {
  const installationId = resource.product?.integrationConfigurationId;
  if (!installationId) {
    throw new ClaimUrlError(
      `Resource "${resource.name}" is not associated with a marketplace installation and cannot be claimed.`,
      'not_marketplace'
    );
  }

  try {
    return await client.fetch<CreateClaimUrlResponse>(
      `/v1/integrations/installations/${encodeURIComponent(installationId)}/resources/${encodeURIComponent(resource.id)}/sandbox/claim-url`,
      {
        method: 'POST',
        json: true,
        body: { source: 'cli' },
      }
    );
  } catch (error) {
    throw mapClaimUrlError(error, resource);
  }
}

function mapClaimUrlError(error: unknown, resource: Resource): ClaimUrlError {
  if (!isAPIError(error)) {
    if (error instanceof Error) {
      return new ClaimUrlError(
        `Provider could not generate a claim URL: ${error.message}`,
        'unknown'
      );
    }
    return new ClaimUrlError(
      'Provider could not generate a claim URL.',
      'unknown'
    );
  }

  const status = error.status;
  const serverMessage = (error.serverMessage || error.message || '').toString();
  const messageLower = serverMessage.toLowerCase();

  if (status === 403) {
    return new ClaimUrlError(
      "You don't have permission to claim resources in this team.",
      'forbidden',
      status
    );
  }

  if (status === 404) {
    if (messageLower.includes('installation')) {
      return new ClaimUrlError(
        'Integration installation not found. Run `vercel integration list`.',
        'installation_not_found',
        status
      );
    }
    return new ClaimUrlError(
      `No resource named '${resource.name}' found.`,
      'resource_not_found',
      status
    );
  }

  if (status === 400) {
    if (
      messageLower.includes('sandbox') ||
      messageLower.includes('ownership')
    ) {
      return new ClaimUrlError(
        `'${resource.name}' can no longer be claimed (likely already claimed). Run \`${packageName} integration list\` to refresh.`,
        'not_sandbox',
        status
      );
    }
    if (
      messageLower.includes('marketplace') ||
      messageLower.includes('integration')
    ) {
      return new ClaimUrlError(
        "This integration doesn't support claiming.",
        'not_marketplace',
        status
      );
    }
  }

  return new ClaimUrlError(
    `Provider could not generate a claim URL: ${serverMessage || 'unknown error'}`,
    'partner_error',
    status
  );
}
