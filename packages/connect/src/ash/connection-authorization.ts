/**
 * Ash adapter helper for `@vercel/connect`.
 *
 * {@link connect} turns a Vercel Connect OAuth connector id plus a
 * principal type into a ready-made Ash
 * {@link AuthorizationDefinition} that the connection runtime
 * consumes directly. The helper collapses the ~100 lines of
 * `getToken` / `startAuthorization` / `completeAuthorization`
 * boilerplate each Connect-backed connection normally writes down
 * to a single call:
 *
 * ```ts
 * import { defineMcpClientConnection } from "experimental-ash/connections";
 * import { connect } from "@vercel/connect/ash";
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
 * This entrypoint is exposed at the `@vercel/connect/ash` subpath so
 * consumers that don't use Ash never load it. `experimental-ash` is
 * declared as an optional peer dependency: importing
 * `@vercel/connect/ash` requires Ash to be installed in the consumer
 * project, but the rest of `@vercel/connect` works without it.
 */
import {
  ConnectionAuthorizationFailedError,
  ConnectionAuthorizationRequiredError,
  type ConnectionAuthorizationChallenge,
  type ConnectionPrincipal,
  type InteractiveAuthorizationDefinition,
  type JsonValue,
  type NonInteractiveAuthorizationDefinition,
  type TokenResult,
} from 'experimental-ash/connections';

import { startAuthorization } from '../authorization.js';
import type {
  ConnectOptions,
  ConnectTokenParams,
  ConnectTokenSubject,
} from '../token.js';
import {
  ConnectorInstallationRequiredError,
  getTokenResponse,
  NoValidTokenError,
  UserAuthorizationRequiredError,
} from '../token.js';

/**
 * Authorization phase passed to {@link AshAuthorizationOptions.onError}
 * so consumers can branch their error translation per callback.
 */
export type ConnectAuthorizationPhase =
  | 'getToken'
  | 'startAuthorization'
  | 'completeAuthorization';

/**
 * State journaled by Ash between
 * {@link InteractiveAuthorizationDefinition.startAuthorization} and
 * {@link InteractiveAuthorizationDefinition.completeAuthorization}.
 *
 * Currently just the PKCE verifier. The index signature exists to
 * satisfy Ash's `State extends JsonValue` constraint; in practice
 * the only key the helper produces or reads is `verifier`.
 */
export type ConnectAuthorizationState = {
  readonly verifier: string;
  readonly [key: string]: JsonValue;
};

interface GetTokenOptions {
  readonly principal: ConnectionPrincipal;
}

interface StartAuthorizationOptions {
  readonly principal: ConnectionPrincipal;
  readonly callbackUrl?: string;
  readonly webhook?: string;
}

interface CompleteAuthorizationOptions {
  readonly principal: ConnectionPrincipal;
}

/** Options accepted by {@link connect}. */
export interface AshAuthorizationOptions {
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
   *   `startAuthorization`, and `completeAuthorization`. Ash will
   *   drive a consent flow through its framework-owned webhook.
   * - `"app"` → non-interactive definition with `getToken` only. Ash
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
   * Override how Ash's framework-resolved principal is mapped to a
   * Vercel Connect token subject. When omitted, app principals map to
   * `{ type: "app" }` and user principals map to
   * `{ type: "user", id, issuer }`.
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
   * Custom call-to-action rendered on the
   * `connection.authorization_required` event. When omitted, Ash
   * fills in `Authorize <ConnectionName> in your browser to continue.`
   * from the connection's filename.
   */
  readonly instructions?: string;

  /**
   * Escape hatch for turning an unexpected Vercel Connect / network
   * error into an Ash-recognizable error. Called once per failure
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
export type AshAuthorizationInput = string | AshAuthorizationOptions;

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
 * Augments the standard Ash authorization shape with the
 * {@link VercelConnectMetadata} marker, narrowed to whichever flavour
 * `connect()` produces.
 */
export type AshConnectAuthorizationDefinition<
  TAuthorization extends
    | InteractiveAuthorizationDefinition<ConnectAuthorizationState>
    | NonInteractiveAuthorizationDefinition,
> = TAuthorization & {
  readonly vercelConnect: VercelConnectMetadata;
};

/**
 * Builds an Ash {@link AuthorizationDefinition} backed by Vercel
 * Connect. The return type narrows based on
 * {@link AshAuthorizationOptions.principalType}:
 *
 * - omitted or `principalType: "user"` returns an
 *   {@link InteractiveAuthorizationDefinition}; Ash drives a consent
 *   flow through its framework-owned webhook.
 * - `principalType: "app"` returns a
 *   {@link NonInteractiveAuthorizationDefinition}; Ash never runs a
 *   consent flow for app-scoped connectors.
 *
 * Every returned definition also carries a {@link VercelConnectMetadata}
 * marker on its `vercelConnect` field so downstream tooling (Ash
 * compiler, dashboards) can detect Vercel Connect-backed connections
 * without inspecting closure state.
 */
export function connect(
  connector: string
): AshConnectAuthorizationDefinition<
  InteractiveAuthorizationDefinition<ConnectAuthorizationState>
>;
export function connect(
  options: AshAuthorizationOptions & { readonly principalType?: 'user' }
): AshConnectAuthorizationDefinition<
  InteractiveAuthorizationDefinition<ConnectAuthorizationState>
>;
export function connect(
  options: AshAuthorizationOptions & { readonly principalType: 'app' }
): AshConnectAuthorizationDefinition<NonInteractiveAuthorizationDefinition>;
export function connect(
  options: AshAuthorizationInput
): AshConnectAuthorizationDefinition<
  | InteractiveAuthorizationDefinition<ConnectAuthorizationState>
  | NonInteractiveAuthorizationDefinition
>;
export function connect(
  input: AshAuthorizationInput
): AshConnectAuthorizationDefinition<
  | InteractiveAuthorizationDefinition<ConnectAuthorizationState>
  | NonInteractiveAuthorizationDefinition
> {
  const options = normalizeAuthorizationOptions(input);
  const vercelConnect: VercelConnectMetadata = { connector: options.connector };
  if (options.principalType === 'app') {
    return { ...buildNonInteractiveDefinition(options), vercelConnect };
  }
  return { ...buildInteractiveDefinition(options), vercelConnect };
}

function normalizeAuthorizationOptions(
  input: AshAuthorizationInput
): AshAuthorizationOptions {
  if (typeof input === 'string') {
    return { connector: input };
  }
  return input;
}

function buildInteractiveDefinition(
  options: AshAuthorizationOptions
): InteractiveAuthorizationDefinition<ConnectAuthorizationState> {
  return {
    principalType: 'user',

    async getToken({ principal }: GetTokenOptions): Promise<TokenResult> {
      try {
        const response = await getTokenResponse(
          options.connector,
          await buildTokenParams(options, principal),
          options.connectOptions
        );
        return { token: response.token, expiresAt: response.expiresAt };
      } catch (error) {
        throw translate(error, 'getToken', options);
      }
    },

    async startAuthorization({
      principal,
      callbackUrl,
      webhook,
    }: StartAuthorizationOptions): Promise<{
      challenge: ConnectionAuthorizationChallenge;
      state: ConnectAuthorizationState;
    }> {
      try {
        // Ash's `webhook` parameter is semantically a browser-redirect
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
        // generic "close this window" page instead of Ash's branded
        // landing page, and the helper would need to grow
        // protocol-aware logic that diverges from the simple "Ash
        // mints one URL, Vercel Connect redirects there" mental
        // model. Revisit if tab-close timeouts become a real problem
        // in production.
        const response = await startAuthorization(
          options.connector,
          await buildTokenParams(options, principal),
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
          state: { verifier: response.verifier },
        };
      } catch (error) {
        throw translate(error, 'startAuthorization', options);
      }
    },

    async completeAuthorization({
      principal,
    }: CompleteAuthorizationOptions): Promise<TokenResult> {
      try {
        const response = await getTokenResponse(
          options.connector,
          await buildTokenParams(options, principal),
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
  options: AshAuthorizationOptions
): NonInteractiveAuthorizationDefinition {
  return {
    principalType: 'app',
    async getToken({ principal }: GetTokenOptions): Promise<TokenResult> {
      try {
        const response = await getTokenResponse(
          options.connector,
          await buildTokenParams(options, principal),
          options.connectOptions
        );
        return { token: response.token, expiresAt: response.expiresAt };
      } catch (error) {
        throw translate(error, 'getToken', options);
      }
    },
  };
}

async function buildTokenParams(
  options: AshAuthorizationOptions,
  principal: ConnectionPrincipal
): Promise<ConnectTokenParams> {
  const toSubject = options.principalToSubject ?? principalToSubject;
  return {
    ...options.tokenParams,
    subject: await toSubject(principal),
  };
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
 * Translates raw Vercel Connect errors into Ash's public
 * {@link ConnectionAuthorizationRequiredError} /
 * {@link ConnectionAuthorizationFailedError} classes. Ash discriminates
 * on `err.name` (not `instanceof`), so even if the consumer's bundle
 * loads a different copy of `experimental-ash` than this helper, the
 * runtime still recognizes the throw.
 */
function translate(
  error: unknown,
  phase: ConnectAuthorizationPhase,
  options: AshAuthorizationOptions
): Error {
  const override = options.onError?.(error, phase);
  if (override !== undefined) return override;

  // `UserAuthorizationRequiredError` and `NoValidTokenError` both
  // mean "Vercel Connect has no valid credential for this principal
  // yet". For interactive (user) connectors that's recoverable via
  // a consent flow; Ash will see the `Required` throw and drive
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
      // The consent leg reported success (Ash would not call us
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

  // Every other error is re-thrown verbatim. Ash treats an unknown
  // throw from `completeAuthorization` as a retryable failure, so the
  // default behavior stays intuitive.
  return error instanceof Error ? error : new Error(String(error));
}
