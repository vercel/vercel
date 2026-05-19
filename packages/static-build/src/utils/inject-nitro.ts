/**
 * Vite + Nitro injection.
 *
 * For Vite-powered projects that use the default `vite build` script and
 * don't declare a `nitro` dependency, we swap the build command from
 * `vite build` to `nitro build --builder vite`. Nitro then takes over the
 * server build, applies its `vercel` preset, and emits BOA v3 to
 * `.vercel/output/` directly — the existing v3 check in
 * `@vercel/static-build` then short-circuits the rest of this builder.
 *
 * Nitro is shipped as a direct dependency of `@vercel/static-build`, so
 * we don't need to `npm install` it at user-build time. We resolve the
 * CLI binary from this package's own `node_modules` and invoke it via
 * `node <path-to-cli>`.
 *
 * Detection mirrors PR #16338's heuristics minus the env-flag gate and
 * the framework-slug allowlist:
 *   - The user hasn't overridden `buildCommand` (in project settings or
 *     vercel.json) — that signals they're driving their own pipeline.
 *   - The package's `build` script is exactly `vite build` — anything
 *     customized (`svelte-kit sync && vite build`, `vitepress build`,
 *     `react-router build`, etc.) is left alone.
 *   - The project doesn't already declare a `nitro` dep — if it does,
 *     they're managing Nitro themselves.
 */
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import type { Config, PackageJson } from '@vercel/build-utils';

const require_ = createRequire(__filename);

interface ShouldInjectNitroOptions {
  pkg?: PackageJson | null;
  config: Config;
  buildCommand: string | null;
}

export function shouldInjectNitro({
  pkg,
  config,
  buildCommand,
}: ShouldInjectNitroOptions): boolean {
  // User has their own build pipeline configured.
  if (config.projectSettings?.buildCommand != null) return false;
  if (typeof buildCommand === 'string') return false;

  // Only swap when the package's build script is literally `vite build`.
  // Anything custom is left alone — that's the user's intent and we don't
  // want to break SvelteKit (`svelte-kit sync && vite build`), Astro, etc.
  const buildScript = pkg?.scripts?.build;
  if (typeof buildScript !== 'string' || buildScript.trim() !== 'vite build') {
    return false;
  }

  // User-declared nitro means they're driving it themselves.
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  if (deps.nitro) return false;

  return true;
}

let cachedNitroBinPath: string | undefined;

/**
 * Resolve the absolute path to the Nitro CLI script from this package's
 * own node_modules. Cached because resolution is stable for the process
 * lifetime.
 */
export function resolveNitroBin(): string {
  if (cachedNitroBinPath) return cachedNitroBinPath;

  const pkgPath = require_.resolve('nitro/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    bin?: string | Record<string, string>;
  };

  let binRelative: string | undefined;
  if (typeof pkg.bin === 'string') {
    binRelative = pkg.bin;
  } else if (pkg.bin && typeof pkg.bin === 'object') {
    binRelative = pkg.bin.nitro ?? Object.values(pkg.bin)[0];
  }

  if (!binRelative) {
    throw new Error(
      'Could not resolve the Nitro CLI binary from the installed `nitro` package.'
    );
  }

  cachedNitroBinPath = join(dirname(pkgPath), binRelative);
  return cachedNitroBinPath;
}

/**
 * Build the shell command that invokes the bundled Nitro CLI.
 * `node <abs-path-to-cli> build --builder vite` works cross-platform and
 * doesn't depend on a `.bin` symlink existing in the user's project.
 */
export function getNitroInjectionBuildCommand(): string {
  const bin = resolveNitroBin();
  // JSON.stringify gives us a properly-quoted absolute path that survives
  // spaces in directory names on all platforms.
  return `node ${JSON.stringify(bin)} build --builder vite`;
}
