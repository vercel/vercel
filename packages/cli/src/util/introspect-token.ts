import type Client from './client';
import {
  type AccessToken,
  getOAuthTestIssuer,
  inspectTokenRequest,
  processInspectTokenResponse,
} from './oauth';

export type TokenIntrospectionResponse = AccessToken;

const VERCEL_API_ORIGIN = 'https://api.vercel.com';

export async function introspectToken(
  client: Client
): Promise<TokenIntrospectionResponse> {
  const token = client.authConfig.token;

  if (!token) {
    throw new Error('No token to introspect');
  }

  const apiOrigin = new URL(client.apiUrl).origin;
  // The internal OAuth test issuer permits only its own loopback API origin.
  if (
    apiOrigin !== VERCEL_API_ORIGIN &&
    apiOrigin !== getOAuthTestIssuer()?.origin
  ) {
    throw new Error(
      'Token introspection is unavailable for custom API origins'
    );
  }

  const [error, introspection] = await processInspectTokenResponse(
    await inspectTokenRequest(token)
  );

  if (error) {
    throw error;
  }

  return introspection;
}
