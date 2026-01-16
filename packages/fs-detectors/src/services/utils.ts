import { ResolvedService, RUNTIME_BUILDERS, ServiceRuntime } from './types';

export function resolveEntrypointPath(
  service: ResolvedService
): string | undefined {
  if (!service.entrypoint) {
    return undefined;
  }

  const workspace = service.workspace;
  if (workspace === '.' || workspace === '') {
    return service.entrypoint;
  }

  return `${workspace}/${service.entrypoint}`;
}

export function getDefaultBuilder(runtime: ServiceRuntime): string {
  return RUNTIME_BUILDERS[runtime];
}
