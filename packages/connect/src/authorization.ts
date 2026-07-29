import { getVercelOidcToken } from '@vercel/oidc';
import {
  isDetachedInteractiveAuth,
  validateCallbackUrl,
  validateWebhookUrl,
} from './internal/url-validation.js';
import type { ConnectTokenParams } from './token.js';

export interface ConnectAuthorizationOptions {
  vercelToken?: string;
  callbackUrl?: string;
  webhook?: string;
  deviceCode?: boolean;
  expiresInMs?: number;
}

export interface ConnectAuthorizationResponse {
  request: string;
  verifier: string;
  url: string;
  deviceCode?: string;
  expiresAt?: number;
  /**
   * Connector (client) being authorized, matching the `connector`
   * object on the Vercel Connect token response. Present once the
   * Vercel API supports returning it.
   */
  connector?: {
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

export async function startAuthorization(
  connector: string,
  params: ConnectTokenParams,
  options?: ConnectAuthorizationOptions
): Promise<ConnectAuthorizationResponse> {
  if (!connector) {
    throw new Error('connector is required');
  }
  const detachedInteractiveAuth = isDetachedInteractiveAuth();
  if (!detachedInteractiveAuth && options?.callbackUrl !== undefined) {
    validateCallbackUrl(options.callbackUrl);
  }
  if (options?.webhook !== undefined) {
    validateWebhookUrl(options.webhook);
  }

  const vercelToken = options?.vercelToken ?? (await getVercelOidcToken());
  const endpoint = `https://api.vercel.com/v1/connect/authorize/${encodeURIComponent(connector)}`;
  const deviceCode =
    options?.deviceCode ?? (detachedInteractiveAuth ? true : undefined);
  const returnUrl =
    !detachedInteractiveAuth && options?.callbackUrl !== undefined
      ? { returnUrl: options.callbackUrl }
      : {};

  const body = {
    ...params,
    ...returnUrl,
    ...(options?.webhook !== undefined && { webhook: options.webhook }),
    ...(deviceCode !== undefined && {
      deviceCode,
    }),
    ...(options?.expiresInMs !== undefined && {
      expiresInMs: options.expiresInMs,
    }),
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${vercelToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorText: string | undefined;
    try {
      errorText = await response.text();
    } catch {}
    throw new Error(
      `Failed to start authorization: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`
    );
  }

  const data: ConnectAuthorizationResponse = await response.json();
  return data;
}
