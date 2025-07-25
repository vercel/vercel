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

async function parseEnvFile(rootDir: string): Promise<string | null> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const envPath = path.join(rootDir, '.env.local');
    const envFile = fs.readFileSync(envPath, 'utf8');
    const lines = envFile.split('\n');
    for (const line of lines) {
      if (line.startsWith('VERCEL_OIDC_TOKEN=')) {
        return line.substring('VERCEL_OIDC_TOKEN='.length).replace(/"/g, '');
      }
    }
  } catch (e) {
    throw new Error('failed to parse env file');
  }
  return null;
}

async function isVercelCliInstalled(): Promise<boolean> {
  try {
    const { platform } = await import('os');
    const { execSync } = await import('child_process');
    if (platform() === 'win32') {
      execSync('where.exe vercel', { stdio: 'ignore' });
    } else {
      execSync('which vercel', { stdio: 'ignore' });
    }
    return true;
  } catch (e) {
    return false;
  }
}

async function pullToken(): Promise<void> {
  if (!isVercelCliInstalled()) {
    throw new Error('vercel cli not installed');
  }

  try {
    const { execSync } = await import('child_process');
    const rootDir = await findRootDir();
    execSync('vercel env pull --yes', { cwd: rootDir, stdio: 'ignore' });
  } catch (e) {
    throw new Error('failed to pull token');
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

// we'll take advantage of vercel's cli being installed in order to do this...
export async function refreshToken(): Promise<void> {
  if (!isNodeEnv()) {
    throw new Error('refresh only supported in node server environments');
  }
  await pullToken();
  const rootDir = await findRootDir();
  const envToken = await parseEnvFile(rootDir);
  if (envToken) {
    process.env.VERCEL_OIDC_TOKEN = envToken;
    return;
  }
  throw new Error('failed to refresh token');
}
