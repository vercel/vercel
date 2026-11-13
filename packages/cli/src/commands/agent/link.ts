import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Worth offering `vercel link`: the directory is inside a git repo or has a package.json. */
export function looksLikeProject(cwd: string): boolean {
  if (existsSync(join(cwd, 'package.json'))) return true;
  for (let dir = cwd; ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.git'))) return true;
    if (dirname(dir) === dir) return false;
  }
}
