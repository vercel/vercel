import {
  createEntrypointDetectorFs,
  debug,
  type DetectEntrypointFn,
  type EntrypointDetectorFilesystem,
} from '@vercel/build-utils';

export const GO_CANDIDATE_ENTRYPOINTS = [
  'main.go',
  'cmd/api/main.go',
  'cmd/server/main.go',
];

/**
 * Detect the Go entrypoint for standalone server mode.
 * Checks the configured entrypoint first, then searches candidate locations.
 */
export async function detectGoEntrypoint(
  workPath: string,
  configuredEntrypoint?: string,
  fs?: EntrypointDetectorFilesystem
): Promise<string | null> {
  const dfs = fs ?? createEntrypointDetectorFs(workPath);

  // If the configured entrypoint exists, use it
  if (configuredEntrypoint && (await dfs.hasPath(configuredEntrypoint))) {
    debug(`Using configured Go entrypoint: ${configuredEntrypoint}`);
    return configuredEntrypoint;
  }

  // Search candidate locations
  for (const candidate of GO_CANDIDATE_ENTRYPOINTS) {
    if (await dfs.hasPath(candidate)) {
      debug(`Detected Go entrypoint: ${candidate}`);
      return candidate;
    }
  }

  return null;
}

/**
 * Normalized entrypoint detector for Go services. Wraps {@link detectGoEntrypoint}
 * and returns the result in the shared {@link DetectedEntrypoint} shape consumed
 * by services auto-detection.
 */
export const detectEntrypoint: DetectEntrypointFn = async ({
  workPath,
  fs,
}) => {
  const file = await detectGoEntrypoint(workPath, undefined, fs);
  if (!file) return null;
  return { kind: 'file', entrypoint: file };
};
