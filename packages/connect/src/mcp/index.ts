/**
 * Public surface of the `@vercel/connect/mcp` subpath.
 *
 * Holds the MCP-spec `OAuthClientProvider` adapter for Vercel
 * Connect. Plug the returned object into any MCP client that
 * consumes the spec — `@ai-sdk/mcp`, the official
 * `@modelcontextprotocol/typescript-sdk`, Mastra's MCP client,
 * etc. AI SDK consumers should import the same function from
 * `@vercel/connect/ai-sdk` instead; that subpath re-exports from
 * here.
 *
 * This entrypoint has no runtime or type import of `@ai-sdk/mcp` or
 * `@modelcontextprotocol/sdk`; `connectAuthProvider` returns the
 * self-contained `ConnectOAuthClientProvider`, which the test suite
 * asserts is assignable to both SDKs' `OAuthClientProvider`. Both
 * packages are declared as optional peers only to signal the tested
 * version ranges.
 *
 * ```ts
 * import { createMCPClient } from '@ai-sdk/mcp';
 * import { connectAuthProvider } from '@vercel/connect/mcp';
 *
 * const mcpClient = await createMCPClient({
 *   transport: {
 *     type: 'http',
 *     url: 'https://mcp.linear.app',
 *     authProvider: connectAuthProvider('oauth/linear', {
 *       subject: { type: 'user', id: userId },
 *       scopes: ['read'],
 *     }),
 *   },
 * });
 * ```
 */
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
} from './connect-auth-provider.js';

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

export {
  discoverEvents as experimental_discoverEvents,
  listEventTypes as experimental_listEventTypes,
  subscribe as experimental_subscribe,
  listSubscriptions as experimental_listSubscriptions,
  getSubscription as experimental_getSubscription,
  unsubscribe as experimental_unsubscribe,
  unsubscribeAll as experimental_unsubscribeAll,
  type McpEventScope as Experimental_McpEventScope,
  type McpEventSourceInput as Experimental_McpEventSourceInput,
  type McpEventOptions as Experimental_McpEventOptions,
  type McpEventDescriptor as Experimental_McpEventDescriptor,
  type McpEventSubject as Experimental_McpEventSubject,
  type McpSubscribeInput as Experimental_McpSubscribeInput,
  type McpSubscription as Experimental_McpSubscription,
  type McpSubscriptionStatus as Experimental_McpSubscriptionStatus,
  type McpSubscriptionLookupInput as Experimental_McpSubscriptionLookupInput,
} from './events.js';

export {
  verifyMcpEvent as experimental_verifyMcpEvent,
  McpEventVerificationError as Experimental_McpEventVerificationError,
  type McpEventDelivery as Experimental_McpEventDelivery,
  type VerifyMcpEventOptions as Experimental_VerifyMcpEventOptions,
} from './verify-event.js';
