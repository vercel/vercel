/**
 * Public surface of the `@vercel/connect/ai-sdk` subpath.
 *
 * Holds AI SDK-specific helpers for adapting Vercel Connect to
 * `streamText` / `generateText` / the `Agent` class. The MCP-spec
 * `connectAuthProvider` is re-exported from
 * `@vercel/connect/mcp` for convenience — AI SDK users only need
 * this single import.
 *
 * The V2 helper `withConsentApproval` is AI SDK v7-only (it depends
 * on `ToolApprovalConfiguration` and `toolApproval`, both new in v7).
 * The re-exported `connectAuthProvider` works with AI SDK v6 and v7.
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
 *   withConsentApproval,
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
 * const linearTools = withConsentApproval(await mcpClient.tools(), {
 *   prefix: 'linear_',
 * });
 *
 * try {
 *   const result = await streamText({
 *     model: 'openai/gpt-5.4',
 *     tools: linearTools.tools,
 *     toolApproval: linearTools.toolApproval,
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
  withConsentApproval,
  type WithConsentApprovalOptions,
  type WithConsentApprovalResult,
} from './with-consent-approval.js';

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
