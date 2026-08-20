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
 * Builders are loaded via `importBuilders`. The import is dynamic so this
 * module does not create a static cycle through
 * `import-builders` → `static-builder` → `compile-vercel-config`.
 */
export function createDetectEntrypoint(
  projectRoot: string
): DetectEntrypointFn {
  return async ({ workPath, framework }): Promise<DetectedEntrypoint> => {
    // Normalize to forward slashes so the path is platform-consistent;
    // Node's `fs` accepts either separator on Windows.
    const absWorkPath = normalizePath(join(projectRoot, workPath));

    let builderName: string | undefined;
    if (isPythonFramework(framework)) {
      builderName = '@vercel/python';
    } else if (isNodeBackendFramework(framework)) {
      builderName = '@vercel/backends';
    } else if (framework === 'go') {
      builderName = '@vercel/go';
    } else {
      return null;
    }

    const detectEntrypoint = await loadBuilderDetectEntrypoint(
      builderName,
      projectRoot
    );
    if (!detectEntrypoint) {
      return null;
    }

    if (builderName === '@vercel/python') {
      return detectEntrypoint({
        workPath: absWorkPath,
        framework,
      });
    }
    return detectEntrypoint({ workPath: absWorkPath });
  };
}

async function loadBuilderDetectEntrypoint(
  name: string,
  projectRoot: string
): Promise<DetectEntrypointFn | undefined> {
  const { importBuilders } = await import('../build/import-builders');
  const builders = await importBuilders(new Set([name]), projectRoot);
  const loaded = builders.get(name);
  if (!loaded) {
    return undefined;
  }
  const detect = (loaded.builder as { detectEntrypoint?: DetectEntrypointFn })
    .detectEntrypoint;
  return typeof detect === 'function' ? detect : undefined;
}
