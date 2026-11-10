/**
 * Public surface of the `@vercel/connect/ai-sdk` subpath.
 *
 * Re-exports the MCP-spec `connectAuthProvider` (and its consent
 * types) so AI SDK users have a single, ergonomic import. The
 * provider plugs straight into `@ai-sdk/mcp`'s `createMCPClient`
 * `authProvider` and works with AI SDK v6 and v7.
 *
 * Tool-call approval (Human-in-the-Loop) is intentionally not
 * provided here — it is independent of Connect and already covered by
 * the AI SDK's own `toolApproval` primitive (and `wrapMcpTools` in
 * `@ai-sdk/policy-opa`). See `docs/ai-sdk-mcp-integration.md`.
 *
 * This entrypoint has no runtime or type import of `ai` or
 * `@ai-sdk/mcp`; `connectAuthProvider` returns the self-contained
 * `ConnectOAuthClientProvider`, which the test suite asserts is
 * assignable to `@ai-sdk/mcp`'s `OAuthClientProvider`. Both packages
 * are declared as optional peers only to signal the tested version
 * ranges.
 *
 * ```ts
 * import { createMCPClient } from '@ai-sdk/mcp';
 * import { streamText } from 'ai';
 * import {
 *   connectAuthProvider,
 *   ConsentRequiredError,
 * } from '@vercel/connect/ai-sdk';
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
 *
 * try {
 *   const result = await streamText({
 *     model: 'openai/gpt-5.4',
 *     tools: await mcpClient.tools(),
 *     prompt,
 *   });
 *   return result.toUIMessageStreamResponse();
 * } catch (err) {
 *   if (err instanceof ConsentRequiredError) return Response.redirect(err.url);
 *   throw err;
 * }
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

export {
  experimental_connectEventsAdapter,
  type Experimental_ConnectEventsAdapter,
  type Experimental_ConnectEventOperations,
  type Experimental_ConnectEventsAdapterOptions,
  type Experimental_ConnectEventsListInput,
  type Experimental_ConnectEventsRequestOptions,
  type Experimental_ConnectEventsSubscribeInput,
  type Experimental_ConnectEventsSubscription,
} from './connect-events-adapter.js';
