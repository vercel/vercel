import ms from 'ms';
import os from 'os';
import path from 'path';
import fs from 'fs';

interface TokenPayload {
  sub: string;
  name: string;
  exp: number;
}

function getVercelDataDir(): string | null {
  const vercelFolder = 'com.vercel.cli';
  if (process.env.XDG_DATA_HOME) {
    return path.join(process.env.XDG_DATA_HOME, vercelFolder);
  }
  switch (os.platform()) {
    case 'darwin':
      return path.join('~/Library/Application Support', vercelFolder);
    case 'linux':
      return path.join('~/.local/share', vercelFolder);
    case 'win32':
      return path.join('%LOCALAPPDATA%', vercelFolder);
    default:
      return null;
  }
}

function getVercelCliToken(): string | null {
  const dataDir = getVercelDataDir();
  if (!dataDir) {
    return null;
  }
  const tokenPath = path.join(dataDir, 'auth.json');
  if (!fs.existsSync(tokenPath)) {
    return null;
  }
  const token = fs.readFileSync(tokenPath, 'utf8');
  return JSON.parse(token).token;
}

interface VercelTokenResponse {
  token: string;
}

async function getVercelOidcToken(
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
      throw new Error(`failed to refresh token: ${res.statusText}`);
    }
    if (!res.json) {
      throw new Error('failed to refresh token: no json response');
    }
    const tokenRes = (await res.json()) as VercelTokenResponse;
    return tokenRes;
  } catch (e) {
    const message = e instanceof Error ? e.message : e;
    throw new Error(`failed to refresh token: ${message}`);
  }
}

function findProjectId(): string {
  const dir = findRootDir();
  if (!dir) {
    throw new Error('unable to find root directory');
  }
  try {
    const pkgPath = path.join(dir, '.vercel', 'project.json');
    if (!fs.existsSync(pkgPath)) {
      throw new Error('project.json not found');
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return pkg.projectId;
  } catch (e) {
    const message = e instanceof Error ? e.message : e;
    throw new Error(`unable to find project id: ${message}`);
  }
}

function findRootDir(): string {
  try {
    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
      const pkgPath = path.join(dir, '.vercel');
      if (fs.existsSync(pkgPath)) {
        return dir;
      }
      dir = path.dirname(dir);
    }
  } catch (e) {
    throw new Error('token refresh only supported in node server environments');
  }
  throw new Error('unable to find root directory');
}

function saveToken(token: VercelTokenResponse, projectId: string): void {
  try {
    const tmpDir = os.tmpdir();
    const tokenPath = path.join(tmpDir, `${projectId}.json`);
    const tokenJson = JSON.stringify(token);
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
    fs.writeFileSync(tokenPath, tokenJson);
    return;
  } catch (e) {
    const message = e instanceof Error ? e.message : e;
    throw new Error(`failed to save token: ${message}`);
  }
}

function loadToken(projectId: string): VercelTokenResponse | null {
  try {
    const tmpDir = os.tmpdir();
    const tokenPath = path.join(tmpDir, `${projectId}.json`);
    if (!fs.existsSync(tokenPath)) {
      return null;
    }
    const tokenJson = fs.readFileSync(tokenPath, 'utf8');
    const token = JSON.parse(tokenJson) as VercelTokenResponse;
    return token;
  } catch (e) {
    const message = e instanceof Error ? e.message : e;
    throw new Error(`failed to load token: ${message}`);
  }
}

export function getTokenPayload(token: string): TokenPayload {
  const tokenParts = token.split('.');
  if (tokenParts.length !== 3) {
    throw new Error('Invalid token');
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

export async function refreshToken(): Promise<void> {
  let maybeToken = loadToken(findProjectId());
  if (!maybeToken || isExpired(getTokenPayload(maybeToken.token))) {
    const authToken = getVercelCliToken();
    if (!authToken) {
      throw new Error('failed to refresh token: login to vercel cli');
    }
    const projectId = findProjectId();
    if (!projectId) {
      throw new Error('failed to refresh token: project id not found');
    }
    maybeToken = await getVercelOidcToken(authToken, projectId);
    if (!maybeToken) {
      throw new Error('failed to refresh token');
    }
    saveToken(maybeToken, projectId);
  }
  process.env.VERCEL_OIDC_TOKEN = maybeToken.token;
  return;
}
