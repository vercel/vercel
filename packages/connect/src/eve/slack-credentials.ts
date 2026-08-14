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
export type ConnectSlackCredentialsParams = Omit<ConnectTokenParams, 'subject'>;

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
 * Multi-workspace deployments can select a specific workspace install
 * via `installationId`:
 *
 * ```ts
 * connectSlackCredentials("scl_...", { installationId: workspaceId });
 * ```
 */
export function connectSlackCredentials(
  connector: string,
  params: ConnectSlackCredentialsParams = {},
  options?: ConnectOptions
): SlackChannelCredentials {
  return {
    botToken: () =>
      getToken(connector, { ...params, subject: { type: 'app' } }, options),
    webhookVerifier: vercelOidc(),
  };
}
