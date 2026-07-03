import type Client from './client';
import {
  type AccessToken,
  inspectTokenRequest,
  processInspectTokenResponse,
} from './oauth';

export type TokenIntrospectionResponse = AccessToken;

export async function introspectToken(
  client: Client
): Promise<TokenIntrospectionResponse> {
  const token = client.authConfig.token;

  if (!token) {
    throw new Error('No token to introspect');
  }

  const [error, introspection] = await processInspectTokenResponse(
    await inspectTokenRequest(token)
  );

  if (error) {
    throw error;
  }

  return introspection;
}
