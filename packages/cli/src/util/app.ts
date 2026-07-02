import type { TokenIntrospectionResponse } from './introspect-token';

export interface App {
  id: string;
  name?: string;
}

export function isAppPrincipalEnabled() {
  return !!process.env['APP_PRINCIPAL_ENABLED'];
}

export function resolveAppFromToken(
  token: TokenIntrospectionResponse
): App | null {
  if (!token.active || !token.client_id) {
    return null;
  }

  return {
    id: token.client_id,
    name: token.client_name,
  };
}
