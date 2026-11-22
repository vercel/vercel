import type { TeamsChannelCredentials } from 'eve/channels/teams';

import { createConnectWebhookVerifier } from '../chat/webhook-verifier.js';

import {
  getConnectorMetadata,
  getTokenResponse,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';

const BOT_FRAMEWORK_SCOPE = 'https://api.botframework.com/.default';

/**
 * Token parameters accepted by {@link connectTeamsCredentials}.
 *
 * Mirrors {@link ConnectTokenParams}, except that Teams bot credentials are
 * always app-scoped and must request the Bot Framework resource. `subject`
 * and `scopes` are therefore pinned by the helper.
 */
export type ConnectTeamsCredentialsParams = Omit<
  ConnectTokenParams,
  'subject' | 'scopes'
>;

/**
 * Build {@link TeamsChannelCredentials} backed by a managed Vercel Connect
 * Microsoft Teams connector.
 *
 * The helper resolves the managed bot's public application id from connector
 * metadata and obtains short-lived Bot Framework access tokens through
 * Vercel Connect. It never exposes the managed app's federated credential.
 * Vercel OIDC verifies trigger-forwarded Bot Framework activities, after
 * Connect has verified their native bearer JWT.
 *
 * ```ts
 * import { connectTeamsCredentials } from '@vercel/connect/eve';
 * import { teamsChannel } from 'eve/channels/teams';
 *
 * export default teamsChannel({
 *   credentials: connectTeamsCredentials('microsoft-teams/my-agent'),
 * });
 * ```
 */
export function connectTeamsCredentials(
  connector: string,
  params: ConnectTeamsCredentialsParams = {},
  options?: ConnectOptions
): TeamsChannelCredentials {
  return {
    appId: () => getTeamsAppId(connector, options),
    tokenProvider: async () => {
      const response = await getTokenResponse(
        connector,
        {
          ...params,
          subject: { type: 'app' },
          scopes: [BOT_FRAMEWORK_SCOPE],
        },
        options
      );
      return { accessToken: response.token, expiresAt: response.expiresAt };
    },
    webhookVerifier: createConnectWebhookVerifier(),
  };
}

async function getTeamsAppId(
  connector: string,
  options?: ConnectOptions
): Promise<string> {
  const metadata = await getConnectorMetadata(connector, options);
  const appId = metadata.vendor.appId;
  if (typeof appId !== 'string' || appId.length === 0) {
    throw new Error(
      `Vercel Connect connector ${connector} did not return a Microsoft Teams app id.`
    );
  }
  return appId;
}
