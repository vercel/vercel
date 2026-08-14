import type { LinearChannelCredentials } from 'eve/channels/linear';

import { vercelOidc } from 'eve/channels/auth';

import {
  getToken,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';

/**
 * Token parameters accepted by {@link connectLinearCredentials}.
 *
 * Mirrors {@link ConnectTokenParams} from `@vercel/connect`, minus
 * `subject` — Linear Agent tokens are app-scoped, so `subject` is
 * pinned to `{ type: "app" }` by this helper and cannot be overridden.
 */
export type ConnectLinearCredentialsParams = Omit<
  ConnectTokenParams,
  'subject'
>;

/**
 * Build {@link LinearChannelCredentials} backed by a Vercel Connect
 * connector that stores a Linear app access token.
 *
 * Eve uses `accessToken` for Linear GraphQL calls. The token is a
 * function form so rotation, refresh, and multi-workspace tenancy stay
 * delegated to Vercel Connect.
 *
 * The webhook verifier accepts Connect-forwarded webhooks authenticated
 * with Vercel OIDC instead of Linear's webhook secret.
 */
export function connectLinearCredentials(
  connector: string,
  params: ConnectLinearCredentialsParams = {},
  options?: ConnectOptions
): LinearChannelCredentials {
  return {
    accessToken: () =>
      getToken(connector, { ...params, subject: { type: 'app' } }, options),
    webhookVerifier: vercelOidc(),
  };
}
