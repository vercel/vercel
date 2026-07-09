import {
  getToken,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';
import type { ConnectLinearAdapterConfig } from './types.js';
import { createConnectWebhookVerifier } from './webhook-verifier.js';

/**
 * Token parameters accepted by {@link connectLinearAdapter}.
 *
 * Mirrors {@link ConnectTokenParams} from `@vercel/connect`, minus
 * `subject` — Linear app tokens are app-scoped, so `subject` is pinned
 * to `{ type: "app" }` by this helper and cannot be overridden.
 */
export type ConnectLinearAdapterParams = Omit<ConnectTokenParams, 'subject'>;

/**
 * Build a Linear adapter config fragment backed by a Vercel Connect
 * connector that stores a Linear app access token.
 *
 * Spread the result into `createLinearAdapter` from
 * `@chat-adapter/linear`:
 *
 * ```ts
 * import { createLinearAdapter } from "@chat-adapter/linear";
 * import { connectLinearAdapter } from "@vercel/connect/chat";
 *
 * createLinearAdapter({
 *   ...connectLinearAdapter("linear/acme-linear"),
 *   mode: "agent-sessions",
 * });
 * ```
 *
 * The returned `accessToken` is the token the adapter uses for Linear
 * GraphQL calls. It is a function form so rotation, refresh, and
 * multi-workspace tenancy stay delegated to Vercel Connect.
 *
 * `webhookVerifier` validates Connect trigger-forwarded webhooks via the
 * Vercel OIDC token Connect attaches, replacing Linear's
 * webhook-secret check.
 *
 * The optional `params` and `options` arguments mirror the signature of
 * {@link getToken}, allowing callers to pass through fields like
 * `installationId`, `scopes`, or `validityBufferMs`.
 */
export function connectLinearAdapter(
  connector: string,
  params: ConnectLinearAdapterParams = {},
  options?: ConnectOptions
): ConnectLinearAdapterConfig {
  return {
    accessToken: () =>
      getToken(connector, { ...params, subject: { type: 'app' } }, options),
    webhookVerifier: createConnectWebhookVerifier(),
  };
}
