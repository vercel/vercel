import type { Builder } from './types';

export function isZeroConfigBuild(builds?: Builder[]): boolean {
  return (
    !builds ||
    builds.length === 0 ||
    // If the zeroConfig property is set on all builds, still consider it as
    // zero config deployment
    builds.every(buildConfig => buildConfig.config?.zeroConfig)
  );
}
