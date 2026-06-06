/**
 * Public surface of the `@vercel/connect/ai-sdk` subpath.
 *
 * Two integration paths, same Connect grant:
 *
 * 1. MCP — `connectAuthProvider` (and its consent types), re-exported
 *    so AI SDK users have a single, ergonomic import. The provider plugs
 *    straight into `@ai-sdk/mcp`'s `createMCPClient` `authProvider` and
 *    works with AI SDK v6 and v7.
 * 2. Direct tools — `connect.tool` / `connectTool` build an AI SDK
 *    `tool()` whose `execute` receives a token-injecting `fetch`, and
 *    `connect.fetch` / `connectFetch` give you that fetch on its own.
 *    A missing grant becomes a `ConnectRequiredOutput` the UI renders as
 *    a "Connect" button. See `docs/ai-sdk-mcp-integration.md`.
 *
 * Tool-call approval (Human-in-the-Loop) is intentionally not
 * provided here — it is independent of Connect and already covered by
 * the AI SDK's own `toolApproval` primitive (and `wrapMcpTools` in
 * `@ai-sdk/policy-opa`). See `docs/ai-sdk-mcp-integration.md`.
 *
 * Both `ai` and `@ai-sdk/mcp` are optional peer dependencies:
 * importing this entrypoint requires them to be installed in the
 * consumer project, but the rest of `@vercel/connect` works without
 * them.
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
  connectAuthProvider,
  ConsentRequiredError,
  type ConnectAuthProviderOptions,
  type ConsentChallenge,
} from '../mcp/connect-auth-provider.js';

export {
  connect,
  connectTool,
  connectFetch,
  type ConnectFetchOptions,
  type ConnectRequiredOutput,
  type ConnectToolConfig,
  type ConnectToolExecuteOptions,
  type ConnectToolSubject,
} from './connect-tool.js';

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
