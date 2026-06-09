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
 * @param options - The options for the exchange.
 * @returns The exchanged token.
 */
export async function exchangeVercelOidcToken(
  options?: ExchangeVercelOidcTokenOptions
): Promise<string> {
  const response = await fetch('https://oidc.vercel.com/~token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      token: options?.token,
      aud: options?.audience,
      jti: options?.jti,
    }),
  });
  if (!response.ok) {
    throw new Error('Failed to exchange token');
  }
  const data = await response.json();
  return data.token;
}
