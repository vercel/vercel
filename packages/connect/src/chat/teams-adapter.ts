import {
  getConnectorMetadata,
  getToken,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';
import type { ConnectTeamsAdapterConfig } from './types.js';
import { createConnectWebhookVerifier } from './webhook-verifier.js';

/**
 * Teams bot tokens are app-scoped. The adapter selects the resource scopes
 * for each call, so neither `subject` nor `scopes` can be overridden here.
 */
export type ConnectTeamsAdapterParams = Omit<
  ConnectTokenParams,
  'subject' | 'scopes'
>;

/**
 * Build a Microsoft Teams adapter config backed by a managed Connect bot.
 *
 * ```ts
 * import { createTeamsAdapter } from '@chat-adapter/teams';
 * import { connectTeamsAdapter } from '@vercel/connect/chat';
 *
 * createTeamsAdapter({
 *   ...connectTeamsAdapter('microsoft-teams/my-bot'),
 * });
 * ```
 *
 * The app id is resolved lazily from public connector metadata. The token
 * callback requests separate Bot Framework and Microsoft Graph tokens using
 * the adapter's scopes, with caching and refresh handled by Connect. Graph
 * access requires the bot's resource-specific permissions to be granted when
 * it is installed in a team.
 *
 * Connect selects the managed bot's home tenant, so the token callback's
 * tenant argument does not change token selection. The webhook verifier
 * validates Connect-forwarded activities with Vercel OIDC after Connect has
 * verified Microsoft's native JWT.
 */
export function connectTeamsAdapter(
  connector: string,
  params: ConnectTeamsAdapterParams = {},
  options?: ConnectOptions
): ConnectTeamsAdapterConfig {
  return {
    appId: async () => {
      const metadata = await getConnectorMetadata(connector, options);
      const appId = metadata.vendor.appId;
      if (typeof appId !== 'string' || appId.length === 0) {
        throw new Error(
          `Vercel Connect connector ${connector} did not return a Microsoft Teams app id.`
        );
      }
      return appId;
    },
    token: scope =>
      getToken(
        connector,
        {
          ...params,
          subject: { type: 'app' },
          scopes: Array.isArray(scope) ? scope : [scope],
        },
        options
      ),
    webhookVerifier: createConnectWebhookVerifier(),
  };
}
