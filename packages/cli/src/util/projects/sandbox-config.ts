import type { ProjectSandboxConfig } from '@vercel-internals/types';

export function parseSandboxRegionList(input: string): string[] {
  const regions = input
    .split(',')
    .map(region => region.trim().toLowerCase())
    .filter(region => region.length > 0);
  return Array.from(new Set(regions));
}

export function formatSandboxRegionList(regions: string[]): string {
  return regions.length > 0 ? regions.join(', ') : 'None';
}

export function validateSandboxConfig(
  config: ProjectSandboxConfig
): string | undefined {
  if (!config.failoverRegions?.length) {
    return;
  }

  // The API requires an explicit primary alongside a failover set, so that the
  // list can never collide with the implicit platform default region.
  if (!config.region) {
    return 'Sandbox region is required when failover regions are specified. Set one with --sandbox-region.';
  }

  if (config.failoverRegions.includes(config.region)) {
    return 'Sandbox failover regions must not include the primary region.';
  }
}
