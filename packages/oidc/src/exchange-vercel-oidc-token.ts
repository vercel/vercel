import { version } from './version';

/**
 * The options for the `exchangeVercelOidcToken` function.
 *
 * @typedef {Object} ExchangeVercelOidcTokenOptions
 * @property {string} token - The token to exchange.
 * @property {string} audience - Optional audience to set on the exchanged token.
 * @property {string} jti - Optional JTI to set on the exchanged token.
 */
export interface ExchangeVercelOidcTokenOptions {
  /**
   * The token to exchange.
   */
  token: string;
  /**
   * Optional audience to set on the exchanged token.
   * @default undefined
   */
  audience?: string;
  /**
   * Optional JTI to set on the exchanged token.
   * @default undefined
   */
  jti?: string;
}

/**
 * Exchanges a Vercel OIDC token for a Vercel token with a custom audience.
 *
 * @param {ExchangeVercelOidcTokenOptions} options - The options for the exchange.
 * @param {string} options.token - The token to exchange.
 * @param {string} options.audience - Optional audience to set on the exchanged token.
 * @param {string} options.jti - Optional JTI to set on the exchanged token.
 * @throws {Error} If the token exchange fails.
 * @returns {Promise<string>} A promise that resolves to the exchanged token.
 */
export async function exchangeVercelOidcToken(
  options: ExchangeVercelOidcTokenOptions
): Promise<string> {
  const response = await fetch('https://oidc.vercel.com/~token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': `@vercel/oidc@${version}`,
    },
    body: JSON.stringify({
      token: options.token,
      aud: options.audience,
      ...(options.jti ? { jti: options.jti } : undefined),
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to exchange token: ${await readErrorMessage(response)}`
    );
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch (_error) {
    throw new Error('Failed to exchange token: response was not valid JSON');
  }
  if (
    !data ||
    typeof data !== 'object' ||
    !('token' in data) ||
    typeof data.token !== 'string'
  ) {
    throw new Error(
      'Failed to exchange token: response did not contain a token'
    );
  }
  return data.token;
}

/**
 * Reads the error message returned by the token exchange endpoint. On a non-2xx
 * response the API responds with a JSON object containing an `error` string;
 * fall back to the status text if the body is missing or malformed.
 */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof data.error === 'string'
    ) {
      return data.error;
    }
  } catch (_error) {
    // Ignore parsing errors and fall back to the status text below.
  }
  return response.statusText || `HTTP ${response.status}`;
}
