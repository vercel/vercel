import type { GitHubChannelCredentials } from 'eve/channels/github';

import { vercelOidc } from 'eve/channels/auth';

import {
  getConnectorMetadata,
  getToken,
  type ConnectOptions,
  type ConnectTokenParams,
} from '../index.js';

/**
 * Token parameters accepted by {@link connectGitHubCredentials}.
 *
 * Mirrors {@link ConnectTokenParams} from `@vercel/connect`, minus
 * `subject` — GitHub installation tokens are app-scoped, so `subject`
 * is pinned to `{ type: "app" }` by this helper and cannot be
 * overridden.
 */
export type ConnectGitHubCredentialsParams = Omit<
  ConnectTokenParams,
  'subject'
>;

/**
 * Build {@link GitHubChannelCredentials} backed by a Vercel Connect
 * connector that stores a GitHub installation access token.
 *
 * Eve uses `installationToken` directly for authenticated GitHub API
 * calls and skips its native GitHub App JWT exchange. The token is a
 * function form so rotation, refresh, and multi-installation tenancy
 * stay delegated to Vercel Connect.
 *
 * The webhook verifier accepts Connect-forwarded webhooks authenticated
 * with Vercel OIDC instead of GitHub's webhook secret.
 *
 * `appSlug` resolves the GitHub App slug from the connector's metadata,
 * so `githubChannel` can derive its invocation token (`botName`) without
 * extra configuration when `botName` is not set.
 */
export function connectGitHubCredentials(
  connector: string,
  params: ConnectGitHubCredentialsParams = {},
  options?: ConnectOptions
): GitHubChannelCredentials {
  return {
    appSlug: () => getGitHubAppSlug(connector, options),
    installationToken: () =>
      getToken(connector, { ...params, subject: { type: 'app' } }, options),
    webhookVerifier: vercelOidc(),
  };
}

async function getGitHubAppSlug(
  connector: string,
  options?: ConnectOptions
): Promise<string> {
  const metadata = await getConnectorMetadata(connector, options);
  const appSlug = metadata.vendor.appSlug;
  if (typeof appSlug !== 'string' || appSlug.length === 0) {
    throw new Error(
      `Vercel Connect connector ${connector} did not return a GitHub App slug.`
    );
  }
  return appSlug;
}
