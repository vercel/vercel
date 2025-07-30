interface TokenPayload {
  sub: string;
  name: string;
  exp: number;
}

function isNodeEnv(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null
  );
}

function isBrowserEnv(): boolean {
  return typeof window !== 'undefined';
}

async function getVercelDataDir(): Promise<string | null> {
  if (isBrowserEnv()) {
    return '';
  }
  const vercelFolder = 'com.vercel.cli';
  const os = await import('os');
  const path = await import('path');
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

async function getVercelCliToken(): Promise<string | null> {
  const dataDir = await getVercelDataDir();
  if (!dataDir) {
    return null;
  }
  const path = await import('path');
  const fs = await import('fs');
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
    const url = `https://api.vercel.com/projects/token?projectId=${projectId}&source=vercel-oidc-refresh`;
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

async function findProjectId(): Promise<string> {
  const dir = await findRootDir();
  if (!dir) {
    throw new Error('unable to find root directory');
  }
  try {
    const fs = await import('fs');
    const path = await import('path');
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

async function findRootDir(): Promise<string> {
  try {
    const fs = await import('fs');
    const path = await import('path');
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

async function saveToken(
  token: VercelTokenResponse,
  projectId: string
): Promise<void> {
  try {
    const os = await import('os');
    const path = await import('path');
    const tmpDir = os.tmpdir();
    const tokenPath = path.join(
      tmpDir,
      `vercel-oidc-token-${projectId}`,
      'token.json'
    );
    const tokenJson = JSON.stringify(token);
    const fs = await import('fs');
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
    fs.writeFileSync(tokenPath, tokenJson);
    return;
  } catch (e) {
    const message = e instanceof Error ? e.message : e;
    throw new Error(`failed to save token: ${message}`);
  }
}

async function loadToken(
  projectId: string
): Promise<VercelTokenResponse | null> {
  try {
    const os = await import('os');
    const path = await import('path');
    const fs = await import('fs');

    const tmpDir = os.tmpdir();
    const tokenPath = path.join(
      tmpDir,
      `vercel-oidc-token-${projectId}`,
      'token.json'
    );
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

  if (isBrowserEnv()) {
    if (typeof Uint8Array === undefined || typeof TextDecoder === undefined) {
      throw new Error(
        'The browser environment is not supported. Requires Uint8Array and TextDecoder'
      );
    }

    const binaryString = window.atob(base64);
    const toUtf8 = Uint8Array.from(binaryString, c => c.charCodeAt(0));
    const decoder = new TextDecoder();
    const payload = decoder.decode(toUtf8);
    return JSON.parse(payload);
  }

  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
}

export function isExpired(token: TokenPayload): boolean {
  return token.exp * 1000 < Date.now();
}

export async function refreshToken(): Promise<void> {
  if (!isNodeEnv()) {
    throw new Error('refresh only supported in node server environments');
  }

  let maybeToken = await loadToken(await findProjectId());
  if (!maybeToken || isExpired(getTokenPayload(maybeToken.token))) {
    const authToken = await getVercelCliToken();
    if (!authToken) {
      throw new Error('failed to refresh token: login to vercel cli');
    }
    const projectId = await findProjectId();
    if (!projectId) {
      throw new Error('failed to refresh token: project id not found');
    }
    maybeToken = await getVercelOidcToken(authToken, projectId);
    if (!maybeToken) {
      throw new Error('failed to refresh token');
    }
    await saveToken(maybeToken, projectId);
  }
  process.env.VERCEL_OIDC_TOKEN = maybeToken.token;
  return;
}
