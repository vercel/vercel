import {
  RUNTIME_BUILDERS,
  ServiceRuntime,
  ENTRYPOINT_EXTENSIONS,
} from './types';

export function getBuilderForRuntime(runtime: ServiceRuntime): string {
  return RUNTIME_BUILDERS[runtime];
}

export function inferRuntimeFromExtension(
  entrypoint: string
): ServiceRuntime | null {
  for (const [ext, runtime] of Object.entries(ENTRYPOINT_EXTENSIONS)) {
    if (entrypoint.endsWith(ext)) {
      return runtime;
    }
  }
  return null;
}
