import * as fs from 'fs';
import * as path from 'path';
import {
  type AuthConfig,
  isValidAccessToken,
  readAuthConfig,
  writeAuthConfig,
} from './auth-config';
import { processTokenResponse, refreshTokenRequest } from './oauth';
import { VercelOidcTokenError } from './token-error';
import { findRootDir, getUserDataDir } from './token-io';

export function getVercelDataDir(): string | null {
  const vercelFolder = 'com.vercel.cli';
  const dataDir = getUserDataDir();
  if (!dataDir) {
    return null;
  }
  return path.join(dataDir, vercelFolder);
}

export async function getVercelCliToken(): Promise<string | null> {
  const authConfig = readAuthConfig();
  if (!authConfig) {
    return null;
  }

  if (isValidAccessToken(authConfig)) {
    return authConfig.token || null;
  }

  if (!authConfig.refreshToken) {
    // No refresh token available, clear auth and return null
    writeAuthConfig({});
    return null;
  }

  try {
    const tokenResponse = await refreshTokenRequest({
      refresh_token: authConfig.refreshToken,
    });

    const [tokensError, tokens] = await processTokenResponse(tokenResponse);

    if (tokensError || !tokens) {
      // Refresh failed - clear auth
      writeAuthConfig({});
      return null;
    }

    // Update auth config with new tokens
    const updatedConfig: AuthConfig = {
      token: tokens.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    };

    if (tokens.refresh_token) {
      updatedConfig.refreshToken = tokens.refresh_token;
    }

    writeAuthConfig(updatedConfig);
    return updatedConfig.token ?? null;
  } catch (_error) {
    // Network error or other failure - clear auth
    writeAuthConfig({});
    return null;
  }
}

interface VercelTokenResponse {
  token: string;
}

export async function getVercelOidcToken(
  authToken: string,
  projectId: string,
  teamId?: string
): Promise<VercelTokenResponse | null> {
  const url = `https://api.vercel.com/v1/projects/${projectId}/token?source=vercel-oidc-refresh${teamId ? `&teamId=${teamId}` : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });
  if (!res.ok) {
    throw new VercelOidcTokenError(
      `Failed to refresh OIDC token: ${res.statusText}`
    );
  }
  const tokenRes = await res.json();
  assertVercelOidcTokenResponse(tokenRes);
  return tokenRes;
}

export function assertVercelOidcTokenResponse(
  res: unknown
): asserts res is VercelTokenResponse {
  if (!res || typeof res !== 'object') {
    throw new TypeError(
      'Vercel OIDC token is malformed. Expected an object. Please run `vc env pull` and try again'
    );
  }
  if (!('token' in res) || typeof res.token !== 'string') {
    throw new TypeError(
      'Vercel OIDC token is malformed. Expected a string-valued token property. Please run `vc env pull` and try again'
    );
  }
}

export function findProjectInfo(): { projectId: string; teamId: string } {
  const dir = findRootDir();
  if (!dir) {
    throw new VercelOidcTokenError(
      'Unable to find project root directory. Have you linked your project with `vc link?`'
    );
  }
  const prjPath = path.join(dir, '.vercel', 'project.json');
  if (!fs.existsSync(prjPath)) {
    throw new VercelOidcTokenError(
      'project.json not found, have you linked your project with `vc link?`'
    );
  }
  const prj = JSON.parse(fs.readFileSync(prjPath, 'utf8'));
  if (typeof prj.projectId !== 'string' && typeof prj.orgId !== 'string') {
    throw new TypeError(
      'Expected a string-valued projectId property. Try running `vc link` to re-link your project.'
    );
  }
  return { projectId: prj.projectId, teamId: prj.orgId };
}

export function saveToken(token: VercelTokenResponse, projectId: string): void {
  const dir = getUserDataDir();
  if (!dir) {
    throw new VercelOidcTokenError(
      'Unable to find user data directory. Please reach out to Vercel support.'
    );
  }
  const tokenPath = path.join(dir, 'com.vercel.token', `${projectId}.json`);
  const tokenJson = JSON.stringify(token);
  fs.mkdirSync(path.dirname(tokenPath), { mode: 0o770, recursive: true }); // read/write/exec perms for owner/group only, x required for dir ops
  fs.writeFileSync(tokenPath, tokenJson);
  fs.chmodSync(tokenPath, 0o660); // read/write perms for owner only
  return;
}

export function loadToken(projectId: string): VercelTokenResponse | null {
  const dir = getUserDataDir();
  if (!dir) {
    throw new VercelOidcTokenError(
      'Unable to find user data directory. Please reach out to Vercel support.'
    );
  }
  const tokenPath = path.join(dir, 'com.vercel.token', `${projectId}.json`);
  if (!fs.existsSync(tokenPath)) {
    return null;
  }
  const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  assertVercelOidcTokenResponse(token);
  return token;
}

interface TokenPayload {
  sub: string;
  name: string;
  exp: number;
}

export function getTokenPayload(token: string): TokenPayload {
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    throw new VercelOidcTokenError(
      'Invalid token. Please run `vc env pull` and try again'
    );
  }

  const base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '='
  );
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

export function isExpired(token: TokenPayload): boolean {
  return token.exp * 1000 < Date.now();
}
