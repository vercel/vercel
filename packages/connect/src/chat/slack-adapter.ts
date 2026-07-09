import type { SlackAdapterConfig } from '@chat-adapter/slack';

import {
  getToken,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';
import { createConnectWebhookVerifier } from './webhook-verifier.js';

/**
 * Token parameters accepted by {@link connectSlackAdapter}.
 *
 * Mirrors {@link ConnectTokenParams} from `@vercel/connect`, minus
 * `subject` — Slack bot tokens are always app-scoped, so `subject`
 * is pinned to `{ type: "app" }` by this helper and cannot be
 * overridden.
 */
export type ConnectSlackAdapterParams = Omit<ConnectTokenParams, 'subject'>;

/**
 * Slack adapter config fragment produced by {@link connectSlackAdapter}.
 *
 * Derived from `@chat-adapter/slack`'s `SlackAdapterConfig` so the helper's
 * output is type-checked against the real adapter config at compile time.
 * `@chat-adapter/slack` is an optional peer dependency used for types only —
 * there is no runtime dependency on the Chat SDK.
 */
export type ConnectSlackAdapterConfig = Required<
  Pick<SlackAdapterConfig, 'botToken' | 'webhookVerifier'>
>;

/**
 * Build a Slack adapter config fragment backed by a Vercel Connect
 * connector that stores a Slack workspace's bot token.
 *
 * Spread the result into `createSlackAdapter` from `@chat-adapter/slack`:
 *
 * ```ts
 * import { createSlackAdapter } from "@chat-adapter/slack";
 * import { connectSlackAdapter } from "@vercel/connect/chat";
 *
 * createSlackAdapter({
 *   ...connectSlackAdapter("slack/acme-slack"),
 *   userName: "my-bot",
 * });
 * ```
 *
 * The returned `botToken` is a function form, invoked once per Slack
 * API call so the adapter always picks up a fresh token from Vercel
 * Connect (rotation, refresh, and multi-workspace tenancy are handled
 * server-side). Slack bot tokens are app-scoped — one token per
 * workspace install — so this helper calls Vercel Connect with
 * `subject: { type: "app" }`.
 *
 * `webhookVerifier` validates Connect trigger-forwarded webhooks via the
 * Vercel OIDC token Connect attaches, replacing Slack's signing-secret
 * check. Omit `signingSecret` / `SLACK_SIGNING_SECRET` when using this.
 *
 * The optional `params` and `options` arguments mirror the signature of
 * {@link getToken}, allowing callers to pass through fields like
 * `installationId`, `scopes`, or `validityBufferMs`.
 */
export function connectSlackAdapter(
  connector: string,
  params: ConnectSlackAdapterParams = {},
  options?: ConnectOptions
): ConnectSlackAdapterConfig {
  return {
    botToken: () =>
      getToken(connector, { ...params, subject: { type: 'app' } }, options),
    webhookVerifier: createConnectWebhookVerifier(),
  };
}
