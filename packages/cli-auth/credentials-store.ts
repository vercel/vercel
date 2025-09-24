import path from 'node:path';
import fs from 'node:fs';
import { homedir } from 'node:os';
import XDGAppPaths from 'xdg-app-paths';
import { z } from 'zod/mini';

const Credentials = z.object({
  token: z.string().check(z.minLength(1)),
  refresh_token: z.optional(z.string().check(z.minLength(1))),
  expiresAt: z.optional(z.number()),
});

export type Credentials = z.infer<typeof Credentials>;

/** Returns whether a directory exists */
function isDirectory(path: string): boolean {
  try {
    return fs.lstatSync(path).isDirectory();
  } catch (_) {
    // We don't care which kind of error occured, it isn't a directory anyway.
    return false;
  }
}

/** Returns in which directory the config should be present */
function getGlobalPathConfig(dir: string): string {
  const vercelDirectories = XDGAppPaths(dir).dataDirs();

  const possibleConfigPaths = [
    ...vercelDirectories, // latest vercel directory
    path.join(homedir(), '.now'), // legacy config in user's home directory
    ...XDGAppPaths('now').dataDirs(), // legacy XDG directory
  ];

  // The customPath flag is the preferred location,
  // followed by the vercel directory,
  // followed by the now directory.
  // If none of those exist, use the vercel directory.
  return (
    possibleConfigPaths.find(configPath => isDirectory(configPath)) ||
    vercelDirectories[0]
  );
}

export function CredentialsStore(dir: string) {
  return {
    get() {
      try {
        const pathname = path.join(getGlobalPathConfig(dir), 'auth.json');
        return Credentials.parse(JSON.parse(fs.readFileSync(pathname, 'utf8')));
      } catch {
        return null;
      }
    },
    update(config: Partial<Credentials>) {
      const pathname = path.join(getGlobalPathConfig(dir), 'auth.json');
      fs.mkdirSync(path.dirname(pathname), { recursive: true });
      console.log('Writing auth config to', pathname);
      fs.writeFileSync(pathname, JSON.stringify(config, null, 2) + '\n');
    },
  };
}
