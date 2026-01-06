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

export async function refreshToken(): Promise<void> {
  const { projectId, teamId } = findProjectInfo();
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
    saveToken(maybeToken, projectId, teamId);
  }
  process.env.VERCEL_OIDC_TOKEN = maybeToken.token;
  return;
}
