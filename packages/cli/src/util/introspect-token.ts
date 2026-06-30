import type Client from './client';

export type TokenIntrospectionResponse = {
  active: boolean;
  client_id?: string;
  client_name?: string;
  sub?: string;
  // `slug`/`name` are only present when the token may read the team (enforced
  // server-side via `auth.can(Read, Team)`); `id` is always present.
  team?: { id: string; slug?: string; name?: string };
};

export async function introspectToken(
  client: Client,
  token: string
): Promise<TokenIntrospectionResponse> {
  return client.fetch<TokenIntrospectionResponse>(
    '/login/oauth/token/introspect',
    {
      method: 'POST',
      useCurrentTeam: false,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token }),
    }
  );
}
