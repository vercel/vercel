import type Client from './client';
import {
  type AccessToken,
  inspectTokenRequest,
  processInspectTokenResponse,
} from './oauth';

export type TokenIntrospectionResponse = AccessToken;

const VERCEL_API_ORIGIN = 'https://api.vercel.com';

/**
 * Introspects the client's token. Throws an error with `code` `no_token` or
 * `unsupported_api_origin` when introspection is not possible.
 */
export async function introspectToken(
  client: Pick<Client, 'authConfig' | 'apiUrl'>
): Promise<TokenIntrospectionResponse> {
  const token = client.authConfig.token;

  if (!token) {
    throw Object.assign(new Error('No token to introspect'), {
      code: 'no_token',
    });
  }

  if (new URL(client.apiUrl).origin !== VERCEL_API_ORIGIN) {
    throw Object.assign(
      new Error('Token introspection is unavailable for custom API origins'),
      { code: 'unsupported_api_origin' }
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
