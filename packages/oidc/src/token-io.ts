import { VercelOidcTokenError } from './token-error';

export async function findRootDir(): Promise<string | null> {
  try {
    const [path, fs] = await Promise.all([import('path'), import('fs')]);
    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
      const pkgPath = path.join(dir, '.vercel');
      if (fs.existsSync(pkgPath)) {
        return dir;
      }
      dir = path.dirname(dir);
    }
  } catch (_e) {
    throw new VercelOidcTokenError(
      'Token refresh only supported in node server environments'
    );
  }
  return null;
}

export async function getUserDataDir(): Promise<string | null> {
  if (process.env.XDG_DATA_HOME) {
    return process.env.XDG_DATA_HOME;
  }

  const [{ platform, homedir }, path] = await Promise.all([
    import('os'),
    import('path'),
  ]);
  switch (platform()) {
    case 'darwin':
      return path.join(homedir(), 'Library/Application Support');
    case 'linux':
      return path.join(homedir(), '.local/share');
    case 'win32':
      if (process.env.LOCALAPPDATA) {
        return process.env.LOCALAPPDATA;
      }
      return null;
    default:
      return null;
  }
}
