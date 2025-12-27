export { VaultClient } from './vault-client';
export type {
  VaultClientConfig,
  GetSecretOptions,
  VaultSecretResponse,
  VaultEnvironment,
  OidcTokenClaims,
} from './types';
export {
  VaultError,
  VaultTokenError,
  VaultApiError,
  VaultNotFoundError,
  VaultAuthError,
} from './errors';

// Note: Browser environments won't have OIDC token refresh capabilities
// but the client can still work if the token is provided via request context
