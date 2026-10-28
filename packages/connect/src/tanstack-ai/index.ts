/**
 * Public surface of the `@vercel/connect/tanstack-ai` subpath.
 *
 * [TanStack AI](https://tanstack.com/ai)'s MCP client
 * (`@tanstack/ai-mcp`) is built directly on the official
 * `@modelcontextprotocol/sdk` transports and accepts any MCP-spec
 * `OAuthClientProvider` on its `http` / `sse` transport config. This
 * subpath adds one TanStack-shaped helper on top of the shared Connect
 * adapter:
 *
 * - {@link connectMCPTransport} builds the whole
 *   `createMCPClient({ transport })` config and picks the consent mode
 *   per transport type: `'eager'` for Streamable HTTP, `'transport'`
 *   for SSE. Eager consent makes `tokens()` raise the Connect consent
 *   challenge before the first request (the MCP `initialize`
 *   handshake) leaves the process, so a missing grant always fails at
 *   the route boundary, never mid-run inside a tool call where
 *   TanStack's chat loop would swallow it into an
 *   `Error executing tool: …` result the model sees instead of the
 *   user. Eager mode is unsafe on SSE (see `ConnectConsentMode`), so
 *   SSE configs keep the MCP-spec 401 flow.
 * - {@link getConsentChallenge} looks through `MCPConnectionError`
 *   (and any other wrapper) `cause` chains so the route handler can
 *   redirect without knowing the wrapping shape.
 *
 * `connectAuthProvider` is re-exported unchanged from
 * `@vercel/connect/mcp` for callers who build the transport config
 * themselves; pass `consent: 'eager'` explicitly only with
 * `type: 'http'`.
 *
 * Nothing here imports `@tanstack/ai`, `@tanstack/ai-mcp`,
 * `@ai-sdk/mcp`, or `@modelcontextprotocol/sdk`: the returned provider
 * is the self-contained `ConnectOAuthClientProvider`, which the test
 * suite asserts is assignable to both SDKs' `OAuthClientProvider`
 * interfaces, and the transport config types below mirror
 * `@tanstack/ai-mcp`'s structurally. See
 * `docs/tanstack-ai-mcp-integration.md`.
 *
 * ```ts
 * import { chat, toServerSentEventsResponse } from '@tanstack/ai';
 * import { createMCPClient } from '@tanstack/ai-mcp';
 * import {
 *   connectMCPTransport,
 *   getConsentChallenge,
 * } from '@vercel/connect/tanstack-ai';
 *
 * export async function POST(request: Request) {
 *   try {
 *     const linear = await createMCPClient({
 *       transport: connectMCPTransport(
 *         { type: 'http', url: 'https://mcp.linear.app/mcp' },
 *         'oauth/linear',
 *         { subject: { type: 'user', id: userId } },
 *         { redirectUrl: 'https://app.example.com/integrations' }
 *       ),
 *     });
 *     const stream = chat({ adapter, messages, mcp: { clients: [linear] } });
 *     return toServerSentEventsResponse(stream);
 *   } catch (err) {
 *     const challenge = getConsentChallenge(err);
 *     if (challenge) return Response.redirect(challenge.url);
 *     throw err;
 *   }
 * }
 * ```
 */
import {
  connectAuthProvider,
  type ConnectAuthProviderOptions,
  type ConnectOAuthClientProvider,
} from '../mcp/connect-auth-provider.js';
import type { ConnectTokenParams } from '../token.js';

/**
 * The network transport configs accepted by `@tanstack/ai-mcp`'s
 * `createMCPClient` / `createMCPClients`, mirrored structurally so this
 * module needs no TanStack import. `type: 'http'` is Streamable HTTP
 * (preferred, edge-safe); `type: 'sse'` is the legacy SSE transport.
 */
export interface ConnectMCPTransportConfig {
  readonly type: 'http' | 'sse';
  readonly url: string;
  /** Extra headers sent with every request (e.g. deployment-protection bypass). */
  readonly headers?: Record<string, string>;
  /** Bring-your-own `fetch`, forwarded to the SDK transport. */
  readonly fetch?: typeof fetch;
}

/**
 * {@link ConnectMCPTransportConfig} with the Connect provider attached
 * and, unless `redirect: 'follow'` was requested, a `fetch` that refuses
 * HTTP redirects.
 */
export type ConnectMCPTransport<T extends ConnectMCPTransportConfig> = T & {
  readonly fetch?: typeof fetch;
  readonly authProvider: ConnectOAuthClientProvider;
};

/** Options accepted by {@link connectMCPTransport}. */
export interface ConnectMCPTransportOptions extends ConnectAuthProviderOptions {
  /**
   * How HTTP redirects from the MCP server are handled, for every
   * request the transport makes (`initialize`, tool calls, the SSE
   * stream, session teardown).
   *
   * - `'error'` (default): the request fails instead of following the
   *   redirect. The official SDK otherwise uses native fetch's
   *   `'follow'`, which lets a compromised MCP server bounce the
   *   application to private-network URLs (a blind GET; the Fetch
   *   spec strips `Authorization` on cross-origin redirects). This
   *   matches `@ai-sdk/mcp`, whose transport also defaults to
   *   `'error'`.
   * - `'follow'`: native behavior, for an endpoint that legitimately
   *   redirects. `config.fetch` is then passed through untouched.
   *
   * The policy is applied by wrapping `config.fetch` (or the global
   * `fetch`, resolved at call time), so a caller-supplied guarded
   * fetch keeps its own protections. On `type: 'http'` the wrapper
   * passes fetch's own `redirect: 'error'`, which rejects the request.
   * On `type: 'sse'` it passes `redirect: 'manual'` instead: the
   * official SDK's `SSEClientTransport` runs `fetch` inside an
   * EventSource that treats any rejection as a retryable network
   * error and reconnects every few seconds with no handle left for
   * the caller to close, whereas a non-200 response is terminal. With
   * `'manual'` the 3xx comes back as that terminal response, so the
   * connection fails once and stays closed.
   */
  readonly redirect?: 'follow' | 'error';
}

/**
 * Builds a `@tanstack/ai-mcp` transport config whose `authProvider` is
 * backed by Vercel Connect, choosing the consent mode that is safe for
 * the transport: `'eager'` for `type: 'http'` (consent surfaces inside
 * `createMCPClient`, before any request reaches the server) and
 * `'transport'` for `type: 'sse'` (the MCP-spec 401 flow; eager mode
 * would be flattened into a retry loop by the SSE EventSource). An
 * explicit `options.consent` overrides the choice — only do that with
 * `type: 'http'`.
 *
 * `headers` on `config` are passed through untouched. `fetch` is
 * wrapped to refuse HTTP redirects unless `options.redirect` is
 * `'follow'`; see {@link ConnectMCPTransportOptions.redirect}.
 *
 * @param config TanStack transport config without `authProvider`.
 * @param connector Vercel Connect connector UID (e.g. `oauth/linear`)
 *   or opaque connector id.
 * @param params Token request parameters — always specify a `subject`.
 * @param options Optional adapter and transport behavior overrides.
 */
export function connectMCPTransport<T extends ConnectMCPTransportConfig>(
  config: T,
  connector: string,
  params: ConnectTokenParams,
  options?: ConnectMCPTransportOptions
): ConnectMCPTransport<T> {
  const { redirect = 'error', ...providerOptions } = options ?? {};
  const consent =
    providerOptions.consent ?? (config.type === 'http' ? 'eager' : 'transport');
  return {
    ...config,
    ...(redirect === 'error' && {
      fetch: withoutRedirects(config.fetch, config.type),
    }),
    authProvider: connectAuthProvider(connector, params, {
      ...providerOptions,
      consent,
    }),
  };
}

/**
 * Wraps `fetchImpl` (or the global `fetch`, looked up per call so
 * request-scoped fetch shims keep working) so no request follows a
 * server-chosen `Location`.
 *
 * Streamable HTTP gets `redirect: 'error'`: fetch rejects the 3xx with
 * a `TypeError` and the SDK surfaces a connection error. SSE gets
 * `redirect: 'manual'`: fetch resolves with the 3xx itself (status
 * `303`, or `0` on runtimes that return an opaque redirect), which the
 * SDK's EventSource treats as a terminal non-200 response. A rejection
 * there would instead be treated as a transient network error and
 * retried on a timer that outlives the failed `createMCPClient` call.
 */
function withoutRedirects(
  fetchImpl: typeof fetch | undefined,
  transportType: ConnectMCPTransportConfig['type']
): typeof fetch {
  const redirect: RequestRedirect =
    transportType === 'sse' ? 'manual' : 'error';
  return (input, init) => (fetchImpl ?? fetch)(input, { ...init, redirect });
}

export {
  CONNECT_DISCOVERY_STATE,
  CONNECT_MANAGED_REDIRECT_URL,
  connectAuthProvider,
  ConsentRequiredError,
  getConsentChallenge,
  isConsentRequiredError,
  type ConnectAuthProviderOptions,
  type ConnectConsentMode,
  type ConnectOAuthClientInformation,
  type ConnectOAuthClientMetadata,
  type ConnectOAuthClientProvider,
  type ConnectOAuthDiscoveryState,
  type ConnectOAuthTokens,
  type ConsentChallenge,
} from '../mcp/connect-auth-provider.js';

export {
  ConnectError,
  ConnectorInstallationRequiredError,
  NoValidTokenError,
  UserAuthorizationRequiredError,
  type ConnectErrorOptions,
  type ConnectTokenExchangeSubject,
  type ConnectTokenParams,
  type ConnectTokenSubject,
  type ConnectVendorErrorPayload,
} from '../token.js';
