import type { DiscordChannelCredentials } from 'eve/channels/discord';

import { vercelOidc } from 'eve/channels/auth';

import {
  getTokenResponse,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';

/**
 * Token parameters accepted by {@link connectDiscordCredentials}.
 *
 * Mirrors {@link ConnectTokenParams} from `@vercel/connect`, minus
 * `subject` — Discord bot tokens are app-scoped, so this helper pins the
 * subject to `{ type: "app" }`.
 */
export type ConnectDiscordCredentialsParams = Omit<
  ConnectTokenParams,
  'subject'
>;

/**
 * Build {@link DiscordChannelCredentials} backed by a Vercel Connect Discord
 * Bot connector.
 *
 * The bot token and application id are resolved from the same Connect token
 * response. The webhook verifier accepts interactions forwarded by Connect
 * using Vercel OIDC, so the eve deployment does not need Discord's public key.
 *
 * ```ts
 * import { discordChannel } from "eve/channels/discord";
 * import { connectDiscordCredentials } from "@vercel/connect/eve";
 *
 * export default discordChannel({
 *   credentials: connectDiscordCredentials("discord/my-bot"),
 * });
 * ```
 */
export function connectDiscordCredentials(
  connector: string,
  params: ConnectDiscordCredentialsParams = {},
  options?: ConnectOptions
): DiscordChannelCredentials {
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
    webhookVerifier: vercelOidc(),
  };
}
