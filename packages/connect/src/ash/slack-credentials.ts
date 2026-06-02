import type { SlackChannelCredentials } from 'experimental-ash/channels/slack';

import { getToken } from '../index.js';
import { vercelOidc } from 'experimental-ash/channels/auth';

/**
 * Build {@link SlackChannelCredentials} backed by a Vercel Connect
 * connector that stores a Slack workspace's bot token.
 *
 * The returned `botToken` is a function form, invoked once per
 * inbound webhook so the chat adapter always picks up a fresh token
 * from Vercel Connect (rotation, refresh, multi-workspace tenancy
 * are all handled server-side).
 *
 * Slack bot tokens are app-scoped — one token per workspace install,
 * shared across every end-user — so this helper calls Vercel Connect
 * with `subject: { type: "app" }`. End-user identity (per-user OAuth
 * into Slack) is a separate concern handled elsewhere.
 *
 * ```ts
 * import { slackRoute } from "experimental-ash/channels/slack";
 * import { connectSlackCredentials } from "@vercel/connect/ash";
 *
 * export default slackRoute({
 *   credentials: connectSlackCredentials("scl_..."),
 * });
 * ```
 */
export function connectSlackCredentials(
  connector: string
): SlackChannelCredentials {
  return {
    botToken: () => getToken(connector, { subject: { type: 'app' } }),
    webhookVerifier: vercelOidc(),
  };
}
