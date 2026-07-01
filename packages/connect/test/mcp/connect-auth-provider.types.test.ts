/**
 * Type-level compatibility tests. These exist so that an AI SDK
 * release that drifts the `OAuthClientProvider` shape produces a
 * red CI signal, not a runtime cast at the consumer's call site.
 *
 * Vitest only runs the `it()` block at runtime; the assignments
 * above it are the actual contract — they fail at type-check time
 * if the adapter return value is no longer assignable to the
 * provider interface from `@ai-sdk/mcp`.
 */
import type { OAuthClientProvider } from '@ai-sdk/mcp';
import { describe, expectTypeOf, it } from 'vitest';
import { connectAuthProvider } from '../../src/mcp/connect-auth-provider.js';

const provider: OAuthClientProvider = connectAuthProvider('oauth/linear', {
  subject: { type: 'user', id: 'user_test' },
});

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

  it('accepts every documented subject type', () => {
    connectAuthProvider('oauth/linear', { subject: { type: 'app' } });
    connectAuthProvider('oauth/linear', {
      subject: { type: 'user', id: 'user_1' },
    });
    connectAuthProvider('oauth/linear', {
      subject: { type: 'jwt-bearer', sub: 'subject_id' },
    });
  });
});
