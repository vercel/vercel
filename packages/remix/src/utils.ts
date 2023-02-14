import { existsSync } from 'fs';
import { join } from 'path';
import type { BaseFunctionConfig } from '@vercel/static-config';

const configExts = ['.js', '.cjs', '.mjs'];

export function findConfig(dir: string, basename: string): string | undefined {
  for (const ext of configExts) {
    const name = basename + ext;
    const file = join(dir, name);
    if (existsSync(file)) return file;
  }

  return undefined;
}

export function getRegionsKey(regions?: BaseFunctionConfig['regions']): string {
  if (!regions) return '';
  if (Array.isArray(regions)) {
    return JSON.stringify(Array.from(new Set(regions)).sort());
  }
  return regions;
}
