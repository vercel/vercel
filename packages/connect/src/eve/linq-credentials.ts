import { vercelOidc } from 'eve/channels/auth';

import {
  getToken,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';

/** Linq channel credentials returned by {@link connectLinqCredentials}. */
export interface ConnectLinqCredentials {
  /** Short-lived API key for outbound Linq API calls. */
  apiKey: () => Promise<string>;
  /** Verifies webhooks forwarded by Vercel Connect. */
  webhookVerifier: ReturnType<typeof vercelOidc>;
}

/**
 * Token parameters accepted by {@link connectLinqCredentials}.
 *
 * Mirrors {@link ConnectTokenParams} from `@vercel/connect`, minus `subject`.
 * Linq credentials are app-scoped, so this helper always uses
 * `{ type: 'app' }`.
 */
export type ConnectLinqCredentialsParams = Omit<ConnectTokenParams, 'subject'>;

/**
 * Build Linq channel credentials backed by a Vercel Connect connector.
 *
 * The API-key resolver keeps token rotation delegated to Connect.
 * `webhookVerifier` validates the Vercel OIDC token Connect attaches after it
 * has verified and forwarded the provider webhook.
 *
 * ```ts
 * import { connectLinqCredentials } from '@vercel/connect/eve';
 * import { linqChannel } from 'eve/channels/linq';
 *
 * export default linqChannel({
 *   credentials: connectLinqCredentials('linq/my-agent'),
 * });
 * ```
 */
export function connectLinqCredentials(
  connector: string,
  params: ConnectLinqCredentialsParams = {},
  options?: ConnectOptions
): ConnectLinqCredentials {
  return {
    apiKey: () =>
      getToken(connector, { ...params, subject: { type: 'app' } }, options),
    webhookVerifier: vercelOidc(),
  };
}
