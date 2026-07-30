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
 * When `opts.fs` is provided (a virtual filesystem already scoped to the
 * service directory), builders read through it instead of resolving to an
 * absolute local path.
 *
 * Builder modules are loaded lazily so importers don't pay their startup
 * cost (and don't trip over eager `readFileSync` calls in mocked-fs test
 * environments) until a runtime framework is actually detected.
 */
export function createDetectEntrypoint(
  projectRoot: string
): DetectEntrypointFn {
  return async ({
    workPath,
    framework,
    fs: vfs,
  }): Promise<DetectedEntrypoint> => {
    // When a virtual filesystem is provided it is already scoped to the
    // service directory and workPath is used as-is.  Otherwise resolve to
    // an absolute path so the builders can read from local disk.
    const resolvedWorkPath = vfs
      ? workPath
      : normalizePath(join(projectRoot, workPath));
    // Builder packages ship without `.d.ts`; casts re-narrow the
    // `allowJs`-inferred return type back to `DetectedEntrypoint`.
    if (isPythonFramework(framework)) {
      const { detectEntrypoint } = await import('@vercel/python');
      return detectEntrypoint({
        workPath: resolvedWorkPath,
        framework,
        fs: vfs,
      }) as Promise<DetectedEntrypoint>;
    }
    if (isNodeBackendFramework(framework)) {
      const { detectEntrypoint } = await import('@vercel/backends');
      return detectEntrypoint({
        workPath: resolvedWorkPath,
        fs: vfs,
      }) as Promise<DetectedEntrypoint>;
    }
    if (framework === 'go') {
      const { detectEntrypoint } = await import('@vercel/go');
      return detectEntrypoint({
        workPath: resolvedWorkPath,
        fs: vfs,
      }) as Promise<DetectedEntrypoint>;
    }
    return null;
  };
}
