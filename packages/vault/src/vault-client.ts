import { getVercelOidcToken } from '@vercel/oidc';
import { extractContext } from './token-parser';
import { fetchSecret } from './api-client';
import type {
  VaultClientConfig,
  GetSecretOptions,
  VaultSecretResponse,
  VaultEnvironment,
} from './types';

export class VaultClient {
  private baseUrl: string;

  constructor(config: VaultClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? 'https://api.vercel.com';
  }

  /**
   * Retrieves a secret from Vercel Vault.
   *
   * This method automatically extracts the team ID and project ID from the OIDC token.
   * The secret data is returned as a plain object with the secret's fields.
   *
   * @param name - The path/name of the secret to retrieve
   * @param options - Optional parameters to customize the request
   * @returns Promise resolving to the secret response with data and metadata
   *
   * @throws {VaultTokenError} If OIDC token is missing or invalid
   * @throws {VaultNotFoundError} If the secret doesn't exist
   * @throws {VaultAuthError} If authentication fails
   * @throws {VaultApiError} For other API errors
   *
   * @example
   * ```typescript
   * const client = new VaultClient();
   *
   * // Get project-specific secret (uses environment from JWT or defaults to PRODUCTION)
   * const secret = await client.getSecret('database-credentials');
   * console.log(secret.data); // { username: '...', password: '...' }
   *
   * // Get global secret (team-level, not project-specific)
   * const globalSecret = await client.getSecret('shared-api-key', {
   *   global: true
   * });
   *
   * // Get specific version from preview environment
   * const oldSecret = await client.getSecret('api-key', {
   *   environment: 'PREVIEW',
   *   version: 2
   * });
   * ```
   */
  async getSecret(
    name: string,
    options: GetSecretOptions = {}
  ): Promise<VaultSecretResponse> {
    // Get OIDC token (handles refresh if needed)
    const token = await getVercelOidcToken();

    // Extract context from token or use overrides
    const context = extractContext(token);
    const teamId = options.teamId ?? context.teamId;

    // Determine projectId: use "" for global secrets, otherwise use JWT or override
    let projectId: string;
    if (options.global) {
      // Global secrets use empty projectId
      projectId = '';
    } else if (options.projectId !== undefined) {
      // Explicit override
      projectId = options.projectId;
    } else {
      // Use project from JWT token
      projectId = context.projectId;
    }

    // Determine environment: explicit option > JWT claim > default to PRODUCTION
    let environment: VaultEnvironment;
    if (options.environment !== undefined) {
      // Explicit override
      environment = options.environment;
    } else if (context.environment) {
      // Use environment from JWT token if available
      environment = context.environment.toUpperCase() as VaultEnvironment;
    } else {
      // Default to PRODUCTION
      environment = 'PRODUCTION';
    }

    // Make API request
    return fetchSecret({
      baseUrl: this.baseUrl,
      token,
      teamId,
      path: name,
      projectId,
      environment,
      version: options.version,
    });
  }
}
