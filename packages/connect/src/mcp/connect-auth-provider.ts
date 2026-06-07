import type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthTokens,
} from '@ai-sdk/mcp';
import { startAuthorization } from '../authorization.js';
import {
  ConnectorInstallationRequiredError,
  UserAuthorizationRequiredError,
  getTokenResponse,
  type ConnectTokenParams,
} from '../token.js';

/** Options accepted by {@link connectAuthProvider}. */
export interface ConnectAuthProviderOptions {
  /**
   * Override the Vercel OIDC token used to authenticate against the
   * Connect API. Defaults to the `@vercel/oidc` resolver used by the
   * rest of `@vercel/connect`. Useful for tests and non-Vercel
   * runtimes.
   *
   * Accepts a callback because the adapter is long-lived: `tokens()`
   * is invoked across many turns and refreshes, so a captured string
   * would go stale. When a function is provided it is resolved at
   * call time.
   */
  readonly vercelToken?: string | (() => string | Promise<string>);

  /**
   * Where to send the user after they finish granting access on
   * Connect's hosted consent page. Forwarded to Connect's
   * `startAuthorization` (as its `callbackUrl`) and also surfaced
   * through the MCP-spec `OAuthClientProvider.redirectUrl` getter.
   *
   * Defaults to an empty string — Connect then falls back to the
   * connector's server-side registered redirect.
   */
  readonly redirectUrl?: string;

  /**
   * Request the device-authorization flow when minting a consent
   * challenge. When `true`, Connect returns a `deviceCode` (and
   * `expiresAt`) on the {@link ConsentChallenge} for out-of-band /
   * headless approval. Defaults to `false`.
   */
  readonly deviceCode?: boolean;

  /**
   * Called when Vercel Connect reports that the user has not yet
   * authorized the connector. The caller decides how to surface the
   * consent URL — `redirect()`, throw a typed error, emit a custom
   * UI chunk, etc. If omitted, `connectAuthProvider` throws
   * {@link ConsentRequiredError}.
   */
  readonly onConsentRequired?: (
    challenge: ConsentChallenge
  ) => void | Promise<void>;
}

/**
 * Returned to {@link ConnectAuthProviderOptions.onConsentRequired} (or
 * raised inside {@link ConsentRequiredError}) when Connect has no
 * cached grant for the configured subject and the caller must surface
 * the consent URL.
 */
export interface ConsentChallenge {
  readonly connector: string;
  readonly subject: ConnectTokenParams['subject'];
  /** Consent URL to redirect the user to. */
  readonly url: string;
  readonly request: string;
  readonly verifier: string;
  /**
   * Device code to display to the user when Connect issues a
   * device-flow authorization. Present only when the connector uses
   * device flow.
   */
  readonly deviceCode?: string;
  /** Epoch-ms expiry of the consent challenge, when Connect reports one. */
  readonly expiresAt?: number;
}

/**
 * Thrown by the {@link connectAuthProvider} default
 * `onConsentRequired` handler when the user has no Connect grant for
 * the configured subject. Catch at the boundary
 * (`route handler` / `streamText` call site) and redirect to
 * `error.url`.
 */
export class ConsentRequiredError extends Error {
  readonly name = 'ConsentRequiredError';
  readonly connector: string;
  readonly subject: ConnectTokenParams['subject'];
  readonly url: string;
  readonly request: string;
  readonly verifier: string;
  readonly deviceCode?: string;
  readonly expiresAt?: number;

  constructor(challenge: ConsentChallenge) {
    super(
      `Vercel Connect: user authorization required for connector "${challenge.connector}". Redirect the user to challenge.url to grant access.`
    );
    this.connector = challenge.connector;
    this.subject = challenge.subject;
    this.url = challenge.url;
    this.request = challenge.request;
    this.verifier = challenge.verifier;
    this.deviceCode = challenge.deviceCode;
    this.expiresAt = challenge.expiresAt;
  }
}

const EMPTY_CLIENT_METADATA: OAuthClientMetadata = {
  redirect_uris: [],
};

/**
 * Builds an MCP-spec {@link OAuthClientProvider} backed by Vercel
 * Connect. The returned object delegates `tokens()` to
 * {@link getTokenResponse} and `redirectToAuthorization` to
 * {@link startAuthorization}. Connect owns client registration, PKCE,
 * state, and the callback handshake server-side, so most of the
 * `OAuthClientProvider` surface is intentionally a no-op.
 *
 * @param connector Vercel Connect connector UID (e.g. `oauth/linear`)
 *   or opaque connector id.
 * @param params Token request parameters — always specify a
 *   `subject`; the three subject types
 *   (`'app'` / `'user'` / `'jwt-bearer'`) have distinct security
 *   semantics.
 * @param options Optional adapter behavior overrides.
 */
export function connectAuthProvider(
  connector: string,
  params: ConnectTokenParams,
  options?: ConnectAuthProviderOptions
): OAuthClientProvider {
  const redirectUrl = options?.redirectUrl ?? '';

  async function resolveVercelToken(): Promise<string | undefined> {
    const { vercelToken } = options ?? {};
    if (typeof vercelToken === 'function') {
      return vercelToken();
    }
    return vercelToken;
  }

  return {
    async tokens(): Promise<OAuthTokens | undefined> {
      try {
        const vercelToken = await resolveVercelToken();
        const response = await getTokenResponse(
          connector,
          params,
          vercelToken !== undefined ? { vercelToken } : undefined
        );
        const expiresInSeconds = Math.max(
          1,
          Math.floor((response.expiresAt - Date.now()) / 1000)
        );
        return {
          access_token: response.token,
          token_type: 'Bearer',
          expires_in: expiresInSeconds,
        };
      } catch (err) {
        if (err instanceof UserAuthorizationRequiredError) {
          // Returning undefined lets the MCP transport's auth()
          // orchestrator trigger redirectToAuthorization below,
          // where we surface the Connect consent URL.
          return undefined;
        }
        if (err instanceof ConnectorInstallationRequiredError) {
          // Configuration problem, not a per-user issue. Surface
          // immediately rather than masking as a consent challenge.
          throw err;
        }
        throw err;
      }
    },

    async redirectToAuthorization(_authorizationUrl: URL): Promise<void> {
      // The URL argument is the MCP server's discovered authorization
      // endpoint. We ignore it — Connect has its own consent URL
      // backed by the connector's registered OAuth client.
      const vercelToken = await resolveVercelToken();
      const response = await startAuthorization(connector, params, {
        ...(vercelToken !== undefined && { vercelToken }),
        // Forward the post-consent return URL so the user lands back
        // in the app. Falsy (the default empty string) => Connect uses
        // the connector's registered redirect.
        ...(redirectUrl && { callbackUrl: redirectUrl }),
        ...(options?.deviceCode && { deviceCode: true }),
      });
      const challenge: ConsentChallenge = {
        connector,
        subject: params.subject,
        url: response.url,
        request: response.request,
        verifier: response.verifier,
        deviceCode: response.deviceCode,
        expiresAt: response.expiresAt,
      };
      if (options?.onConsentRequired) {
        await options.onConsentRequired(challenge);
        return;
      }
      throw new ConsentRequiredError(challenge);
    },

    saveTokens(_tokens: OAuthTokens): void {
      // No-op: Connect owns token persistence server-side. The
      // in-memory LRU cache in @vercel/connect's token module
      // handles per-request reuse.
    },

    saveCodeVerifier(_codeVerifier: string): void {
      // No-op: Connect owns PKCE.
    },

    codeVerifier(): string {
      // The MCP transport never reaches this when tokens() /
      // redirectToAuthorization are wired correctly. If a future
      // transport change starts calling it, throw loudly rather
      // than fabricate a bogus verifier.
      throw new Error(
        '@vercel/connect: OAuthClientProvider.codeVerifier() is unsupported. Vercel Connect owns the PKCE flow server-side; this method should never be invoked by a correctly-configured MCP transport.'
      );
    },

    get redirectUrl(): string {
      // Same value forwarded to Connect as the post-consent return
      // URL. Surfaced here to satisfy the OAuthClientProvider
      // contract; the standard flow that reads it is never triggered.
      return redirectUrl;
    },

    get clientMetadata(): OAuthClientMetadata {
      // Returned only during dynamic client registration, which we
      // never trigger. A minimal but valid value satisfies the
      // contract.
      return EMPTY_CLIENT_METADATA;
    },

    clientInformation(): OAuthClientInformation {
      // The connector UID stands in as the logical client id. The
      // MCP transport uses this for cache keys and debug output;
      // tying it to the Connect identifier is more useful than
      // returning a synthetic value.
      return { client_id: connector };
    },
  };
}
