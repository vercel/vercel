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
 * Credentials resolved lazily by the Linq Chat SDK adapter.
 *
 * Structurally matches the return value of its `credentials` option.
 */
export interface ConnectLinqCredentials {
  apiKey: string;
}

/**
 * Partial Linq adapter config backed by Vercel Connect.
 *
 * Structurally matches the `credentials` and `webhookVerifier` options of
 * `createLinqAdapter` from `@linqapp/chat-sdk-adapter`.
 */
export interface ConnectLinqAdapterConfig {
  credentials: () => Promise<ConnectLinqCredentials>;
  webhookVerifier: (
    request: Request,
    rawBody: Uint8Array
  ) => Promise<unknown> | unknown;
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

/**
 * Partial Telegram adapter config backed by Vercel Connect.
 *
 * Structurally matches the `botToken` option of `createTelegramAdapter` from
 * `@chat-adapter/telegram`. Telegram webhooks continue to use native secret
 * token verification and are not part of this config fragment.
 */
export interface ConnectTelegramAdapterConfig {
  botToken: ConnectTokenResolver;
}

/**
 * Partial Sendblue adapter config backed by Vercel Connect.
 *
 * Structurally matches the `accessToken` and `webhookVerifier` options of
 * `createSendblueAdapter` from `chat-adapter-sendblue`.
 */
export interface ConnectSendblueAdapterConfig {
  accessToken: ConnectTokenResolver;
  defaultFromNumber: string | (() => Promise<string>);
  allowedFromNumbers: readonly string[] | (() => Promise<readonly string[]>);
  webhookVerifier: ConnectWebhookVerifier;
}
