import { VercelOidcTokenError } from './token-error';
import {
  findProjectId,
  getTokenPayload,
  getVercelCliToken,
  getVercelOidcToken,
  isExpired,
  loadToken,
  saveToken,
} from './token-util';

export async function refreshToken(): Promise<void> {
  let maybeToken = loadToken(findProjectId());
  if (!maybeToken || isExpired(getTokenPayload(maybeToken.token))) {
    const authToken = getVercelCliToken();
    if (!authToken) {
      throw new VercelOidcTokenError(
        'Failed to refresh OIDC token: login to vercel cli'
      );
    }
    const projectId = findProjectId();
    if (!projectId) {
      throw new VercelOidcTokenError(
        'Failed to refresh OIDC token: project id not found'
      );
    }
    maybeToken = await getVercelOidcToken(authToken, projectId);
    if (!maybeToken) {
      throw new VercelOidcTokenError('Failed to refresh OIDC token');
    }
    saveToken(maybeToken, projectId);
  }
  process.env.VERCEL_OIDC_TOKEN = maybeToken.token;
  return;
}
