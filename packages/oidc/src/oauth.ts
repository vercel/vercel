import { arch, hostname, platform } from 'os';

const VERCEL_ISSUER = 'https://vercel.com';
const VERCEL_CLI_CLIENT_ID = 'cl_HYyOPBNtFMfHhaUn9L4QPfTZz6TP47bp';

// Simplified user agent for OIDC package
const userAgent = `@vercel/oidc node-${process.version} ${platform()} (${arch()}) ${hostname()}`;

export interface TokenSet {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Cached authorization server metadata
 */
let _tokenEndpoint: string | null = null;

/**
 * Get the token endpoint from Vercel's OAuth discovery endpoint
 */
async function getTokenEndpoint(): Promise<string> {
  if (_tokenEndpoint) {
    return _tokenEndpoint;
  }

  const discoveryUrl = `${VERCEL_ISSUER}/.well-known/openid-configuration`;
  const response = await fetch(discoveryUrl, {
    headers: { 'user-agent': userAgent },
  });

  if (!response.ok) {
    throw new Error('Failed to discover OAuth endpoints');
  }

  const metadata = await response.json();
  if (!metadata || typeof metadata.token_endpoint !== 'string') {
    throw new Error('Invalid OAuth discovery response');
  }

  const endpoint = metadata.token_endpoint;
  _tokenEndpoint = endpoint;
  return endpoint;
}

/**
 * Refresh an OAuth access token using a refresh token
 */
export async function refreshTokenRequest(options: {
  refresh_token: string;
}): Promise<Response> {
  const tokenEndpoint = await getTokenEndpoint();

  return await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'user-agent': userAgent,
    },
    body: new URLSearchParams({
      client_id: VERCEL_CLI_CLIENT_ID,
      grant_type: 'refresh_token',
      ...options,
    }),
  });
}

/**
 * Process the token response and extract the token set
 */
export async function processTokenResponse(
  response: Response
): Promise<[Error] | [null, TokenSet]> {
  const json = await response.json();

  if (!response.ok) {
    const errorMsg =
      typeof json === 'object' && json && 'error' in json
        ? String(json.error)
        : 'Token refresh failed';
    return [new Error(errorMsg)];
  }

  // Validate response structure
  if (typeof json !== 'object' || json === null) {
    return [new Error('Invalid token response')];
  }
  if (typeof json.access_token !== 'string') {
    return [new Error('Missing access_token in response')];
  }
  if (json.token_type !== 'Bearer') {
    return [new Error('Invalid token_type in response')];
  }
  if (typeof json.expires_in !== 'number') {
    return [new Error('Missing expires_in in response')];
  }

  return [null, json as TokenSet];
}
