import {
  getTokenResponse,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';
import { createConnectWebhookVerifier } from './webhook-verifier.js';
import type { ConnectLinqAdapterConfig } from './types.js';

/**
 * Token parameters accepted by {@link connectLinqAdapter}.
 *
 * Mirrors {@link ConnectTokenParams} from `@vercel/connect`, minus `subject`.
 * Linq credentials are app-scoped, so this helper always uses
 * `{ type: 'app' }`.
 */
export type ConnectLinqAdapterParams = Omit<ConnectTokenParams, 'subject'>;

/**
 * Build a Linq adapter config fragment backed by a Vercel Connect connector.
 *
 * Spread the result into `createLinqAdapter` from `@linqapp/chat-sdk-adapter`:
 *
 * ```ts
 * import { createLinqAdapter } from '@linqapp/chat-sdk-adapter';
 * import { connectLinqAdapter } from '@vercel/connect/chat';
 *
 * createLinqAdapter({
 *   ...connectLinqAdapter('linq/my-agent'),
 * });
 * ```
 *
 * Linq's SDK calls its Bearer credential `apiKey`; the lazy `credentials`
 * provider supplies the app-scoped Connect token through that field only when
 * the adapter needs it.
 *
 * Connect retains Linq's webhook signing secret and verifies trigger-forwarded
 * webhooks before attaching a Vercel OIDC token. `webhookVerifier` validates
 * that OIDC token, replacing Linq's native HMAC check.
 *
 * The optional `params` and `options` arguments mirror the signature of
 * {@link getTokenResponse}, allowing callers to pass through fields like
 * `installationId`, `scopes`, or `validityBufferMs`.
 */
export function connectLinqAdapter(
  connector: string,
  params: ConnectLinqAdapterParams = {},
  options?: ConnectOptions
): ConnectLinqAdapterConfig {
  return {
    credentials: async () => {
      const response = await getTokenResponse(
        connector,
        { ...params, subject: { type: 'app' } },
        options
      );
      return { apiKey: response.token };
    },
    webhookVerifier: createConnectWebhookVerifier(),
  };
}
