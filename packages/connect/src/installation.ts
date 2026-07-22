import { getVercelOidcToken } from '@vercel/oidc';
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

const DETACHED_INTERACTIVE_AUTH_MODE = 'detached';
const INTERACTIVE_AUTH_MODE_ENV = 'VERCEL_CONNECT_INTERACTIVE_AUTH_MODE';

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

  const detachedInteractiveAuth =
    process.env[INTERACTIVE_AUTH_MODE_ENV] === DETACHED_INTERACTIVE_AUTH_MODE;

  if (!detachedInteractiveAuth && options?.returnUrl !== undefined) {
    validateReturnUrl(options.returnUrl);
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

function validateReturnUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid returnUrl: ${value}`);
  }
  if (url.protocol === 'https:') return;
  if (url.protocol === 'http:' && url.hostname === 'localhost') {
    return;
  }
  throw new Error(
    `returnUrl must be https:// or http://localhost, got: ${value}`
  );
}

function validateWebhookUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid webhook URL: ${value}`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`webhook must be https://, got: ${value}`);
  }
}
