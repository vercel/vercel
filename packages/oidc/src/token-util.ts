import * as path from 'path';
import * as fs from 'fs';
import { VercelOidcTokenError } from './token-error';
import { findRootDir, getUserDataDir } from './token-io';
import ms from 'ms';

export function getVercelDataDir(): string | null {
  const vercelFolder = 'com.vercel.cli';
  const dataDir = getUserDataDir();
  if (!dataDir) {
    return null;
  }
  return path.join(dataDir, vercelFolder);
}

export function getVercelCliToken(): string | null {
  const dataDir = getVercelDataDir();
  if (!dataDir) {
    return null;
  }
  const tokenPath = path.join(dataDir, 'auth.json');
  if (!fs.existsSync(tokenPath)) {
    return null;
  }
  const token = fs.readFileSync(tokenPath, 'utf8');
  if (!token) {
    return null;
  }
  return JSON.parse(token).token;
}

interface VercelTokenResponse {
  token: string;
}

export async function getVercelOidcToken(
  authToken: string,
  projectId: string
): Promise<VercelTokenResponse | null> {
  try {
    const url = `https://api.vercel.com/v1/projects/${projectId}/token?source=vercel-oidc-refresh`;
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
  } catch (e) {
    throw new VercelOidcTokenError(`Failed to refresh OIDC token`, e);
  }
}

export function assertVercelOidcTokenResponse(
  res: unknown
): asserts res is VercelTokenResponse {
  if (!res || typeof res !== 'object') {
    throw new TypeError('Expected an object');
  }
  if (!('token' in res) || typeof res.token !== 'string') {
    throw new TypeError('Expected a string-valued token property');
  }
}

export function findProjectId(): string {
  const dir = findRootDir();
  if (!dir) {
    throw new VercelOidcTokenError('Unable to find root directory');
  }
  try {
    const prjPath = path.join(dir, '.vercel', 'project.json');
    if (!fs.existsSync(prjPath)) {
      throw new VercelOidcTokenError('project.json not found');
    }
    const prj = JSON.parse(fs.readFileSync(prjPath, 'utf8'));
    if (typeof prj.projectId !== 'string') {
      throw new TypeError('Expected a string-valued projectId property');
    }
    return prj.projectId;
  } catch (e) {
    throw new VercelOidcTokenError(`Unable to find project ID`, e);
  }
}

export function saveToken(token: VercelTokenResponse, projectId: string): void {
  try {
    const dir = getUserDataDir();
    if (!dir) {
      throw new VercelOidcTokenError('Unable to find user data directory');
    }
    const tokenPath = path.join(dir, 'com.vercel.token', `${projectId}.json`);
    console.log(tokenPath);
    const tokenJson = JSON.stringify(token);
    fs.mkdirSync(path.dirname(tokenPath), { mode: 0o660, recursive: true }); // read/write perms for owner only
    fs.writeFileSync(tokenPath, tokenJson);
    fs.chmodSync(tokenPath, 0o660); // read/write perms for owner only
    return;
  } catch (e) {
    throw new VercelOidcTokenError(`Failed to save token`, e);
  }
}

export function loadToken(projectId: string): VercelTokenResponse | null {
  try {
    const dir = getUserDataDir();
    if (!dir) {
      return null;
    }
    const tokenPath = path.join(dir, 'com.vercel.token', `${projectId}.json`);
    if (!fs.existsSync(tokenPath)) {
      return null;
    }
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    assertVercelOidcTokenResponse(token);
    return token;
  } catch (e) {
    throw new VercelOidcTokenError(`Failed to load token`, e);
  }
}

interface TokenPayload {
  sub: string;
  name: string;
  exp: number;
}

export function getTokenPayload(token: string): TokenPayload {
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    throw new VercelOidcTokenError('Invalid token');
  }

  const base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    '='
  );
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

export function isExpired(token: TokenPayload): boolean {
  const timeout = ms('15m');
  return token.exp * 1000 < Date.now() + timeout;
}
