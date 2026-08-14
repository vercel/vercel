import { getVercelOidcToken } from '@vercel/oidc';
import {
  isDetachedInteractiveAuth,
  validateCallbackUrl,
  validateWebhookUrl,
} from './internal/url-validation.js';
import type { ConnectTokenParams } from './token.js';
import { createConnectErrorFromResponse } from './token.js';

export type ConnectInstallationParams = Omit<ConnectTokenParams, 'subject'>;

export interface ConnectInstallationOptions {
  vercelToken?: string;
  returnUrl?: string;
  webhook?: string;
  tenantId?: string;
  deviceCode?: boolean;
  expiresInMs?: number;
}

export interface ConnectInstallationResponse {
  request: string;
  verifier: string;
  url: string;
  deviceCode?: string;
  expiresAt: number;
  connector: {
    /** Client id. */
    id: string;
    /** Client uid. */
    uid: string;
    /** Client type, eg. `oauth`, `salesforce`. */
    type: string;
    /** Resolved service id when known, eg. `salesforce`. */
    service?: string;
    /**
     * Curated display name of the resolved service, eg. `Salesforce`,
     * present when the service is known to Vercel Connect. Suited for
     * end-user surfaces like "Sign in with {serviceName}".
     */
    serviceName?: string;
    /** The connector's own (operator-given) name. */
    name: string;
  };
}

/**
 * Create an operator installation request for an app-scoped connector.
 *
 * @experimental This API is feature-gated while experimental. Contact Vercel
 * to enable access before using it.
 */
export async function experimental_startInstallation(
  connector: string,
  params: ConnectInstallationParams = {},
  options?: ConnectInstallationOptions
): Promise<ConnectInstallationResponse> {
  if (!connector) {
    throw new Error('connector is required');
  }

  const detachedInteractiveAuth = isDetachedInteractiveAuth();

  if (!detachedInteractiveAuth && options?.returnUrl !== undefined) {
    validateCallbackUrl(options.returnUrl, 'returnUrl');
  }
  if (options?.webhook !== undefined) {
    validateWebhookUrl(options.webhook);
  }

  const vercelToken = options?.vercelToken ?? (await getVercelOidcToken());
  const endpoint = `https://api.vercel.com/v1/connect/install/${encodeURIComponent(connector)}`;
  const deviceCode =
    options?.deviceCode ?? (detachedInteractiveAuth ? true : undefined);
  const returnUrl =
    !detachedInteractiveAuth && options?.returnUrl !== undefined
      ? { returnUrl: options.returnUrl }
      : {};

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${vercelToken}`,
    },
    body: JSON.stringify({
      ...params,
      ...returnUrl,
      ...(options?.webhook !== undefined && { webhook: options.webhook }),
      ...(options?.tenantId !== undefined && { tenantId: options.tenantId }),
      ...(deviceCode !== undefined && { deviceCode }),
      ...(options?.expiresInMs !== undefined && {
        expiresInMs: options.expiresInMs,
      }),
    }),
  });

  if (!response.ok) {
    throw await createConnectErrorFromResponse(
      response,
      'Failed to start installation'
    );
  }

  const data: ConnectInstallationResponse = await response.json();
  return data;
}
