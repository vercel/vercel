/**
 * Eve adapter helper for `@vercel/connect`.
 *
 * {@link connect} turns a Vercel Connect OAuth connector id plus a
 * principal type into a ready-made Eve
 * {@link AuthorizationDefinition} that the connection runtime
 * consumes directly. The helper collapses the ~100 lines of
 * `getToken` / `startAuthorization` / `completeAuthorization`
 * boilerplate each Connect-backed connection normally writes down
 * to a single call:
 *
 * ```ts
 * import { defineMcpClientConnection } from "eve/connections";
 * import { connect } from "@vercel/connect/eve";
 *
 * export default defineMcpClientConnection({
 *   url: "https://mcp.linear.app/sse",
 *   description: "Linear workspace — issues, projects, cycles, and comments.",
 *   auth: connect("linear"),
 * });
 * ```
 *
 * # Module layout
 *
 * This entrypoint is exposed at the `@vercel/connect/eve` subpath so
 * consumers that don't use Eve never load it. `eve` is
 * declared as an optional peer dependency: importing
 * `@vercel/connect/eve` requires Eve to be installed in the consumer
 * project, but the rest of `@vercel/connect` works without it.
 */
import {
  ConnectionAuthorizationFailedError,
  ConnectionAuthorizationRequiredError,
  type ConnectionAuthorizationChallenge,
  type ConnectionPrincipal,
  type InteractiveAuthorizationDefinition,
  type NonInteractiveAuthorizationDefinition,
  type TokenResult,
} from 'eve/connections';

import { startAuthorization } from '../authorization.js';
import type {
  ConnectOptions,
  ConnectTokenParams,
  ConnectTokenSubject,
} from '../token.js';
import {
  ConnectorInstallationRequiredError,
  deleteTokenCacheEntry,
  getTokenResponse,
  NoValidTokenError,
  revokeToken,
  UserAuthorizationRequiredError,
} from '../token.js';

/**
 * Authorization phase passed to {@link EveAuthorizationOptions.onError}
 * so consumers can branch their error translation per callback.
 */
export type ConnectAuthorizationPhase =
  | 'getToken'
  | 'startAuthorization'
  | 'completeAuthorization';

/**
 * Eve's per-connection authorization context — the `connection` argument
 * Eve's runtime hands to every `getToken` / `startAuthorization` /
 * `completeAuthorization` callback alongside the resolved principal.
 * Currently carries the connection's declared server `url`; Eve documents
 * the shape as strictly additive, so destructuring only the fields you
 * need stays forward-compatible.
 *
 * eve 0.6.0-beta.1 declares this type as
 * `ConnectionAuthorizationContext` but does not re-export it from
 * `eve/connections` (or any other public subpath), so it is derived
 * structurally here from the exported authorization definition — this is
 * exactly the type Eve passes at runtime. Once eve exports the type
 * directly, this alias can switch to a plain re-export without a
 * breaking change.
 */
export type EveConnectionAuthorizationContext = Parameters<
  NonInteractiveAuthorizationDefinition['getToken']
>[0]['connection'];

interface GetTokenOptions {
  readonly principal: ConnectionPrincipal;
  readonly connection: EveConnectionAuthorizationContext;
}

interface StartAuthorizationOptions {
  readonly principal: ConnectionPrincipal;
  readonly connection: EveConnectionAuthorizationContext;
  readonly callbackUrl?: string;
  readonly webhook?: string;
}

interface CompleteAuthorizationOptions {
  readonly principal: ConnectionPrincipal;
  readonly connection: EveConnectionAuthorizationContext;
}

/** Options accepted by {@link connect}. */
export interface EveAuthorizationOptions {
  /**
   * Vercel Connect OAuth connector identifier. Accepts either the
   * opaque service connector key (`scl_...`) or the human-readable
   * UID (`oauth/mcp-linear-app`) — both resolve to the same
   * connector on the Vercel Connect side.
   */
  readonly connector: string;

  /**
   * Whether this connection authenticates as the agent itself
   * (`"app"`) or on behalf of the end-user (`"user"`). Defaults to
   * `"user"` when omitted, and the returned definition shape depends
   * on this choice:
   *
   * - `"user"` → full interactive OAuth definition with `getToken`,
   *   `startAuthorization`, and `completeAuthorization`. Eve will
   *   drive a consent flow through its framework-owned webhook.
   * - `"app"` → non-interactive definition with `getToken` only. Eve
   *   never runs a consent flow for app-scoped connectors; a failure
   *   to fetch the token surfaces as a terminal authorization
   *   failure so the channel can prompt an operator to install the
   *   Vercel Connect app.
   */
  readonly principalType?: 'app' | 'user';

  /**
   * Extra parameters forwarded to every `getTokenResponse` /
   * `startAuthorization` call, minus `subject` — the helper derives
   * `subject` from the framework-resolved principal.
   *
   * Use this to pin `scopes`, `audience`, `resources`, or
   * `authorizationDetails`. Passed through verbatim.
   */
  readonly tokenParams?: Omit<ConnectTokenParams, 'subject'>;

  /**
   * Builds the Vercel Connect token subject from the framework-resolved
   * principal plus the connection's authorization context (Eve's
   * per-connection metadata — currently the declared server `url`).
   *
   * Needed by jwt-bearer-style connectors whose subject/assertion
   * depends on more than the principal: custom claims, the connection
   * URL, or an audience derived from it. Takes precedence over the
   * deprecated {@link principalToSubject}. When neither is set, the
   * default mapping applies — app principals map to `{ type: "app" }`
   * and user principals map to `{ type: "user", id, issuer }`.
   */
  readonly createSubject?: (
    principal: ConnectionPrincipal,
    ctx: EveConnectionAuthorizationContext
  ) => ConnectTokenSubject | Promise<ConnectTokenSubject>;

  /**
   * Override how Eve's framework-resolved principal is mapped to a
   * Vercel Connect token subject. When omitted, app principals map to
   * `{ type: "app" }` and user principals map to
   * `{ type: "user", id, issuer }`.
   *
   * @deprecated Use {@link createSubject}, which also receives the
   * connection authorization context.
   */
  readonly principalToSubject?: (
    principal: ConnectionPrincipal
  ) => ConnectTokenSubject | Promise<ConnectTokenSubject>;

  /**
   * Low-level Vercel Connect SDK options (currently `vercelToken`
   * for overriding the OIDC bearer). Most callers leave this unset
   * and rely on `@vercel/oidc` auto-discovery.
   */
  readonly connectOptions?: ConnectOptions;

  /**
   * Re-validate the grant against Vercel Connect on every `getToken`
   * instead of trusting the in-process token cache.
   *
   * By default `getToken` returns a cached token as long as it has not
   * expired, so a grant the user revoked server-side keeps reaching the
   * tool until the bearer's natural expiry. With `validate: true` each
   * `getToken` bypasses the local cache and re-checks Connect; a revoked
   * grant comes back as `no_token` / `user_authorization_required`, which
   * the adapter maps to {@link ConnectionAuthorizationRequiredError} so
   * Eve re-runs the consent flow rather than calling the tool with a dead
   * token.
   *
   * This trades a Connect round trip per call for freshness — leave it
   * off for high-frequency tools where a short revocation window is
   * acceptable, and turn it on for sensitive actions (payments, deletes,
   * privileged writes) that must never run on a revoked grant.
   */
  readonly validate?: boolean;

  /**
   * Custom call-to-action rendered on the
   * `connection.authorization_required` event. When omitted, Eve
   * fills in `Authorize <ConnectionName> in your browser to continue.`
   * from the connection's filename.
   */
  readonly instructions?: string;

  /**
   * Escape hatch for turning an unexpected Vercel Connect / network
   * error into an Eve-recognizable error. Called once per failure
   * with the raw error and the phase that produced it.
   *
   * Return a new `Error` to replace the helper's default translation,
   * or `undefined` to let the helper use its own mapping. Useful
   * when a deployment has stricter error reporting requirements
   * (custom `reason` codes, structured logging, etc.).
   */
  readonly onError?: (
    error: unknown,
    phase: ConnectAuthorizationPhase
  ) => Error | undefined;
}

/** Input accepted by {@link connect}. */
export type EveAuthorizationInput = string | EveAuthorizationOptions;

/**
 * Structurally-readable marker exposed on every {@link connect} return
 * value so downstream tooling can detect Vercel Connect-backed
 * connections at compile time and surface deep links to the matching
 * connector settings page.
 *
 * The `connector` field carries the raw value the author passed to
 * {@link connect} — either the human-readable UID
 * (`"oauth/mcp-linear-app"`) or the opaque service-connector key
 * (`"scl_..."`). Consumers that need the canonical `scl_...` form
 * (eg. the Vercel dashboard, when building a `/connect/<clientId>`
 * URL) can resolve UID → `scl_...` against the Vercel Connect API;
 * both forms address the same connector.
 *
 * The marker is purely metadata — it does not influence the runtime
 * token-fetching behaviour, which continues to be driven by the
 * `getToken` / `startAuthorization` / `completeAuthorization`
 * callbacks.
 */
export interface VercelConnectMetadata {
  readonly connector: string;
}

/**
 * Augments the standard Eve authorization shape with the
 * {@link VercelConnectMetadata} marker, narrowed to whichever flavour
 * `connect()` produces.
 */
export type EveConnectAuthorizationDefinition<
  TAuthorization extends
    | InteractiveAuthorizationDefinition
    | NonInteractiveAuthorizationDefinition,
> = TAuthorization & {
  readonly vercelConnect: VercelConnectMetadata;

  /**
   * Drops the in-process Vercel Connect token cache entry for
   * `principal` so the next `getToken` re-fetches instead of re-serving a
   * rejected bearer. Eve's runtime calls this from its shared eviction
   * path when a resolved token is rejected (a downstream `401` mapped to
   * `requireAuth()`, or an MCP server rejecting the bearer), cascading
   * invalidation from Eve's per-step cache down into this adapter's cache.
   *
   * By default this is a local-cache-only operation: it preserves the
   * underlying Connect grant (and its refresh token), so the next
   * `getToken` can refresh a merely-expired access token without forcing
   * a new consent flow. That is the right default for the automatic
   * `401` cascade, where the rejected bearer is usually just stale.
   *
   * Pass `revoke: true` only when the grant itself is known to be dead
   * and you want it torn down at Vercel Connect (refresh token included)
   * so the next `getToken` surfaces `user_authorization_required` and
   * re-runs consent — e.g. a user-initiated "disconnect this
   * integration" action. Revocation is destructive and best-effort: a
   * failed or duplicate revoke is swallowed so it never masks the error
   * that triggered eviction, and the local cache entry is dropped either
   * way.
   *
   * Pass `connection` (Eve's per-connection authorization context) when
   * the connection uses {@link EveAuthorizationOptions.createSubject}:
   * the cache entry is keyed by the resolved subject, and a
   * context-dependent subject can only be reproduced with the context in
   * hand. Without it, eviction falls back to the legacy
   * principal-only mapping and may miss the entry.
   */
  readonly evict: (opts: {
    readonly principal: ConnectionPrincipal;
    readonly connection?: EveConnectionAuthorizationContext;
    readonly revoke?: boolean;
  }) => Promise<void>;
};

/**
 * Builds an Eve {@link AuthorizationDefinition} backed by Vercel
 * Connect. The return type narrows based on
 * {@link EveAuthorizationOptions.principalType}:
 *
 * - omitted or `principalType: "user"` returns an
 *   {@link InteractiveAuthorizationDefinition}; Eve drives a consent
 *   flow through its framework-owned webhook.
 * - `principalType: "app"` returns a
 *   {@link NonInteractiveAuthorizationDefinition}; Eve never runs a
 *   consent flow for app-scoped connectors.
 *
 * Every returned definition also carries a {@link VercelConnectMetadata}
 * marker on its `vercelConnect` field so downstream tooling (Eve
 * compiler, dashboards) can detect Vercel Connect-backed connections
 * without inspecting closure state.
 */
export function connect(
  connector: string
): EveConnectAuthorizationDefinition<InteractiveAuthorizationDefinition>;
export function connect(
  options: EveAuthorizationOptions & { readonly principalType?: 'user' }
): EveConnectAuthorizationDefinition<InteractiveAuthorizationDefinition>;
export function connect(
  options: EveAuthorizationOptions & { readonly principalType: 'app' }
): EveConnectAuthorizationDefinition<NonInteractiveAuthorizationDefinition>;
export function connect(
  options: EveAuthorizationInput
): EveConnectAuthorizationDefinition<
  InteractiveAuthorizationDefinition | NonInteractiveAuthorizationDefinition
>;
export function connect(
  input: EveAuthorizationInput
): EveConnectAuthorizationDefinition<
  InteractiveAuthorizationDefinition | NonInteractiveAuthorizationDefinition
> {
  const options = normalizeAuthorizationOptions(input);
  const vercelConnect: VercelConnectMetadata = { connector: options.connector };
  const evict = makeEvict(options);
  if (options.principalType === 'app') {
    return { ...buildNonInteractiveDefinition(options), vercelConnect, evict };
  }
  return { ...buildInteractiveDefinition(options), vercelConnect, evict };
}

/**
 * Builds the {@link EveConnectAuthorizationDefinition.evict} callback for
 * a connector. Resolves the same token params {@link getToken} uses for
 * `principal`, then drops exactly that cache entry — leaving every other
 * principal's cached token intact.
 *
 * When called with `revoke: true` it instead tears the grant down at
 * Vercel Connect via {@link revokeToken} (best-effort, falling back to a
 * local cache drop if the revoke request fails).
 */
function makeEvict(
  options: EveAuthorizationOptions
): (opts: {
  readonly principal: ConnectionPrincipal;
  readonly connection?: EveConnectionAuthorizationContext;
  readonly revoke?: boolean;
}) => Promise<void> {
  return async ({ principal, connection, revoke }) => {
    const params = await buildTokenParams(options, principal, connection);
    if (revoke) {
      try {
        // Destructive: tears down the grant at Vercel Connect (refresh
        // token included) and clears the in-process cache. Best-effort —
        // a failed or duplicate revoke must not mask the auth error that
        // triggered eviction.
        await revokeToken(
          options.connector,
          {
            subject: params.subject,
            installationId: params.installationId,
          },
          options.connectOptions
        );
        return;
      } catch {
        // Fall through to the local cache drop so the rejected bearer is
        // gone even when the server-side revoke failed.
      }
    }
    deleteTokenCacheEntry(options.connector, params);
  };
}

function normalizeAuthorizationOptions(
  input: EveAuthorizationInput
): EveAuthorizationOptions {
  if (typeof input === 'string') {
    return { connector: input };
  }
  return input;
}

function buildInteractiveDefinition(
  options: EveAuthorizationOptions
): InteractiveAuthorizationDefinition {
  return {
    principalType: 'user',

    async getToken({
      principal,
      connection,
    }: GetTokenOptions): Promise<TokenResult> {
      try {
        const response = await getTokenResponse(
          options.connector,
          await buildTokenParams(options, principal, connection),
          getTokenConnectOptions(options)
        );
        return { token: response.token, expiresAt: response.expiresAt };
      } catch (error) {
        throw translate(error, 'getToken', options);
      }
    },

    async startAuthorization({
      principal,
      connection,
      callbackUrl,
      webhook,
    }: StartAuthorizationOptions): Promise<{
      challenge: ConnectionAuthorizationChallenge;
    }> {
      try {
        // Eve's `webhook` parameter is semantically a browser-redirect
        // target — the orchestrator mints it via `createWebhook({
        // respondWith: buildAuthorizationCompletePage() })` so the
        // user lands on a friendly "you can close this tab" page after
        // consent. That maps to Vercel Connect's `callbackUrl:`
        // semantics, which accepts both `https://` (prod) and
        // `http://localhost` (vercel dev) — one field covers both.
        // Vercel Connect authenticates the calling Vercel project via
        // OIDC, which is what lets per-workflow dynamic webhook URLs
        // work without an OAuth-style redirect-URI allowlist.
        //
        // We don't route `https://` URLs into Vercel Connect's
        // `webhook:` (server-POST) field, even though it would
        // survive the user closing the consent tab right after IdP
        // callback. That mode shows the user Vercel Connect's
        // generic "close this window" page instead of Eve's branded
        // landing page, and the helper would need to grow
        // protocol-aware logic that diverges from the simple "Eve
        // mints one URL, Vercel Connect redirects there" mental
        // model. Revisit if tab-close timeouts become a real problem
        // in production.
        const response = await startAuthorization(
          options.connector,
          await buildTokenParams(options, principal, connection),
          {
            ...options.connectOptions,
            callbackUrl: callbackUrl ?? webhook,
            deviceCode: true,
          }
        );
        return {
          challenge: {
            url: response.url,
            ...(response.deviceCode ? { userCode: response.deviceCode } : null),
            ...(response.expiresAt
              ? { expiresAt: new Date(response.expiresAt).toISOString() }
              : null),
            ...(options.instructions
              ? { instructions: options.instructions }
              : null),
          } satisfies ConnectionAuthorizationChallenge,
        };
      } catch (error) {
        throw translate(error, 'startAuthorization', options);
      }
    },

    async completeAuthorization({
      principal,
      connection,
    }: CompleteAuthorizationOptions): Promise<TokenResult> {
      try {
        const response = await getTokenResponse(
          options.connector,
          await buildTokenParams(options, principal, connection),
          options.connectOptions
        );
        return { token: response.token, expiresAt: response.expiresAt };
      } catch (error) {
        throw translate(error, 'completeAuthorization', options);
      }
    },
  };
}

function buildNonInteractiveDefinition(
  options: EveAuthorizationOptions
): NonInteractiveAuthorizationDefinition {
  return {
    principalType: 'app',
    async getToken({
      principal,
      connection,
    }: GetTokenOptions): Promise<TokenResult> {
      try {
        const response = await getTokenResponse(
          options.connector,
          await buildTokenParams(options, principal, connection),
          getTokenConnectOptions(options)
        );
        return { token: response.token, expiresAt: response.expiresAt };
      } catch (error) {
        throw translate(error, 'getToken', options);
      }
    },
  };
}

/**
 * Connect SDK options for `getToken` calls. When {@link
 * EveAuthorizationOptions.validate} is set, forces a cache-bypassing
 * re-fetch so a revoked-but-unexpired grant is caught instead of served
 * from the in-process token cache.
 */
function getTokenConnectOptions(
  options: EveAuthorizationOptions
): ConnectOptions | undefined {
  if (!options.validate) {
    return options.connectOptions;
  }
  return { ...options.connectOptions, forceRefresh: true };
}

async function buildTokenParams(
  options: EveAuthorizationOptions,
  principal: ConnectionPrincipal,
  connection: EveConnectionAuthorizationContext | undefined
): Promise<ConnectTokenParams> {
  return {
    ...options.tokenParams,
    subject: await resolveSubject(options, principal, connection),
  };
}

/**
 * Resolves the Vercel Connect token subject for `principal`, applying
 * the documented precedence: {@link EveAuthorizationOptions.createSubject}
 * (when the connection context is in hand), then the deprecated
 * {@link EveAuthorizationOptions.principalToSubject}, then the default
 * principal mapping.
 *
 * Eve's runtime passes `connection` to every authorization callback, so
 * on the `getToken` / `startAuthorization` / `completeAuthorization`
 * paths `createSubject` always receives it. Only the adapter's own
 * `evict` entry point may run without a context (its callers predate the
 * context plumbing); in that case the resolution falls back past
 * `createSubject` so eviction stays best-effort instead of throwing.
 */
function resolveSubject(
  options: EveAuthorizationOptions,
  principal: ConnectionPrincipal,
  connection: EveConnectionAuthorizationContext | undefined
): ConnectTokenSubject | Promise<ConnectTokenSubject> {
  if (options.createSubject !== undefined && connection !== undefined) {
    return options.createSubject(principal, connection);
  }
  if (options.principalToSubject !== undefined) {
    return options.principalToSubject(principal);
  }
  return principalToSubject(principal);
}

function principalToSubject(
  principal: ConnectionPrincipal
): ConnectTokenSubject {
  if (principal.type === 'app') {
    return { type: 'app' };
  }
  return { type: 'user', id: principal.id, issuer: principal.issuer };
}

/**
 * Translates raw Vercel Connect errors into Eve's public
 * {@link ConnectionAuthorizationRequiredError} /
 * {@link ConnectionAuthorizationFailedError} classes. Eve discriminates
 * on `err.name` (not `instanceof`), so even if the consumer's bundle
 * loads a different copy of `eve` than this helper, the
 * runtime still recognizes the throw.
 */
function translate(
  error: unknown,
  phase: ConnectAuthorizationPhase,
  options: EveAuthorizationOptions
): Error {
  const override = options.onError?.(error, phase);
  if (override !== undefined) return override;

  // `UserAuthorizationRequiredError` and `NoValidTokenError` both
  // mean "Vercel Connect has no valid credential for this principal
  // yet". For interactive (user) connectors that's recoverable via
  // a consent flow; Eve will see the `Required` throw and drive
  // `startAuthorization`. For app connectors it's terminal — there
  // is nobody to consent — so we surface `Failed` with
  // `retryable: false`.
  if (
    error instanceof UserAuthorizationRequiredError ||
    error instanceof NoValidTokenError
  ) {
    if (options.principalType === 'app') {
      return new ConnectionAuthorizationFailedError('connect', {
        message: error.message,
        reason: 'app_not_installed',
        retryable: false,
      });
    }
    if (phase === 'completeAuthorization') {
      // The consent leg reported success (Eve would not call us
      // otherwise) but Vercel Connect still says the user is
      // unauthorized. Default to retryable so the model can
      // re-prompt; most cases (network blip, replay) resolve on
      // retry.
      return new ConnectionAuthorizationFailedError('connect', {
        message:
          'Authorization did not complete. Vercel Connect still reports the user as unauthorized.',
      });
    }
    return new ConnectionAuthorizationRequiredError('connect', {
      message: error.message,
    });
  }

  // `ConnectorInstallationRequiredError` is terminal in both modes:
  // the operator has not installed the Vercel Connect connector for
  // this team.
  if (error instanceof ConnectorInstallationRequiredError) {
    return new ConnectionAuthorizationFailedError('connect', {
      message: error.message,
      reason: 'connector_installation_required',
      retryable: false,
    });
  }

  // Every other error is re-thrown verbatim. Eve treats an unknown
  // throw from `completeAuthorization` as a retryable failure, so the
  // default behavior stays intuitive.
  return error instanceof Error ? error : new Error(String(error));
}
