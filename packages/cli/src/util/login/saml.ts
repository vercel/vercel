import { URL } from 'url';
import type Client from '../client';
import { inspectTokenRequest, processInspectTokenResponse } from '../oauth';
import doOauthLogin from './oauth';

export default async function doSamlLogin(
  client: Client,
  team: { teamIdOrSlug: string; slug: string },
  outOfBand?: boolean,
  ssoUserId?: string
) {
  if (client.authConfig.type === 'oauth') {
    const sessionId = await getSessionId(client);
    const url = new URL(
      `https://vercel.com/sso/${team.slug}?${new URLSearchParams({
        session_id: sessionId,
      }).toString()}`
    );
    return doOauthLogin(
      client,
      url,
      'SAML Single Sign-On',
      outOfBand,
      ssoUserId
    );
  }
  const url = new URL('/auth/sso', client.apiUrl);
  url.searchParams.set('teamId', team.teamIdOrSlug);
  return doOauthLogin(client, url, 'SAML Single Sign-On', outOfBand, ssoUserId);
}

export async function getSessionId(client: Client): Promise<string> {
  if (client.authConfig.type !== 'oauth') {
    throw new Error(
      'Session ID can only be retrieved for OAuth login. This error should not happen. Please contact support.'
    );
  }

  const { token } = client.authConfig;

  if (!token) {
    throw new Error(
      'You need to be logged in to perform this action. Please log in and try again.'
    );
  }

  const inspectResponse = await inspectTokenRequest(token);

  const [inspectError, inspectResult] =
    await processInspectTokenResponse(inspectResponse);

  if (inspectError) throw inspectError;

  return inspectResult.session_id;
}
