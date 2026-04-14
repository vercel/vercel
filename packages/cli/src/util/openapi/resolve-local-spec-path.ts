import { homedir } from 'os';
import { resolve } from 'path';

/**
 * Resolve a path for `VERCEL_OPENAPI_SPEC_PATH`, including `~/` → home directory.
 */
export function resolveLocalOpenApiPath(input: string): string {
  const t = input.trim();
  if (t.startsWith('~/')) {
    return resolve(homedir(), t.slice(2));
  }
  if (t === '~') {
    return homedir();
  }
  return resolve(t);
}
