import {
  getToken,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';

/** Lazy Resend API-key provider returned by {@link connectResendApiKey}. */
export type ConnectResendApiKeyProvider = () => Promise<string>;

/**
 * Token parameters accepted by {@link connectResendApiKey}.
 *
 * Mirrors {@link ConnectTokenParams} from `@vercel/connect`, minus `subject` —
 * Resend API keys are app-scoped, so this helper pins the subject to
 * `{ type: "app" }`.
 */
export type ConnectResendApiKeyParams = Omit<ConnectTokenParams, 'subject'>;

/**
 * Build a lazy Resend API-key provider backed by a Vercel Connect connector.
 *
 * The helper is compatible with the `apiKey` callback accepted by
 * `@resend/chat-sdk-adapter`. The connector may be a generic API-key connector
 * for `api.resend.com`; callers do not need a native Resend connector type.
 *
 * ```ts
 * import { connectResendApiKey } from '@vercel/connect/eve';
 * import { createResendAdapter } from '@resend/chat-sdk-adapter';
 *
 * const resend = createResendAdapter({
 *   apiKey: connectResendApiKey('api-key/resend-my-agent'),
 *   fromAddress: 'agent@example.com',
 * });
 * ```
 */
export function connectResendApiKey(
  connector: string,
  params: ConnectResendApiKeyParams = {},
  options?: ConnectOptions
): ConnectResendApiKeyProvider {
  return () =>
    getToken(connector, { ...params, subject: { type: 'app' } }, options);
}
