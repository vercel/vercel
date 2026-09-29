import { isErrnoException } from '@vercel/error-utils';
// Only `introspectToken` is imported from this module: unit tests replace the
// module with a mock that exports nothing else.
import {
  introspectToken,
  type TokenIntrospectionResponse,
} from '../util/introspect-token';
import { gatewayErrorFromCause, type GatewayResult } from './result';

/** OAuth token introspection. */
export type TokenIntrospectionGateway = {
  /**
   * Error codes: `no_token`, `unsupported_api_origin` (the API origin is not
   * `https://api.vercel.com`), `introspection_failed` (`details.cause`).
   */
  introspect(input: {
    token: string;
  }): Promise<GatewayResult<TokenIntrospectionResponse>>;
};

export function liveTokenIntrospectionGateway({
  apiUrl,
}: {
  apiUrl: string;
}): TokenIntrospectionGateway {
  return {
    async introspect({ token }) {
      try {
        return {
          ok: true,
          value: await introspectToken({ authConfig: { token }, apiUrl }),
        };
      } catch (err: unknown) {
        const code =
          isErrnoException(err) &&
          (err.code === 'no_token' || err.code === 'unsupported_api_origin')
            ? err.code
            : 'introspection_failed';
        return { ok: false, error: gatewayErrorFromCause(code, err) };
      }
    },
  };
}
