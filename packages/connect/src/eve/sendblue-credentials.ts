import type { ConnectOptions } from '../index.js';
import {
  createConnectSendblueConfig,
  type ConnectSendblueParams,
} from '../internal/sendblue-lines.js';
import { vercelOidc } from 'eve/channels/auth';

/** Managed Sendblue channel credentials returned by {@link connectSendblueCredentials}. */
export interface ConnectSendblueCredentials {
  /** Short-lived bearer token for outbound Sendblue API calls. */
  accessToken: () => Promise<string>;
  /** Default managed Sendblue line. */
  defaultFromNumber: () => Promise<string>;
  /** Every Sendblue line authorized for this connector. */
  allowedFromNumbers: () => Promise<readonly string[]>;
  /** Verifies webhooks forwarded by Vercel Connect. */
  webhookVerifier: ReturnType<typeof vercelOidc>;
}

/** Token parameters accepted by {@link connectSendblueCredentials}. */
export type ConnectSendblueCredentialsParams = ConnectSendblueParams;

/**
 * Builds managed Sendblue channel credentials backed by a Vercel Connect
 * connector. The access-token resolver and managed line resolvers keep token
 * rotation and line selection delegated to Connect. Vercel OIDC verifies
 * Connect-forwarded webhooks.
 */
export function connectSendblueCredentials(
  connector: string,
  params: ConnectSendblueCredentialsParams = {},
  options?: ConnectOptions
): ConnectSendblueCredentials {
  return {
    ...createConnectSendblueConfig(connector, params, options),
    webhookVerifier: vercelOidc(),
  };
}
