import type Client from '../client';
import getScope from '../get-scope';

type AuthCodeResponse = {
  authCode: string;
};

/**
 * Fetches the transfer-out auth (EPP) code for a registered domain. This is a
 * sensitive secret used to transfer the domain to another registrar, so the
 * caller must never persist it in telemetry or logs. Throws `APIError` for the
 * caller to map to messages.
 */
export default async function fetchAuthCode(
  client: Client,
  name: string
): Promise<string> {
  const { team } = await getScope(client);
  const teamParam = team ? `?teamId=${team.slug}` : '';

  const { authCode } = await client.fetch<AuthCodeResponse>(
    `/v1/registrar/domains/${encodeURIComponent(name)}/auth-code${teamParam}`
  );

  return authCode;
}
