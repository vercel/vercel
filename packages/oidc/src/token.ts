import { VercelOidcTokenError } from './token-error';
import {
  findProjectInfo,
  getTokenPayload,
  getVercelToken,
  getVercelOidcToken,
  isExpired,
  loadToken,
  saveToken,
} from './token-util';

export interface RefreshTokenOptions {
  /**
   * Team ID (team_*) or slug to use for token refresh.
   * When provided, this team will be used instead of reading from `.vercel/project.json`.
   */
  team?: string;
  /**
   * Project ID (prj_*) or slug to use for token refresh.
   * When provided, this project will be used instead of reading from `.vercel/project.json`.
   */
  project?: string;
  /**
   * Optional time buffer in milliseconds before token expiry to consider it expired.
   * When provided, the token will be refreshed if it expires within this buffer time.
   * @default 0
   */
  expirationBufferMs?: number;
}

export async function refreshToken(
  options?: RefreshTokenOptions
): Promise<void> {
  // Resolve parameters with precedence: explicit params > project.json
  let projectId: string | undefined = options?.project;
  let teamId: string | undefined = options?.team;

  // If neither is provided, read from project.json
  if (!projectId && !teamId) {
    const projectInfo = findProjectInfo();
    projectId = projectInfo.projectId;
    teamId = projectInfo.teamId;
  } else if (!projectId || !teamId) {
    // If only one is provided, read project.json for the missing value
    const projectInfo = findProjectInfo();
    projectId = projectId ?? projectInfo.projectId;
    teamId = teamId ?? projectInfo.teamId;
  }

  if (!projectId) {
    throw new VercelOidcTokenError(
      'Failed to refresh OIDC token: No project specified. Try re-linking your project with `vc link`'
    );
  }

  let maybeToken = loadToken(projectId);

  if (
    !maybeToken ||
    isExpired(getTokenPayload(maybeToken.token), options?.expirationBufferMs)
  ) {
    const authToken = await getVercelToken({
      expirationBufferMs: options?.expirationBufferMs,
    });

    maybeToken = await getVercelOidcToken(authToken, projectId, teamId);
    if (!maybeToken) {
      throw new VercelOidcTokenError('Failed to refresh OIDC token');
    }
    saveToken(maybeToken, projectId);
  }
  process.env.VERCEL_OIDC_TOKEN = maybeToken.token;
  return;
}
