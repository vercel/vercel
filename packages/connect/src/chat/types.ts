import type { ConnectWebhookVerifier } from './webhook-verifier.js';

/**
 * Function form of a Chat SDK adapter token field. The adapter invokes
 * it per API call, so it composes naturally with Vercel Connect's
 * short-lived tokens — each call returns a fresh token (the
 * `@vercel/connect` SDK caches and refreshes server-side).
 */
export type ConnectTokenResolver = () => Promise<string>;

/**
 * Partial Slack adapter config backed by Vercel Connect.
 *
 * Structurally matches the `botToken` and `webhookVerifier` options of
 * `createSlackAdapter` from `@chat-adapter/slack`, so callers spread it
 * into the factory without this subpath depending on `@chat-adapter/*`.
 */
export interface ConnectSlackAdapterConfig {
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
