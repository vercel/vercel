import type { ConnectOptions } from '../index.js';
import {
  createConnectSendblueConfig,
  type ConnectSendblueParams,
} from '../internal/sendblue-lines.js';
import type { ConnectSendblueAdapterConfig } from './types.js';
import { createConnectWebhookVerifier } from './webhook-verifier.js';

/**
 * Token parameters accepted by {@link connectSendblueAdapter}.
 *
 * Mirrors {@link ConnectTokenParams} from `@vercel/connect`, minus `subject`.
 * Sendblue account credentials are app-scoped, so this helper pins the subject
 * to `{ type: 'app' }`.
 */
export type ConnectSendblueAdapterParams = ConnectSendblueParams;

/**
 * Build a Sendblue adapter config fragment backed by a Vercel Connect
 * connector.
 *
 * Sendblue connectors issue a short-lived, line-scoped bearer token. The
 * returned `accessToken` resolver fetches that token for each adapter API
 * operation so Connect token rotation takes effect without rebuilding the
 * adapter. When the connector has one line, that line is selected
 * automatically; select a line explicitly when it has more than one. The
 * webhook verifier accepts Connect trigger-forwarded webhooks using Vercel
 * OIDC, replacing Sendblue's provider-native verification at the deployment
 * boundary.
 */
export function connectSendblueAdapter(
  connector: string,
  params: ConnectSendblueAdapterParams = {},
  options?: ConnectOptions
): ConnectSendblueAdapterConfig {
  return {
    ...createConnectSendblueConfig(connector, params, options),
    webhookVerifier: createConnectWebhookVerifier(),
  };
}
