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

export interface RefreshTokenOptions {
  teamId?: string;
  projectId?: string;
}

export async function refreshToken(
  options?: RefreshTokenOptions
): Promise<void> {
  // Use provided options or fall back to reading from .vercel/project.json
  let projectId: string;
  let teamId: string;

  if (options?.projectId && options?.teamId) {
    projectId = options.projectId;
    teamId = options.teamId;
  } else if (options?.projectId || options?.teamId) {
    // If only one is provided, we still need to read from project.json
    // to get the missing value, then override the provided one
    const projectInfo = findProjectInfo();
    projectId = options.projectId ?? projectInfo.projectId;
    teamId = options.teamId ?? projectInfo.teamId;
  } else {
    // No options provided, use the existing behavior
    const projectInfo = findProjectInfo();
    projectId = projectInfo.projectId;
    teamId = projectInfo.teamId;
  }

  let maybeToken = loadToken(projectId);

  if (!maybeToken || isExpired(getTokenPayload(maybeToken.token))) {
    // getVercelCliToken() now throws AccessTokenMissingError or RefreshAccessTokenFailedError
    // instead of returning null
    const authToken = await getVercelCliToken();
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
