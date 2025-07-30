import ms from 'ms';
import os from 'os';
import path from 'path';
import fs from 'fs';

interface TokenPayload {
  sub: string;
  name: string;
  exp: number;
}

function getUserDataDir(): string | null {
  if (process.env.XDG_DATA_HOME) {
    return process.env.XDG_DATA_HOME;
  }
  switch (os.platform()) {
    case 'darwin':
      return path.join(os.homedir(), 'Library/Application Support');
    case 'linux':
      return path.join(os.homedir(), '.local/share');
    case 'win32':
      if (process.env.LOCALAPPDATA) {
        return process.env.LOCALAPPDATA;
      }
      return null;
    default:
      return null;
  }
}
function getVercelDataDir(): string | null {
  const vercelFolder = 'com.vercel.cli';
  const dataDir = getUserDataDir();
  if (!dataDir) {
    return null;
  }
  return path.join(dataDir, vercelFolder);
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

function assertVercelOidcTokenResponse(
  res: unknown
): asserts res is VercelTokenResponse {
  if (!res || typeof res !== 'object') {
    throw new TypeError('Expected an object');
  }
  if (!('token' in res) || typeof res.token !== 'string') {
    throw new TypeError('Expected a string-valued token property');
  }
}

function findProjectId(): string {
  const dir = findRootDir();
  if (!dir) {
    throw new VercelOidcTokenError('Unable to find root directory');
  }
  try {
    const pkgPath = path.join(dir, '.vercel', 'project.json');
    if (!fs.existsSync(pkgPath)) {
      throw new VercelOidcTokenError('Project.json not found');
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (typeof pkg.projectId !== 'string') {
      throw new TypeError('Expected a string-valued projectId property');
    }
    return pkg.projectId;
  } catch (e) {
    throw new VercelOidcTokenError(`Unable to find project id`, e);
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
    throw new VercelOidcTokenError(
      'Token refresh only supported in node server environments'
    );
  }
  throw new VercelOidcTokenError('Unable to find root directory');
}

function saveToken(token: VercelTokenResponse, projectId: string): void {
  try {
    const dir = getUserDataDir();
    if (!dir) {
      throw new VercelOidcTokenError('Unable to find user data directory');
    }
    const tokenPath = path.join(dir, 'com.vercel.token', `${projectId}.json`);
    const tokenJson = JSON.stringify(token);
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
    fs.writeFileSync(tokenPath, tokenJson);
    fs.chmodSync(tokenPath, 0o600);
    return;
  } catch (e) {
    throw new VercelOidcTokenError(`Failed to save token`, e);
  }
}

function loadToken(projectId: string): VercelTokenResponse | null {
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

export class VercelOidcTokenError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'VercelOidcTokenError';
    this.cause = cause;
  }

  toString() {
    if (this.cause) {
      return `${this.name}: ${this.message}: ${this.cause}`;
    }
    return `${this.name}: ${this.message}`;
  }
}
