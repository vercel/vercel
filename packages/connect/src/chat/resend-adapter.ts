import {
  getToken,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';
import type { ConnectTokenResolver } from './types.js';
import {
  createConnectWebhookVerifier,
  type ConnectWebhookVerifier,
} from './webhook-verifier.js';

/** Token parameters accepted by {@link connectResendAdapter}. */
export type ConnectResendAdapterParams = Omit<ConnectTokenParams, 'subject'>;

/** Resend Chat SDK adapter fields backed by Vercel Connect. */
export interface ConnectResendAdapterConfig {
  apiKey: ConnectTokenResolver;
  webhookVerifier: ConnectWebhookVerifier;
}

/**
 * Build a Resend adapter config fragment backed by an app-scoped Vercel
 * Connect connector. Connect supplies the API key and authenticates forwarded
 * webhooks, so the deployment needs neither Resend credential in its env.
 */
export function connectResendAdapter(
  connector: string,
  params: ConnectResendAdapterParams = {},
  options?: ConnectOptions
): ConnectResendAdapterConfig {
  return {
    apiKey: () =>
      getToken(connector, { ...params, subject: { type: 'app' } }, options),
    webhookVerifier: createConnectWebhookVerifier(),
  };
}
