import type { SlackChannelCredentials } from 'eve/channels/slack';

import {
  getToken,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';
import { vercelOidc } from 'eve/channels/auth';

/**
 * Token parameters accepted by {@link connectSlackCredentials}.
 *
 * Mirrors {@link ConnectTokenParams} from `@vercel/connect`, minus
 * `subject` — Slack bot tokens are always app-scoped, so `subject`
 * is pinned to `{ type: "app" }` by this helper and cannot be
 * overridden.
 */
export interface ConnectSlackCredentialsContext {
  /** Slack workspace whose app installation must supply the bot token. */
  readonly teamId?: string;
}

export type ConnectSlackInstallationIdResolver = (
  context: ConnectSlackCredentialsContext
) => string | undefined | Promise<string | undefined>;

export type ConnectSlackCredentialsParams = Omit<
  ConnectTokenParams,
  'installationId' | 'subject'
> & {
  /**
   * A fixed Connect installation id, or a resolver for multi-workspace apps.
   * The resolver maps Eve's Slack workspace context to Connect's opaque
   * installation id.
   */
  readonly installationId?: string | ConnectSlackInstallationIdResolver;
};

/**
 * Build {@link SlackChannelCredentials} backed by a Vercel Connect
 * connector that stores a Slack workspace's bot token.
 *
 * The returned `botToken` is resolved when Eve makes a Slack API call,
 * so the chat adapter always picks up a fresh token from Vercel Connect.
 * Rotation and refresh are handled server-side; multi-workspace callers
 * resolve the installation from webhook context.
 *
 * Slack bot tokens are app-scoped — one token per workspace install,
 * shared across every end-user — so this helper calls Vercel Connect
 * with `subject: { type: "app" }`. End-user identity (per-user OAuth
 * into Slack) is a separate concern handled elsewhere.
 *
 * The optional `params` and `options` arguments mirror the signature
 * of {@link getToken}, allowing callers to pass through fields like
 * `installationId`, `scopes`, or `validityBufferMs`.
 *
 * ```ts
 * import { slackRoute } from "eve/channels/slack";
 * import { connectSlackCredentials } from "@vercel/connect/eve";
 *
 * export default slackRoute({
 *   credentials: connectSlackCredentials("scl_..."),
 * });
 * ```
 *
 * Multi-workspace deployments can resolve the Connect installation from
 * Eve's Slack workspace context:
 *
 * ```ts
 * connectSlackCredentials("scl_...", {
 *   installationId: ({ teamId }) =>
 *     teamId ? installationIdsBySlackTeam[teamId] : undefined,
 * });
 * ```
 */
export function connectSlackCredentials(
  connector: string,
  params: ConnectSlackCredentialsParams = {},
  options?: ConnectOptions
): SlackChannelCredentials {
  return {
    botToken: async (context: ConnectSlackCredentialsContext = {}) => {
      const { installationId: installationIdParam, ...tokenParams } = params;
      const installationId =
        typeof installationIdParam === 'function'
          ? await installationIdParam(context)
          : installationIdParam;
      return getToken(
        connector,
        {
          ...tokenParams,
          ...(installationId === undefined ? {} : { installationId }),
          subject: { type: 'app' },
        },
        options
      );
    },
    webhookVerifier: vercelOidc(),
  };
}
