import type { ServiceRuntime } from '@vercel/build-utils';
import { RUNTIME_BUILDERS, ENTRYPOINT_EXTENSIONS } from './constants';
import { inferRuntimeFromFramework } from './framework';

export function getBuilderForRuntime(runtime: ServiceRuntime): string {
  const builder = RUNTIME_BUILDERS[runtime];
  if (!builder) throw new Error(`Unknown runtime: ${runtime}`);
  return builder;
}

/**
 * Infer runtime from available configuration hints.
 *
 * Priority (highest to lowest):
 * 1. Explicit `runtime` field
 * 2. Runtime framework slug (ruby → ruby, go → go)
 * 3. Framework detection (fastapi → python, express → node)
 * 4. Builder name (@vercel/python → python)
 * 5. Entrypoint file extension (.py → python, .ts → node)
 */
export function inferRuntime(config: {
  runtime?: string;
  framework?: string;
  builder?: string;
  entrypoint?: string;
}): ServiceRuntime | undefined {
  if (config.runtime && config.runtime in RUNTIME_BUILDERS) {
    return config.runtime as ServiceRuntime;
  }

  const frameworkRuntime = inferRuntimeFromFramework(config.framework);
  if (frameworkRuntime) return frameworkRuntime;

  if (config.builder) {
    for (const [runtime, builderName] of Object.entries(RUNTIME_BUILDERS)) {
      if (config.builder === builderName) return runtime as ServiceRuntime;
    }
  }

  if (config.entrypoint) {
    // pyproject.toml is the declared entrypoint for Python services.
    if (
      config.entrypoint === 'pyproject.toml' ||
      config.entrypoint.endsWith('/pyproject.toml')
    ) {
      return 'python';
    }
    for (const [ext, runtime] of Object.entries(ENTRYPOINT_EXTENSIONS)) {
      if (config.entrypoint.endsWith(ext)) return runtime;
    }
  }

  return undefined;
}
