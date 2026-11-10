import type Client from './client';
import {
  type AccessToken,
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

  if (new URL(client.apiUrl).origin !== VERCEL_API_ORIGIN) {
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
