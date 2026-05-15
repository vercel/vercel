import type { Config, PackageJson } from '@vercel/build-utils';

export const TANSTACK_NITRO_BUILD_COMMAND = 'nitro build --builder vite';

function isExperimentalInjectNitroEnabled() {
  const value = process.env.VERCEL_EXPERIMENTAL_INJECT_NITRO;
  return value === '1' || value?.toLowerCase() === 'true';
}

interface TanStackNitroFallbackOptions {
  framework?: { slug: string | null };
  pkg?: PackageJson | null;
  config: Config;
  buildCommand: string | null;
}

export function shouldUseTanStackNitroFallback({
  framework,
  pkg,
  config,
  buildCommand,
}: TanStackNitroFallbackOptions): boolean {
  if (!isExperimentalInjectNitroEnabled()) {
    return false;
  }

  if (framework?.slug !== 'tanstack-start') {
    return false;
  }

  if (config.projectSettings?.buildCommand != null) {
    return false;
  }

  if (typeof buildCommand === 'string') {
    return false;
  }

  const buildScript = pkg?.scripts?.build;
  if (typeof buildScript !== 'string' || buildScript.trim() !== 'vite build') {
    return false;
  }

  const dependencies = {
    ...pkg?.dependencies,
    ...pkg?.devDependencies,
  };
  if (dependencies.nitro) {
    return false;
  }

  return true;
}

export function getTanStackNitroInstallCommand(pkg: PackageJson): string {
  const dependencies = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };
  const packages = dependencies.vite ? 'nitro' : 'nitro vite';

  // Install into the project so Nitro can resolve `vite` from node_modules
  // instead of an isolated `npx` cache.
  return `npm install --no-save ${packages}`;
}
