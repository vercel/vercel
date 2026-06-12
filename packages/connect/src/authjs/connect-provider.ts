/**
 * Auth.js (NextAuth core) adapter helper for `@vercel/connect`.
 *
 * {@link connect} returns an `OAuth2Config` provider entry for use
 * in `AuthConfig.providers`. Vercel Connect's OAuth client
 * authentication is non-standard — the "client secret" is a
 * per-request Vercel OIDC token — so we declare
 * `token_endpoint_auth_method: "none"` and inject the token endpoint
 * Authorization header via the `customFetch` symbol.
 *
 * ```ts
 * import type { AuthConfig } from "@auth/core";
 * import { connect } from "@vercel/connect/authjs";
 *
 * export const authConfig: AuthConfig = {
 *   providers: [
 *     connect({
 *       id: "slack",
 *       name: "Slack",
 *       connector: process.env.CONNECTOR_SLACK!,
 *     }),
 *   ],
 * };
 * ```
 */
import { customFetch } from '@auth/core';
import type { OAuth2Config } from '@auth/core/providers';
import { getVercelOidcToken } from '@vercel/oidc';
import { tryGetVercelTeamId, withTeamId } from '../internal/team-id.js';

const CONNECT_AUTHORIZATION_URL = 'https://connect.vercel.com/oauth/authorize';
const CONNECT_TOKEN_URL = 'https://connect.vercel.com/oauth/token';
const CONNECT_USERINFO_URL = 'https://connect.vercel.com/oauth/userinfo';
const DEFAULT_SCOPES = ['openid', 'profile', 'email'] as const;

/** Userinfo payload returned by Vercel Connect's OIDC userinfo endpoint. */
export interface ConnectProfile {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/** Options accepted by {@link connect}. */
export interface AuthJsConnectOptions {
  /**
   * Provider id surfaced by Auth.js (e.g. `"slack-via-connect"`).
   * Becomes the path segment in callback URLs and the `provider`
   * field on accounts.
   */
  readonly id: string;

  /** Human-readable display name used by Auth.js sign-in UIs. */
  readonly name: string;

  /**
   * Vercel Connect OAuth connector identifier. Accepts either the
   * opaque service connector key (`scl_...`) or the human-readable
   * UID (`oauth/mcp-linear-app`).
   */
  readonly connector: string;

  /**
   * Scopes to request. `offline_access` is added automatically so
   * the Vercel Connect side can mint refresh tokens. Defaults to
   * `["openid", "profile", "email"]`.
   */
  readonly scopes?: readonly string[];

  /**
   * Override the Vercel OIDC token fetcher. Defaults to
   * {@link getVercelOidcToken} from `@vercel/oidc`. Useful for tests
   * or non-Vercel runtimes that mint the OIDC token differently.
   */
  readonly getVercelOidcToken?: () => Promise<string>;
}

/**
 * Builds an Auth.js `OAuth2Config` for Vercel Connect. Push the
 * result into `AuthConfig.providers`.
 */
export function connect(
  options: AuthJsConnectOptions
): OAuth2Config<ConnectProfile> {
  const fetchVercelToken = options.getVercelOidcToken ?? getVercelOidcToken;
  const scope = Array.from(
    new Set([...(options.scopes ?? DEFAULT_SCOPES), 'offline_access'])
  ).join(' ');

  return {
    id: options.id,
    name: options.name,
    type: 'oauth',
    clientId: options.connector,
    // The token endpoint expects client_secret_basic, but the secret
    // is a Vercel OIDC token that has to be fetched per-request. We
    // rely on the customFetch hook below to inject the token endpoint
    // Authorization header.
    client: { token_endpoint_auth_method: 'none' },
    authorization: {
      // Best-effort: scope the Vercel Connect consent UI to the
      // deployment's Vercel team when we can read it from the OIDC
      // token. Falls back to the unqualified URL when the token isn't
      // present (e.g. running outside Vercel).
      url: withTeamId(CONNECT_AUTHORIZATION_URL, tryGetVercelTeamId()),
      params: { scope },
    },
    token: CONNECT_TOKEN_URL,
    userinfo: CONNECT_USERINFO_URL,
    checks: ['pkce'],
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email ?? null,
        image: profile.picture,
      };
    },
    [customFetch]: async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      if (url.startsWith(CONNECT_TOKEN_URL)) {
        const vercelToken = await fetchVercelToken();
        const credentials = `${encodeURIComponent(
          options.connector
        )}:${encodeURIComponent(vercelToken)}`;
        const headers = new Headers(init?.headers);
        headers.set('authorization', `Basic ${btoa(credentials)}`);
        return fetch(input, { ...init, headers });
      }

      return fetch(input, init);
    },
  };
}
