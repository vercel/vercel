import type { Config, PackageJson } from '@vercel/build-utils';
import type { Framework } from '@vercel/frameworks';

export const TANSTACK_NITRO_FALLBACK_BUILD_COMMAND =
  'npx nitro build --builder vite';

function isExperimentalInjectNitroEnabled() {
  const value = process.env.VERCEL_EXPERIMENTAL_INJECT_NITRO;
  return value === '1' || value?.toLowerCase() === 'true';
}

interface TanStackNitroFallbackBuildCommandOptions {
  framework?: Framework;
  pkg?: PackageJson | null;
  config: Config;
  buildCommand: string | null;
}

export function getTanStackNitroFallbackBuildCommand({
  framework,
  pkg,
  config,
  buildCommand,
}: TanStackNitroFallbackBuildCommandOptions): string | null {
  if (!isExperimentalInjectNitroEnabled()) {
    return null;
  }

  if (framework?.slug !== 'tanstack-start') {
    return null;
  }

  if (config.projectSettings?.buildCommand != null) {
    return null;
  }

  if (typeof buildCommand === 'string') {
    return null;
  }

  const buildScript = pkg?.scripts?.build;
  if (typeof buildScript !== 'string' || buildScript.trim() !== 'vite build') {
    return null;
  }

  const dependencies = {
    ...pkg?.dependencies,
    ...pkg?.devDependencies,
  };
  if (dependencies.nitro) {
    return null;
  }

  return TANSTACK_NITRO_FALLBACK_BUILD_COMMAND;
}
