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
  options?: ExchangeVercelOidcTokenOptions
): Promise<string> {
  const response = await fetch('https://oidc.vercel.com/~token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': `@vercel/oidc@${version}`,
    },
    body: JSON.stringify({
      token: options?.token,
      aud: options?.audience,
      ...(options?.jti ? { jti: options.jti } : undefined),
    }),
  });
  if (!response.ok) {
    throw new Error('Failed to exchange token');
  }
  try {
    const data = await response.json();
    if (typeof data.token !== 'string') {
      throw new Error('Failed to exchange token');
    }
    return data.token;
  } catch (_error) {
    throw new Error('Failed to exchange token');
  }
}
