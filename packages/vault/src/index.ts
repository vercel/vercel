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

// Convenience export for direct usage
export { getVercelOidcToken } from '@vercel/oidc';
