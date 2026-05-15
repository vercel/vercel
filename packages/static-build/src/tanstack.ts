import type { Config, PackageJson } from '@vercel/build-utils';

// Nightly Nitro is required for `nitro build --builder vite`.
export const TANSTACK_NITRO_NIGHTLY_PACKAGE = 'nitro@npm:nitro-nightly@latest';

export function getTanStackNitroBuildCommand(): string {
  return `npx --yes -p '${TANSTACK_NITRO_NIGHTLY_PACKAGE}' nitro build --builder vite`;
}

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
