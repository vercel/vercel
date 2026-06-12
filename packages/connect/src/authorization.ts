import { getVercelOidcToken } from '@vercel/oidc';
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
}

export async function startAuthorization(
  connector: string,
  params: ConnectTokenParams,
  options?: ConnectAuthorizationOptions
): Promise<ConnectAuthorizationResponse> {
  if (!connector) {
    throw new Error('connector is required');
  }
  if (options?.callbackUrl !== undefined) {
    validateCallbackUrl(options.callbackUrl);
  }
  if (options?.webhook !== undefined) {
    validateWebhookUrl(options.webhook);
  }

  const vercelToken = options?.vercelToken ?? (await getVercelOidcToken());
  const endpoint = `https://api.vercel.com/v1/connect/authorize/${encodeURIComponent(connector)}`;

  const body = {
    ...params,
    ...(options?.callbackUrl !== undefined && {
      returnUrl: options.callbackUrl,
    }),
    ...(options?.webhook !== undefined && { webhook: options.webhook }),
    ...(options?.deviceCode !== undefined && {
      deviceCode: options.deviceCode,
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

function validateCallbackUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid callbackUrl: ${value}`);
  }
  if (url.protocol === 'https:') return;
  if (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  ) {
    return;
  }
  throw new Error(
    `callbackUrl must be https:// or http://localhost, got: ${value}`
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
