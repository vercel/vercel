import type Client from './client';

export type TokenIntrospectionResponse = {
  active: boolean;
  client_id?: string;
  client_name?: string;
  sub?: string;
  team?: {
    id: string;
    slug?: string;
    name?: string;
  };
};

export async function introspectToken(
  client: Client,
  token?: string
): Promise<TokenIntrospectionResponse> {
  token = token || client.authConfig.token;

  if (!token) {
    throw new Error('No token to introspect');
  }

  return client.fetch<TokenIntrospectionResponse>(
    '/login/oauth/token/introspect',
    {
      method: 'POST',
      useCurrentTeam: false,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        token,
      }),
    }
  );
}
