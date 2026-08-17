import {
  getTokenResponse,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';
import type { ConnectDiscordAdapterConfig } from './types.js';
import { createConnectWebhookVerifier } from './webhook-verifier.js';

/**
 * Token parameters accepted by {@link connectDiscordAdapter}.
 *
 * Mirrors {@link ConnectTokenParams} from `@vercel/connect`, minus
 * `subject` — Discord bot tokens are app-scoped, so this helper pins the
 * subject to `{ type: "app" }`.
 */
export type ConnectDiscordAdapterParams = Omit<ConnectTokenParams, 'subject'>;

/**
 * Build a Discord adapter config fragment backed by a Vercel Connect Discord
 * Bot connector.
 *
 * The bot token and application id are resolved from the same Connect token
 * response. The webhook verifier accepts interactions forwarded by Connect
 * using Vercel OIDC, so the deployment does not need Discord's public key.
 *
 * ```ts
 * import { createDiscordAdapter } from "@chat-adapter/discord";
 * import { connectDiscordAdapter } from "@vercel/connect/chat";
 *
 * createDiscordAdapter({
 *   ...connectDiscordAdapter("discord/my-bot"),
 * });
 * ```
 */
export function connectDiscordAdapter(
  connector: string,
  params: ConnectDiscordAdapterParams = {},
  options?: ConnectOptions
): ConnectDiscordAdapterConfig {
  type ResolvedCredentials = {
    applicationId: string;
    botToken: string;
  };
  let pending: Promise<ResolvedCredentials> | undefined;

  function resolveCredentials(): Promise<ResolvedCredentials> {
    if (!pending) {
      pending = getTokenResponse(
        connector,
        { ...params, subject: { type: 'app' } },
        options
      )
        .then(response => {
          const applicationId = response.metadata?.applicationId;
          if (typeof applicationId !== 'string' || applicationId.length === 0) {
            throw new Error(
              `Vercel Connect connector ${connector} did not return a Discord application id.`
            );
          }
          return { applicationId, botToken: response.token };
        })
        .finally(() => {
          pending = undefined;
        });
    }
    return pending;
  }

  return {
    applicationId: async () => (await resolveCredentials()).applicationId,
    botToken: async () => (await resolveCredentials()).botToken,
    webhookVerifier: createConnectWebhookVerifier(),
  };
}
