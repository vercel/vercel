import type { ConnectWebhookVerifier } from './webhook-verifier.js';

/**
 * Function form of a Chat SDK adapter token field. The adapter invokes
 * it per API call, so it composes naturally with Vercel Connect's
 * short-lived tokens — each call returns a fresh token (the
 * `@vercel/connect` SDK caches and refreshes server-side).
 */
export type ConnectTokenResolver = () => Promise<string>;

/**
 * Partial Discord adapter config backed by Vercel Connect.
 *
 * Structurally matches the `applicationId`, `botToken`, and
 * `webhookVerifier` options of `createDiscordAdapter` from
 * `@chat-adapter/discord`.
 */
export interface ConnectDiscordAdapterConfig {
  applicationId: ConnectTokenResolver;
  botToken: ConnectTokenResolver;
  webhookVerifier: ConnectWebhookVerifier;
}

/**
 * Partial GitHub adapter config backed by Vercel Connect.
 *
 * Structurally matches the `installationToken` and `webhookVerifier`
 * options of `createGitHubAdapter` from `@chat-adapter/github`.
 */
export interface ConnectGitHubAdapterConfig {
  installationToken: ConnectTokenResolver;
  webhookVerifier: ConnectWebhookVerifier;
}

/**
 * Partial Linear adapter config backed by Vercel Connect.
 *
 * Structurally matches the `accessToken` and `webhookVerifier` options
 * of `createLinearAdapter` from `@chat-adapter/linear`.
 */
export interface ConnectLinearAdapterConfig {
  accessToken: ConnectTokenResolver;
  webhookVerifier: ConnectWebhookVerifier;
}

/**
 * Partial Notion adapter config backed by Vercel Connect.
 *
 * Structurally matches the `token` option of `createNotionAdapter` from
 * `@chat-adapter/notion`. Notion webhooks continue to use native HMAC
 * verification and are not part of this config fragment.
 */
export interface ConnectNotionAdapterConfig {
  token: ConnectTokenResolver;
}
