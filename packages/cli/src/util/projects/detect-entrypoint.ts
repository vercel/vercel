import { join } from 'path';
import {
  isPythonFramework,
  isNodeBackendFramework,
  normalizePath,
  type DetectEntrypointFn,
  type DetectedEntrypoint,
} from '@vercel/build-utils';
import { detectEntrypoint as detectNodeEntrypoint } from '@vercel/backends';
import { detectEntrypoint as detectPythonEntrypoint } from '@vercel/python';
import { detectEntrypoint as detectGoEntrypoint } from '@vercel/go';

/**
 * Build a {@link DetectEntrypointFn} that dispatches to the per-runtime
 * builder helpers based on the framework slug. The resulting callback is
 * suitable for passing into `detectServices`.
 *
 * `projectRoot` is the project root. The fs-detectors callback passes
 * `workPath` relative to project root, which we resolve here so the
 * per-builder helpers can read files directly.
 */
export function createDetectEntrypoint(
  projectRoot: string
): DetectEntrypointFn {
  return ({ workPath, framework }): Promise<DetectedEntrypoint> => {
    // Normalize to forward slashes so the path is platform-consistent;
    // Node's `fs` accepts either separator on Windows.
    const absWorkPath = normalizePath(join(projectRoot, workPath));
    // Builder packages ship without `.d.ts`; casts re-narrow the
    // `allowJs`-inferred return type back to `DetectedEntrypoint`.
    if (isPythonFramework(framework)) {
      return detectPythonEntrypoint({
        workPath: absWorkPath,
        framework,
      }) as Promise<DetectedEntrypoint>;
    }
    if (isNodeBackendFramework(framework)) {
      return detectNodeEntrypoint({
        workPath: absWorkPath,
      }) as Promise<DetectedEntrypoint>;
    }
    if (framework === 'go') {
      return detectGoEntrypoint({
        workPath: absWorkPath,
      }) as Promise<DetectedEntrypoint>;
    }
    return Promise.resolve(null);
  };
}
