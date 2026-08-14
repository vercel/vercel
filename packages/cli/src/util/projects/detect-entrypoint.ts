import { join } from 'path';
import {
  isPythonFramework,
  isNodeBackendFramework,
  normalizePath,
  type DetectEntrypointFn,
  type DetectedEntrypoint,
} from '@vercel/build-utils';

/**
 * Build a {@link DetectEntrypointFn} that dispatches to the per-runtime
 * builder helpers based on the framework slug. The resulting callback is
 * suitable for passing into `detectServices`.
 *
 * `projectRoot` is the project root. The fs-detectors callback passes
 * `workPath` relative to project root, which we resolve here so the
 * per-builder helpers can read files directly.
 *
 * Builder modules are loaded lazily so importers don't pay their startup
 * cost (and don't trip over eager `readFileSync` calls in mocked-fs test
 * environments) until a runtime framework is actually detected.
 */
export function createDetectEntrypoint(
  projectRoot: string
): DetectEntrypointFn {
  return async ({ workPath, framework }): Promise<DetectedEntrypoint> => {
    // Normalize to forward slashes so the path is platform-consistent;
    // Node's `fs` accepts either separator on Windows.
    const absWorkPath = normalizePath(join(projectRoot, workPath));
    // Builder packages ship without `.d.ts`; casts re-narrow the
    // `allowJs`-inferred return type back to `DetectedEntrypoint`.
    if (isPythonFramework(framework)) {
      const { detectEntrypoint } = await import('@vercel/python');
      return detectEntrypoint({
        workPath: absWorkPath,
        framework,
      }) as Promise<DetectedEntrypoint>;
    }
    if (isNodeBackendFramework(framework)) {
      const { detectEntrypoint } = await import('@vercel/backends');
      return detectEntrypoint({
        workPath: absWorkPath,
      }) as Promise<DetectedEntrypoint>;
    }
    if (framework === 'go') {
      const { detectEntrypoint } = await import('@vercel/go');
      return detectEntrypoint({
        workPath: absWorkPath,
      }) as Promise<DetectedEntrypoint>;
    }
    return null;
  };
}
