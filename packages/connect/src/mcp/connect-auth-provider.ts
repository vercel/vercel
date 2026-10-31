import { startAuthorization } from '../authorization.js';
import {
  UserAuthorizationRequiredError,
  getTokenResponse,
  type ConnectTokenParams,
} from '../token.js';

/**
 * OAuth token set as consumed by MCP client transports (RFC 6749 §5.1).
 * Structurally identical to `OAuthTokens` in both `@ai-sdk/mcp` and
 * `@modelcontextprotocol/sdk`; declared here so this module has no
 * type dependency on either package.
 */
export interface ConnectOAuthTokens {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
  id_token?: string;
}

/**
 * Minimal OAuth client metadata (RFC 7591 §2). Only consulted by MCP
 * transports during dynamic client registration, which the Connect
 * adapter never triggers.
 */
export interface ConnectOAuthClientMetadata {
  redirect_uris: string[];
}

/** OAuth client identity reported to MCP transports. */
export interface ConnectOAuthClientInformation {
  client_id: string;
}

/**
 * Structural mirror of the official SDK's `OAuthDiscoveryState`: the
 * result of RFC 9728 protected-resource discovery plus authorization
 * server metadata. {@link connectAuthProvider} returns a fixed state
 * naming Connect as the authorization server so the SDK never performs
 * network discovery; see {@link CONNECT_DISCOVERY_STATE}.
 */
export interface ConnectOAuthDiscoveryState {
  authorizationServerUrl: string;
  authorizationServerMetadata: {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    response_types_supported: string[];
    code_challenge_methods_supported: string[];
  };
  resourceMetadata: {
    resource: string;
    authorization_servers: string[];
  };
}

/**
 * The MCP-spec `OAuthClientProvider` members implemented by
 * {@link connectAuthProvider}.
 *
 * This is the intersection of the required surface of
 * `OAuthClientProvider` from `@ai-sdk/mcp` and from the official
 * `@modelcontextprotocol/sdk` (`client/auth.js`), so a value of this
 * type is assignable to either interface without a cast. The optional
 * members those interfaces declare (`state`, `invalidateCredentials`,
 * `addClientAuthentication`, `prepareTokenRequest`, discovery-state
 * hooks, …) are deliberately omitted: Connect owns registration, PKCE,
 * refresh, and storage server-side, and declaring them here would tie
 * this type to one SDK's parameter types. The test suite asserts
 * assignability against both SDKs.
 *
 * The exceptions are the three discovery hooks at the bottom. They
 * are optional in the official SDK's interface and absent from
 * `@ai-sdk/mcp`'s, and are implemented here so the official SDK's
 * `auth()` never fetches discovery documents from URLs chosen by the
 * MCP server's `WWW-Authenticate` header (a blind-SSRF vector when
 * the configured server is compromised). Connect is the authorization
 * server from this adapter's point of view, so there is nothing to
 * discover.
 */
export interface ConnectOAuthClientProvider {
  tokens(): Promise<ConnectOAuthTokens | undefined>;
  saveTokens(tokens: ConnectOAuthTokens): void;
  redirectToAuthorization(authorizationUrl: URL): Promise<void>;
  saveCodeVerifier(codeVerifier: string): void;
  codeVerifier(): string;
  get redirectUrl(): string;
  get clientMetadata(): ConnectOAuthClientMetadata;
  clientInformation(): ConnectOAuthClientInformation;
  discoveryState(): ConnectOAuthDiscoveryState;
  saveDiscoveryState(state: unknown): void;
  validateResourceURL(
    serverUrl: string | URL,
    resource?: string
  ): Promise<URL | undefined>;
}

/**
 * How {@link connectAuthProvider} surfaces a missing Connect grant.
 *
 * - `'transport'` (default) — `tokens()` returns `undefined` and the
 *   MCP transport's own 401 → `auth()` orchestrator eventually calls
 *   `redirectToAuthorization`, where the Connect consent URL is
 *   raised. This is the MCP-spec contract and works with every
 *   transport in `@ai-sdk/mcp` and `@modelcontextprotocol/sdk`.
 * - `'eager'` — `tokens()` itself raises the consent challenge, before
 *   any request reaches the MCP server. Connect authoritatively knows
 *   whether a grant exists, so this skips the transport's
 *   protected-resource discovery round-trips and surfaces the
 *   challenge on the very first request (the MCP `initialize`
 *   handshake) instead of mid-run inside a tool call.
 *
 *   **Streamable HTTP only.** The official SDK's
 *   `StreamableHTTPClientTransport` (and `@ai-sdk/mcp`'s HTTP
 *   transport) call `tokens()` per request and let a throw propagate
 *   to the caller. The official `SSEClientTransport` instead calls
 *   `tokens()` inside the `fetch` it hands to its EventSource, which
 *   treats any throw as a retryable network error: the consent error
 *   is flattened to a cause-less `SseError` and the EventSource
 *   reconnects every few seconds, minting a new Connect authorization
 *   request each time, until the transport is closed. Never combine
 *   `'eager'` with an SSE transport; `connectMCPTransport` in
 *   `@vercel/connect/tanstack-ai` selects the mode per transport type
 *   for you.
 */
export type ConnectConsentMode = 'transport' | 'eager';

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
   * When omitted, Connect falls back to the connector's server-side
   * registered redirect, and the `redirectUrl` getter reports
   * {@link CONNECT_MANAGED_REDIRECT_URL} instead of an empty string.
   * The official `@modelcontextprotocol/sdk` treats a falsy
   * `redirectUrl` as a request for its non-interactive
   * client-credentials flow, which would bypass Connect's consent
   * page entirely; a non-empty placeholder keeps that transport on
   * the interactive path. The placeholder is never used as a real
   * redirect: `redirectToAuthorization` discards the SDK-built
   * authorization URL in favour of Connect's own consent URL.
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
   * UI chunk, etc.
   *
   * In `'transport'` consent mode the callback replaces the default
   * {@link ConsentRequiredError}: if it returns normally, this adapter
   * throws nothing. The MCP transport still fails the request with
   * its own generic `UnauthorizedError` (which carries no `cause`, so
   * {@link getConsentChallenge} cannot recover the URL from it); a
   * non-throwing callback is therefore only useful for side effects
   * such as logging or emitting a UI chunk, or when the callback
   * itself redirects by throwing (e.g. a framework `redirect()`).
   *
   * In `'eager'` mode the callback runs first and
   * {@link ConsentRequiredError} is thrown regardless, because
   * `tokens()` must abort the outgoing request; returning `undefined`
   * there would let the transport proceed unauthenticated and raise
   * the challenge a second time.
   */
  readonly onConsentRequired?: (
    challenge: ConsentChallenge
  ) => void | Promise<void>;

  /**
   * Where the consent challenge is raised. See
   * {@link ConnectConsentMode}. Defaults to `'transport'`.
   */
  readonly consent?: ConnectConsentMode;
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
 *
 * MCP client libraries often wrap connection failures in their own
 * error type (for example `@tanstack/ai-mcp`'s `MCPConnectionError`)
 * with this error on `cause`. Use {@link getConsentChallenge} to find
 * it anywhere in a `cause` chain.
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

/**
 * Type guard for {@link ConsentRequiredError}. Only matches the error
 * itself; use {@link getConsentChallenge} to look through wrapping
 * errors' `cause` chains.
 */
export function isConsentRequiredError(
  err: unknown
): err is ConsentRequiredError {
  return err instanceof ConsentRequiredError;
}

/** Upper bound on `cause` hops walked by {@link getConsentChallenge}. */
const MAX_CAUSE_DEPTH = 16;

/**
 * Finds a Connect consent challenge in `err` or anywhere along its
 * `cause` chain and returns it, or `undefined` when none is present.
 *
 * MCP clients typically raise the adapter's {@link ConsentRequiredError}
 * from inside their connect / tool-call machinery and re-wrap it —
 * `@tanstack/ai-mcp`'s `createMCPClient` throws `MCPConnectionError`
 * with the original error on `cause`. This helper lets a route handler
 * branch on consent without knowing the wrapping shape:
 *
 * ```ts
 * } catch (err) {
 *   const challenge = getConsentChallenge(err);
 *   if (challenge) return Response.redirect(challenge.url);
 *   throw err;
 * }
 * ```
 *
 * Matching is by `instanceof` first, then structurally on
 * `name === 'ConsentRequiredError'` so a duplicated copy of
 * `@vercel/connect` in the dependency graph is still recognized.
 */
export function getConsentChallenge(
  err: unknown
): ConsentChallenge | undefined {
  let current: unknown = err;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    const challenge = toConsentChallenge(current);
    if (challenge) {
      return challenge;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

function toConsentChallenge(candidate: object): ConsentChallenge | undefined {
  if (candidate instanceof ConsentRequiredError) {
    return {
      connector: candidate.connector,
      subject: candidate.subject,
      url: candidate.url,
      request: candidate.request,
      verifier: candidate.verifier,
      deviceCode: candidate.deviceCode,
      expiresAt: candidate.expiresAt,
    };
  }
  const value = candidate as Partial<ConsentRequiredError>;
  if (
    value.name === 'ConsentRequiredError' &&
    typeof value.url === 'string' &&
    typeof value.connector === 'string' &&
    typeof value.request === 'string' &&
    typeof value.verifier === 'string' &&
    value.subject !== undefined
  ) {
    return {
      connector: value.connector,
      subject: value.subject,
      url: value.url,
      request: value.request,
      verifier: value.verifier,
      deviceCode: value.deviceCode,
      expiresAt: value.expiresAt,
    };
  }
  return undefined;
}

/**
 * Value reported by `OAuthClientProvider.redirectUrl` when no
 * {@link ConnectAuthProviderOptions.redirectUrl} is configured.
 *
 * Connect's hosted consent flow owns the real post-consent redirect
 * (the connector's server-side registered redirect), so this URL is
 * never followed. It exists only so the official
 * `@modelcontextprotocol/sdk` `auth()` orchestrator — which treats a
 * falsy `redirectUrl` as "run the non-interactive client-credentials
 * flow" — stays on the interactive path and reaches
 * `redirectToAuthorization`.
 */
export const CONNECT_MANAGED_REDIRECT_URL = 'https://connect.vercel.com/';

/**
 * Discovery state returned by `OAuthClientProvider.discoveryState()`.
 *
 * The official `@modelcontextprotocol/sdk` `auth()` orchestrator runs
 * RFC 9728 discovery on every 401: it fetches the URL named by the MCP
 * server's `WWW-Authenticate: Bearer resource_metadata="…"` parameter,
 * then the authorization-server metadata at whatever host that
 * document names. Neither URL is validated, so a compromised MCP
 * server can point them at private-network addresses (blind SSRF).
 * When a provider returns a complete cached state the orchestrator
 * skips every discovery fetch, so this adapter returns one that names
 * Connect as the authorization server. None of these endpoints is
 * ever called: `redirectToAuthorization` discards the authorization
 * URL the SDK builds from them in favour of Connect's own consent URL,
 * and the token endpoint is only used for refresh and code exchange,
 * both of which Connect performs server-side.
 */
export const CONNECT_DISCOVERY_STATE: ConnectOAuthDiscoveryState = {
  authorizationServerUrl: 'https://connect.vercel.com',
  authorizationServerMetadata: {
    issuer: 'https://connect.vercel.com',
    authorization_endpoint: 'https://connect.vercel.com/',
    token_endpoint: 'https://connect.vercel.com/',
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
  },
  resourceMetadata: {
    resource: 'https://connect.vercel.com/',
    authorization_servers: ['https://connect.vercel.com'],
  },
};

const EMPTY_CLIENT_METADATA: ConnectOAuthClientMetadata = {
  redirect_uris: [],
};

/**
 * Builds an MCP-spec `OAuthClientProvider` backed by Vercel
 * Connect. The returned object delegates `tokens()` to
 * {@link getTokenResponse} and `redirectToAuthorization` to
 * {@link startAuthorization}. Connect owns client registration, PKCE,
 * state, and the callback handshake server-side, so most of the
 * `OAuthClientProvider` surface is intentionally a no-op.
 *
 * The returned object satisfies both `@ai-sdk/mcp`'s and the official
 * `@modelcontextprotocol/sdk`'s `OAuthClientProvider` interfaces, so
 * it plugs into `createMCPClient` from either `@ai-sdk/mcp` or
 * `@tanstack/ai-mcp`, and into a hand-built
 * `StreamableHTTPClientTransport`.
 *
 * @param connector Vercel Connect connector UID (e.g. `oauth/linear`)
 *   or opaque connector id.
 * @param params Token request parameters — always specify a
 *   `subject`; the supported subject types
 *   (`'app'` / `'user'` / `'jwt-bearer'` / `'token'`) have distinct
 *   security semantics.
 * @param options Optional adapter behavior overrides.
 */
export function connectAuthProvider(
  connector: string,
  params: ConnectTokenParams,
  options?: ConnectAuthProviderOptions
): ConnectOAuthClientProvider {
  const configuredRedirectUrl = options?.redirectUrl;
  const consentMode: ConnectConsentMode = options?.consent ?? 'transport';

  async function resolveVercelToken(): Promise<string | undefined> {
    const { vercelToken } = options ?? {};
    if (typeof vercelToken === 'function') {
      return vercelToken();
    }
    return vercelToken;
  }

  /** Asks Connect for a consent URL for the configured subject. */
  async function mintConsentChallenge(): Promise<ConsentChallenge> {
    const vercelToken = await resolveVercelToken();
    const response = await startAuthorization(connector, params, {
      ...(vercelToken !== undefined && { vercelToken }),
      // Forward the post-consent return URL so the user lands back
      // in the app. Omitted => Connect uses the connector's
      // registered redirect.
      ...(configuredRedirectUrl && { callbackUrl: configuredRedirectUrl }),
      ...(options?.deviceCode && { deviceCode: true }),
    });
    return {
      connector,
      subject: params.subject,
      url: response.url,
      request: response.request,
      verifier: response.verifier,
      deviceCode: response.deviceCode,
      expiresAt: response.expiresAt,
    };
  }

  return {
    async tokens(): Promise<ConnectOAuthTokens | undefined> {
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
        if (!(err instanceof UserAuthorizationRequiredError)) {
          // ConnectorInstallationRequiredError (a configuration
          // problem, not a per-user consent issue) and everything
          // else propagate as-is rather than masquerading as a
          // consent challenge.
          throw err;
        }
        if (consentMode === 'transport') {
          // Returning undefined lets the MCP transport's auth()
          // orchestrator trigger redirectToAuthorization below,
          // where we surface the Connect consent URL.
          return undefined;
        }
        // Eager: surface Connect's consent URL right here, before
        // the transport sends anything. Connect is authoritative
        // about the missing grant, so there is nothing to gain from
        // letting the server 401 first. The callback runs for side
        // effects, then the request is aborted unconditionally.
        const challenge = await mintConsentChallenge();
        await options?.onConsentRequired?.(challenge);
        throw new ConsentRequiredError(challenge);
      }
    },

    async redirectToAuthorization(_authorizationUrl: URL): Promise<void> {
      // The URL argument is the MCP server's discovered authorization
      // endpoint. We ignore it — Connect has its own consent URL
      // backed by the connector's registered OAuth client.
      const challenge = await mintConsentChallenge();
      if (options?.onConsentRequired) {
        await options.onConsentRequired(challenge);
        return;
      }
      throw new ConsentRequiredError(challenge);
    },

    saveTokens(_tokens: ConnectOAuthTokens): void {
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
      // The configured post-consent return URL, or a non-empty
      // placeholder. Must never be falsy: the official MCP SDK's
      // auth() reads `!provider.redirectUrl` as "non-interactive
      // flow" and would try a client-credentials token request
      // against the third-party authorization server instead of
      // calling redirectToAuthorization.
      return configuredRedirectUrl || CONNECT_MANAGED_REDIRECT_URL;
    },

    get clientMetadata(): ConnectOAuthClientMetadata {
      // Returned only during dynamic client registration, which we
      // never trigger. A minimal but valid value satisfies the
      // contract.
      return EMPTY_CLIENT_METADATA;
    },

    clientInformation(): ConnectOAuthClientInformation {
      // The connector UID stands in as the logical client id. The
      // MCP transport uses this for cache keys and debug output;
      // tying it to the Connect identifier is more useful than
      // returning a synthetic value.
      return { client_id: connector };
    },

    discoveryState(): ConnectOAuthDiscoveryState {
      // Pre-empts RFC 9728 discovery so the official SDK never fetches
      // URLs chosen by the MCP server's WWW-Authenticate header.
      return CONNECT_DISCOVERY_STATE;
    },

    saveDiscoveryState(_state: unknown): void {
      // No-op: the state above is fixed and never needs persisting.
    },

    async validateResourceURL(): Promise<undefined> {
      // Bypasses the SDK's check that the synthetic resource metadata
      // matches the MCP server URL (it would throw before reaching
      // redirectToAuthorization). Returning undefined also omits the
      // RFC 8707 `resource` parameter from the authorization URL the
      // SDK builds, which is discarded anyway.
      return undefined;
    },
  };
}
