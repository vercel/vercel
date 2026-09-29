import type { TokenIntrospectionGateway } from '../../src/gateways/token-introspection-gateway';
import type { GatewayResult } from '../../src/gateways/result';
import type { TokenIntrospectionResponse } from '../../src/util/introspect-token';

export type FakeTokenIntrospectionState = {
  /** Introspection responses keyed by token. Unknown tokens fail. */
  tokens?: Record<string, TokenIntrospectionResponse>;
};

/** In-memory OAuth token introspection. */
export class FakeTokenIntrospectionGateway
  implements TokenIntrospectionGateway
{
  #tokens: Map<string, TokenIntrospectionResponse>;

  constructor(state: FakeTokenIntrospectionState = {}) {
    this.#tokens = new Map(
      Object.entries(state.tokens ?? {}).map(([token, response]) => [
        token,
        structuredClone(response),
      ])
    );
  }

  async introspect({
    token,
  }: {
    token: string;
  }): Promise<GatewayResult<TokenIntrospectionResponse>> {
    if (!token) {
      return {
        ok: false,
        error: { code: 'no_token', message: 'No token to introspect' },
      };
    }
    const response = this.#tokens.get(token);
    if (!response) {
      const cause = new Error('Could not introspect token.');
      return {
        ok: false,
        error: {
          code: 'introspection_failed',
          message: cause.message,
          details: { cause },
        },
      };
    }
    return { ok: true, value: structuredClone(response) };
  }
}
