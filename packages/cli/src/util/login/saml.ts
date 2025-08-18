import { URL } from 'url';
import type Client from '../client';
import { inspectTokenRequest, processInspectTokenResponse } from '../oauth';
import doOauthLogin from './oauth';

export default async function doSamlLogin(
  client: Client,
  teamIdOrSlug: string,
  outOfBand?: boolean,
  ssoUserId?: string
) {
  if (client.authConfig.type === 'oauth') {
    const { session_id, client_id } = await decodeToken(client);
    const params = { session_id, client_id };
    const url = new URL(
      `https://vercel.com/sso/${teamIdOrSlug}?${new URLSearchParams(params).toString()}`
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
  url.searchParams.set('teamId', teamIdOrSlug);
  return doOauthLogin(client, url, 'SAML Single Sign-On', outOfBand, ssoUserId);
}

async function decodeToken(client: Client) {
  const { token } = client.authConfig;

  if (!token) {
    throw new Error(
      `No existing credentials found. Please run \`vercel login --future\`.`
    );
  }

  const inspectResponse = await inspectTokenRequest(token);

  const [inspectError, inspectResult] =
    await processInspectTokenResponse(inspectResponse);

  if (inspectError) throw inspectError;

  if (
    !inspectResult.active ||
    !inspectResult.session_id ||
    !inspectResult.client_id
  ) {
    throw new Error(
      `Invalid token type. Run \`vercel login --future\` to log-in and try again.`
    );
  }

  return {
    session_id: inspectResult.session_id,
    client_id: inspectResult.client_id,
  };
}
