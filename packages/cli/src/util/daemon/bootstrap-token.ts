import { getVercelOidcToken, saveToken } from '@vercel/oidc/token-util';
import { readAuthConfig } from '@vercel/oidc/auth-config';

/**
 * Bootstrap an OIDC token file after linking a project
 * This ensures the daemon has a token to refresh immediately
 */
export async function bootstrapOidcToken(
  projectId: string,
  teamId?: string
): Promise<void> {
  try {
    // Get current auth token
    const authConfig = readAuthConfig();
    if (!authConfig?.token) {
      // No auth token available, daemon will handle this later
      return;
    }

    // Fetch OIDC token from API
    const tokenResponse = await getVercelOidcToken(
      authConfig.token,
      projectId,
      teamId
    );

    if (!tokenResponse) {
      // Failed to get token, daemon will retry later
      return;
    }

    // Save token to disk
    saveToken(tokenResponse, projectId);
  } catch (err) {
    // Ignore errors - daemon will handle token refresh if bootstrap fails
    // This is fire-and-forget to avoid blocking the link command
  }
}
