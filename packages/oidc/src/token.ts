import { VercelOidcTokenError } from './token-error';
import {
  findProjectInfo,
  getTokenPayload,
  getVercelCliToken,
  getVercelOidcToken,
  isExpired,
  loadToken,
  saveToken,
} from './token-util';

export async function refreshToken(existingToken?: string): Promise<void> {
  let projectId: string | undefined;
  let teamId: string | undefined;

  if (existingToken) {
    // Extract project info from existing token (unverified decode)
    const payload = getTokenPayload(existingToken);
    projectId = payload.project_id;
    teamId = payload.owner_id;
  }

  if (!projectId) {
    // Fall back to filesystem if no token or token doesn't have project info
    const info = findProjectInfo();
    projectId = info.projectId;
    teamId = info.teamId;
  }

  let maybeToken = loadToken(projectId);

  if (!maybeToken || isExpired(getTokenPayload(maybeToken.token))) {
    const authToken = await getVercelCliToken();
    if (!authToken) {
      throw new VercelOidcTokenError(
        'Failed to refresh OIDC token: Log in to Vercel CLI and link your project with `vc link`'
      );
    }
    if (!projectId) {
      throw new VercelOidcTokenError(
        'Failed to refresh OIDC token: Try re-linking your project with `vc link`'
      );
    }
    maybeToken = await getVercelOidcToken(authToken, projectId, teamId);
    if (!maybeToken) {
      throw new VercelOidcTokenError('Failed to refresh OIDC token');
    }
    saveToken(maybeToken, projectId);
  }
  process.env.VERCEL_OIDC_TOKEN = maybeToken.token;
  return;
}
