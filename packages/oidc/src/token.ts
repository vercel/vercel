import { VercelOidcTokenError } from './token-error';
import {
  findProjectInfo,
  getTokenPayload,
  getVercelCliToken,
  getVercelOidcToken,
  isExpired,
  loadToken,
  saveToken,
  resolveProjectId,
} from './token-util';

export interface RefreshTokenOptions {
  /**
   * Team ID or slug. Accepts both team IDs (team_*) and team slugs.
   */
  team?: string;
  /**
   * Project ID or slug. Accepts both project IDs (prj_*) and project slugs.
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
  let project: string | undefined = options?.project;
  let team: string | undefined = options?.team;

  // If neither is provided, read from project.json
  if (!project && !team) {
    const projectInfo = findProjectInfo();
    project = projectInfo.projectId;
    team = projectInfo.teamId;
  } else if (!project || !team) {
    // If only one is provided, read project.json for the missing value
    const projectInfo = findProjectInfo();
    project = project ?? projectInfo.projectId;
    team = team ?? projectInfo.teamId;
  }

  // At this point, we should have both project and team (or at least project)
  if (!project) {
    throw new VercelOidcTokenError(
      'Failed to refresh OIDC token: No project specified. Try re-linking your project with `vc link`'
    );
  }

  // Get auth token early if we need to resolve slugs
  const needsResolution = !project.startsWith('prj_');
  let authToken: string | undefined;

  if (needsResolution) {
    authToken = await getVercelCliToken({
      expirationBufferMs: options?.expirationBufferMs,
    });
  }

  // Resolve project to ID if needed (team IDs and slugs both work with Vercel APIs)
  const projectId =
    needsResolution && authToken
      ? await resolveProjectId(authToken, project, team)
      : project;
  const teamId = team;

  // Check if we have a valid cached token
  let maybeToken = loadToken(projectId);

  if (
    !maybeToken ||
    isExpired(getTokenPayload(maybeToken.token), options?.expirationBufferMs)
  ) {
    // Get auth token if we haven't already
    if (!authToken) {
      authToken = await getVercelCliToken({
        expirationBufferMs: options?.expirationBufferMs,
      });
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
