import {
  getToken,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';
import type { ConnectGitHubAdapterConfig } from './types.js';
import { createConnectWebhookVerifier } from './webhook-verifier.js';

/**
 * Token parameters accepted by {@link connectGitHubAdapter}.
 *
 * Mirrors {@link ConnectTokenParams} from `@vercel/connect`, minus
 * `subject` — the helper acts as the application itself, so `subject`
 * is pinned to `{ type: "app" }` and cannot be overridden. (The issued
 * GitHub credential is an installation-scoped access token.)
 */
export type ConnectGitHubAdapterParams = Omit<ConnectTokenParams, 'subject'>;

/**
 * Build a GitHub adapter config fragment backed by a Vercel Connect
 * connector that stores a GitHub installation access token.
 *
 * Spread the result into `createGitHubAdapter` from
 * `@chat-adapter/github`:
 *
 * ```ts
 * import { createGitHubAdapter } from "@chat-adapter/github";
 * import { connectGitHubAdapter } from "@vercel/connect/chat";
 *
 * createGitHubAdapter({
 *   ...connectGitHubAdapter("github/acme-github"),
 *   userName: "my-bot[bot]",
 * });
 * ```
 *
 * The returned `installationToken` is the installation access token a
 * GitHub App would normally mint via its private-key JWT exchange — the
 * adapter uses it directly and skips that exchange. The token is a
 * function form so rotation, refresh, and installation tenancy stay
 * delegated to Vercel Connect.
 *
 * `webhookVerifier` validates Connect trigger-forwarded webhooks via the
 * Vercel OIDC token Connect attaches, replacing GitHub's webhook-secret
 * check.
 *
 * The optional `params` and `options` arguments mirror the signature of
 * {@link getToken}, allowing callers to pass through fields like
 * `installationId`, `scopes`, or `validityBufferMs`.
 */
export function connectGitHubAdapter(
  connector: string,
  params: ConnectGitHubAdapterParams = {},
  options?: ConnectOptions
): ConnectGitHubAdapterConfig {
  return {
    installationToken: () =>
      getToken(connector, { ...params, subject: { type: 'app' } }, options),
    webhookVerifier: createConnectWebhookVerifier(),
  };
}
