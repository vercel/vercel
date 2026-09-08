import type { ConnectTokenParams } from '../token.js';

export function withDefaultScopes(
  params: ConnectTokenParams
): ConnectTokenParams {
  return params.scopes === undefined ? { ...params, scopes: ['*'] } : params;
}
