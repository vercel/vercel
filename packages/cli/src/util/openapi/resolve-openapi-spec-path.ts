import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { resolveLocalOpenApiPath } from './resolve-local-spec-path';

/**
 * Walk parent directories from `fromDir` looking for `openapi.json`.
 */
export function findOpenapiJsonUpward(fromDir: string): string | null {
  let dir = resolve(fromDir);
  for (;;) {
    const candidate = join(dir, 'openapi.json');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

/**
 * When running from the `vercel` package in the monorepo, `openapi.json` at the
 * repository root is five levels above `src/util/openapi` / `dist/util/openapi`.
 */
export function getMonorepoAdjacentOpenapiPath(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidate = join(here, '..', '..', '..', '..', '..', 'openapi.json');
  return existsSync(candidate) ? candidate : null;
}

/**
 * Resolves the OpenAPI document path: `VERCEL_OPENAPI_SPEC_PATH`, then
 * `openapi.json` walking up from `process.cwd()`, then repo-root `openapi.json`
 * next to the CLI package (monorepo checkout).
 */
export function resolveOpenApiSpecPathForCli(): string | null {
  const fromEnv = process.env.VERCEL_OPENAPI_SPEC_PATH?.trim();
  if (fromEnv) {
    const p = resolveLocalOpenApiPath(fromEnv);
    return existsSync(p) ? p : null;
  }
  const fromCwd = findOpenapiJsonUpward(process.cwd());
  if (fromCwd) {
    return fromCwd;
  }
  return getMonorepoAdjacentOpenapiPath();
}
