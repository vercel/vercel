/**
 * Better Auth adapter helper for `@vercel/connect`.
 *
 * {@link connect} returns a `GenericOAuthConfig` entry that drops
 * into `genericOAuth({ config: [...] })` from
 * `better-auth/plugins/generic-oauth`. Vercel Connect's OAuth client
 * authentication is non-standard — the "client secret" is a Vercel
 * OIDC token that has to be fetched per-request — so we override
 * `getToken` to inject the token endpoint Authorization header.
 *
 * ```ts
 * import { betterAuth } from "better-auth";
 * import { genericOAuth } from "better-auth/plugins/generic-oauth";
 * import { connect } from "@vercel/connect/betterauth";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     genericOAuth({
 *       config: [
 *         connect({
 *           providerId: "slack",
 *           connector: process.env.CONNECTOR_SLACK!,
 *         }),
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
import { getVercelOidcToken } from '@vercel/oidc';
import { getOAuth2Tokens, type OAuth2UserInfo } from 'better-auth/oauth2';
import type { GenericOAuthConfig } from 'better-auth/plugins/generic-oauth';
import { tryGetVercelTeamId, withTeamId } from '../internal/team-id.js';
import { ConnectError, createConnectErrorFromResponse } from '../token.js';

const CONNECT_AUTHORIZATION_URL = 'https://connect.vercel.com/oauth/authorize';
const CONNECT_TOKEN_URL = 'https://connect.vercel.com/oauth/token';
const CONNECT_USERINFO_URL = 'https://connect.vercel.com/oauth/userinfo';
const DEFAULT_SCOPES = ['openid', 'profile', 'email'] as const;

/** Options accepted by {@link connect}. */
export interface BetterAuthConnectOptions {
  /**
   * Provider id used by Better Auth's generic OAuth plugin (e.g.
   * `"slack"`). Surfaces in the sign-in URL and account
   * rows; pick something stable that names the upstream IdP.
   */
  readonly providerId: string;

  /**
   * Vercel Connect OAuth connector identifier. Accepts either the
   * opaque service connector key (`scl_...`) or the human-readable
   * UID (`oauth/mcp-linear-app`).
   */
  readonly connector: string;

  /**
   * Scopes to request. `offline_access` is added automatically so the
   * Vercel Connect side can mint refresh tokens. Defaults to
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
 * Builds a `GenericOAuthConfig` entry for Vercel Connect. Pass the
 * result into `genericOAuth({ config: [...] })`.
 */
export function connect(options: BetterAuthConnectOptions): GenericOAuthConfig {
  const fetchVercelToken = options.getVercelOidcToken ?? getVercelOidcToken;
  const scopes = Array.from(
    new Set([...(options.scopes ?? DEFAULT_SCOPES), 'offline_access'])
  );

  return {
    providerId: options.providerId,
    clientId: options.connector,
    // Best-effort: scope the Vercel Connect consent UI to the
    // deployment's Vercel team when we can read it from the OIDC
    // token. Falls back to the unqualified URL when the token isn't
    // present (e.g. running outside Vercel).
    authorizationUrl: withTeamId(
      CONNECT_AUTHORIZATION_URL,
      tryGetVercelTeamId()
    ),
    scopes,
    pkce: true,
    tokenUrl: CONNECT_TOKEN_URL,
    getToken: async ({ code, redirectURI, codeVerifier, deviceId }) => {
      const vercelToken = await fetchVercelToken();
      const credentials = `${encodeURIComponent(
        options.connector
      )}:${encodeURIComponent(vercelToken)}`;
      const basicAuth = btoa(credentials);

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectURI,
      });
      if (codeVerifier) body.set('code_verifier', codeVerifier);
      if (deviceId) body.set('device_id', deviceId);

      const response = await fetch(CONNECT_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          Authorization: `Basic ${basicAuth}`,
        },
        body: body.toString(),
      });
      if (!response.ok) {
        throw await createConnectErrorFromResponse(
          response,
          'Failed to exchange Vercel Connect authorization code'
        );
      }
      return getOAuth2Tokens(await response.json());
    },
    getUserInfo: async (tokens): Promise<OAuth2UserInfo | null> => {
      if (!tokens.accessToken) {
        throw new ConnectError(
          'Missing access token for Vercel Connect userinfo request',
          {
            code: 'missing_access_token',
          }
        );
      }
      const response = await fetch(CONNECT_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      if (!response.ok) {
        throw await createConnectErrorFromResponse(
          response,
          'Failed to fetch Vercel Connect user info'
        );
      }
      const user = (await response.json()) as {
        sub: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
      };
      return {
        id: user.sub,
        email: user.email,
        emailVerified: user.email_verified ?? false,
        name: user.name,
        image: user.picture,
      };
    },
  };
}
