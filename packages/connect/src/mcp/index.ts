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
 * `@ai-sdk/mcp` is an optional peer dependency: importing this
 * entrypoint requires it to be installed in the consumer project,
 * but the rest of `@vercel/connect` works without it.
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
  connectAuthProvider,
  ConsentRequiredError,
  type ConnectAuthProviderOptions,
  type ConsentChallenge,
} from './connect-auth-provider.js';

export {
  ConnectError,
  ConnectorInstallationRequiredError,
  NoValidTokenError,
  UserAuthorizationRequiredError,
  type ConnectErrorOptions,
  type ConnectTokenParams,
  type ConnectTokenSubject,
  type ConnectVendorErrorPayload,
} from '../token.js';
