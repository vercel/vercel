import * as path from 'path';
import * as fs from 'fs';
import { execVercelCli, VercelCliError } from '@vercel/cli-exec';
import {
  getGlobalPathConfig,
  tryReadAuthConfig,
  writeAuthConfig,
  type AuthConfig,
} from '@vercel/cli-config';
import { VercelOidcTokenError } from './token-error';
import { findRootDir, getUserDataDir } from './token-io';
import { refreshTokenRequest, processTokenResponse } from './oauth';
import {
  AccessTokenMissingError,
  RefreshAccessTokenFailedError,
} from './auth-errors';

export interface GetVercelTokenOptions {
  /**
   * Optional time buffer in milliseconds before token expiry to consider it expired.
   * When provided, the token will be refreshed if it expires within this buffer time.
   * @default 0
   */
  expirationBufferMs?: number;
}

export async function getVercelToken(
  options?: GetVercelTokenOptions
): Promise<string> {
  const configDir = getGlobalPathConfig();
  const authConfig = tryReadAuthConfig(configDir);

  if (!authConfig || (!authConfig.token && !authConfig.refreshToken)) {
    throw new AccessTokenMissingError();
  }

  if (isValidAccessToken(authConfig, options?.expirationBufferMs)) {
    return authConfig.token!;
  }

  if (!authConfig.refreshToken) {
    // No refresh token available, clear auth and throw
    writeAuthConfig(configDir, {});
    throw new RefreshAccessTokenFailedError('No refresh token available');
  }

  try {
    const tokenResponse = await refreshTokenRequest({
      refresh_token: authConfig.refreshToken,
    });

    const [tokensError, tokens] = await processTokenResponse(tokenResponse);

    if (tokensError || !tokens) {
      // Refresh failed - clear auth
      writeAuthConfig(configDir, {});
      throw new RefreshAccessTokenFailedError(tokensError);
    }

    // Update auth config with new tokens
    const updatedConfig: AuthConfig = {
      token: tokens.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
      refreshToken: tokens.refresh_token ?? authConfig.refreshToken,
    };

    writeAuthConfig(configDir, updatedConfig);
    // Token is guaranteed to be defined since we just set it from tokens.access_token
    return updatedConfig.token!;
  } catch (error) {
    // Network error or other failure - clear auth
    writeAuthConfig(configDir, {});
    if (
      error instanceof AccessTokenMissingError ||
      error instanceof RefreshAccessTokenFailedError
    ) {
      throw error;
    }
    throw new RefreshAccessTokenFailedError(error);
  }
}

function isValidAccessToken(
  authConfig: AuthConfig,
  expirationBufferMs = 0
): boolean {
  if (!authConfig.token) return false;

  // When `--token` is passed to a command, `expiresAt` will be missing.
  // We assume the token is valid in this case and handle errors further down.
  if (typeof authConfig.expiresAt !== 'number') return true;

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const bufferInSeconds = expirationBufferMs / 1000;
  return authConfig.expiresAt >= nowInSeconds + bufferInSeconds;
}

interface VercelTokenResponse {
  token: string;
}

export async function getVercelOidcTokenFromCli(
  projectId: string,
  teamId?: string
): Promise<VercelTokenResponse> {
  const args = ['project', 'token', projectId, '--format=json'];

  if (teamId) {
    args.push('--scope', teamId);
  }

  try {
    const { stdout } = await execVercelCli(args);
    let parsedOutput: unknown;

    if (typeof stdout !== 'string') {
      throw new VercelOidcTokenError(
        'Failed to refresh OIDC token: `vercel project token` did not return stdout'
      );
    }

    try {
      parsedOutput = JSON.parse(stdout);
    } catch {
      throw new VercelOidcTokenError(
        'Failed to refresh OIDC token: `vercel project token` returned invalid JSON: ' +
          stdout
      );
    }

    assertVercelOidcTokenResponse(parsedOutput);
    return parsedOutput;
  } catch (error) {
    if (error instanceof VercelOidcTokenError) {
      throw error;
    }

    let message = error instanceof Error ? error.message : '';
    const stderr =
      error instanceof VercelCliError ? error.stderr?.trim() : undefined;

    if (stderr && !message.includes(stderr)) {
      message = `${message}\n${stderr}`.trim();
    }

    throw new VercelOidcTokenError(
      message
        ? `Failed to refresh OIDC token with the Vercel CLI: ${message}`
        : 'Failed to refresh OIDC token with the Vercel CLI'
    );
  }
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
    throw new TypeError('Vercel OIDC token is malformed. Expected an object.');
  }
  if (!('token' in res) || typeof res.token !== 'string') {
    throw new TypeError(
      'Vercel OIDC token is malformed. Expected a string-valued token property.'
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
    throw new VercelOidcTokenError('Invalid token.');
  }

  const base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '='
  );
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

export function isExpired(token: TokenPayload, bufferMs = 0): boolean {
  return token.exp * 1000 < Date.now() + bufferMs;
}
