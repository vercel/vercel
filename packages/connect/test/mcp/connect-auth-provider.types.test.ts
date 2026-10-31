/**
 * Type-level compatibility tests. These exist so that an AI SDK or
 * MCP SDK release that drifts the `OAuthClientProvider` shape produces
 * a red CI signal, not a runtime cast at the consumer's call site.
 *
 * Vitest only runs the `it()` block at runtime; the assignments
 * above it are the actual contract — they fail at type-check time
 * if the adapter return value is no longer assignable to the
 * provider interface from `@ai-sdk/mcp` or from the official
 * `@modelcontextprotocol/sdk` (which `@tanstack/ai-mcp` builds on).
 */
import type { OAuthClientProvider } from '@ai-sdk/mcp';
import type { OAuthClientProvider as OfficialOAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  HttpTransportConfig,
  SseTransportConfig,
  TransportInput,
} from '@tanstack/ai-mcp';
import { describe, expectTypeOf, it } from 'vitest';
import { connectAuthProvider } from '../../src/mcp/connect-auth-provider.js';
import { connectMCPTransport } from '../../src/tanstack-ai/index.js';

const SUBJECT = { subject: { type: 'user' as const, id: 'user_test' } };

const provider: OAuthClientProvider = connectAuthProvider(
  'oauth/linear',
  SUBJECT
);

const officialProvider: OfficialOAuthClientProvider = connectAuthProvider(
  'oauth/linear',
  SUBJECT
);

const httpTransport: HttpTransportConfig = connectMCPTransport(
  { type: 'http', url: 'https://mcp.linear.app/mcp' },
  'oauth/linear',
  SUBJECT
);

const sseTransport: SseTransportConfig = connectMCPTransport(
  {
    type: 'sse',
    url: 'https://mcp.linear.app/sse',
    headers: { 'x-vercel-protection-bypass': 'token' },
  },
  'oauth/linear',
  SUBJECT
);

const asTransportInput: TransportInput = httpTransport;

describe('connectAuthProvider type compatibility', () => {
  it('satisfies @ai-sdk/mcp OAuthClientProvider', () => {
    expectTypeOf(provider).toMatchTypeOf<OAuthClientProvider>();
    expectTypeOf(provider.tokens).returns.toMatchTypeOf<
      ReturnType<OAuthClientProvider['tokens']>
    >();
    expectTypeOf(provider.redirectToAuthorization)
      .parameter(0)
      .toEqualTypeOf<URL>();
    expectTypeOf(provider.clientMetadata).toMatchTypeOf<
      OAuthClientProvider['clientMetadata']
    >();
  });

  it('satisfies the official @modelcontextprotocol/sdk OAuthClientProvider', () => {
    expectTypeOf(officialProvider).toMatchTypeOf<OfficialOAuthClientProvider>();
    expectTypeOf(officialProvider.tokens).returns.toMatchTypeOf<
      ReturnType<OfficialOAuthClientProvider['tokens']>
    >();
    expectTypeOf(officialProvider.clientInformation).returns.toMatchTypeOf<
      ReturnType<OfficialOAuthClientProvider['clientInformation']>
    >();
  });

  it("connectMCPTransport output is accepted by @tanstack/ai-mcp's transport types", () => {
    expectTypeOf(httpTransport).toMatchTypeOf<HttpTransportConfig>();
    expectTypeOf(sseTransport).toMatchTypeOf<SseTransportConfig>();
    expectTypeOf(asTransportInput).toMatchTypeOf<TransportInput>();
    // The literal `type` narrows through the generic.
    expectTypeOf(httpTransport.type).toEqualTypeOf<'http'>();
    expectTypeOf(sseTransport.type).toEqualTypeOf<'sse'>();
  });

  it('accepts every documented subject type', () => {
    connectAuthProvider('oauth/linear', { subject: { type: 'app' } });
    connectAuthProvider('oauth/linear', {
      subject: { type: 'user', id: 'user_1' },
    });
    connectAuthProvider('oauth/linear', {
      subject: { type: 'jwt-bearer', sub: 'subject_id' },
    });
    connectAuthProvider('oauth/linear', {
      subject: { type: 'token', token: 'passport.jwt' },
    });
  });
});
