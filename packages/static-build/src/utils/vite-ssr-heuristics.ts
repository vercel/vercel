import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PackageJson } from '@vercel/build-utils';

const VITE_CONFIG_NAMES = [
  'vite.config.ts',
  'vite.config.mts',
  'vite.config.js',
  'vite.config.mjs',
] as const;

/** Meta-framework deps that use Vite environments with a real server bundle. */
const SSR_PACKAGE_SIGNALS = [
  '@tanstack/react-start',
  '@tanstack/solid-start',
  '@react-router/dev',
] as const;

/**
 * Pre-build gate for Nitro injection. Avoids `vite.resolveConfig`, which runs
 * every plugin hook and can hang on TanStack Start (route-tree codegen, etc.).
 */
export function shouldInjectNitroForProject(
  workPath: string,
  pkg: PackageJson | null | undefined
): boolean {
  if (packageDeclaresLikelyViteSsr(pkg)) return true;
  return viteConfigSourceDeclaresServerEnvironment(workPath);
}

export function packageDeclaresLikelyViteSsr(
  pkg: PackageJson | null | undefined
): boolean {
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  // SvelteKit ships its own Vercel adapter; never inject Nitro for it.
  if (deps['@sveltejs/kit']) return false;
  return SSR_PACKAGE_SIGNALS.some(name => deps[name]);
}

export function viteConfigSourceDeclaresServerEnvironment(
  workPath: string
): boolean {
  for (const name of VITE_CONFIG_NAMES) {
    const configPath = join(workPath, name);
    if (!existsSync(configPath)) continue;
    try {
      const content = readFileSync(configPath, 'utf8');
      if (/tanstackStart\s*\(/.test(content)) return true;
      if (/reactRouter\s*\(/.test(content)) return true;
      if (/from\s+['"]@react-router\/dev/.test(content)) return true;
      if (/from\s+['"]nitro\/vite['"]/.test(content)) return true;
      if (/consumer\s*:\s*['"]server['"]/.test(content)) return true;
    } catch {
      // unreadable config — try the next extension
    }
  }
  return false;
}
