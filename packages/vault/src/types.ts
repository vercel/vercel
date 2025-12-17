// Environment type matching API expectations
export type VaultEnvironment = 'PRODUCTION' | 'PREVIEW' | 'DEVELOPMENT';

// Response structure from Vault API
export interface VaultSecretResponse {
  data: Record<string, unknown>;
  metadata: {
    version: number;
    createdAt: number;
  };
}

// Error response from Vault API
export interface VaultErrorResponse {
  errors: Array<{
    code: string;
    message: string;
    details?: unknown;
  }>;
}

// Options for getSecret method
export interface GetSecretOptions {
  environment?: VaultEnvironment;
  version?: number;
  teamId?: string; // Override auto-extracted teamId
  projectId?: string; // Override auto-extracted projectId
  global?: boolean; // Use global secrets (team-level) instead of project-specific secrets
}

// Client configuration
export interface VaultClientConfig {
  baseUrl?: string; // Default: 'https://api.vercel.com'
}

// Decoded OIDC token claims
export interface OidcTokenClaims {
  owner_id?: string; // Team ID
  project_id?: string;
  environment?: string;
  exp: number;
  sub: string;
  [key: string]: unknown;
}
