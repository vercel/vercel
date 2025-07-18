import { join } from 'path';
export function resolveProjectPath(
  cwd: string,
  repoRoot: string | undefined,
  rootDirectory: string | undefined
): string {
  let resolvedCwd = cwd;

  // If repo linked, update `cwd` to the repo root
  if (repoRoot) {
    resolvedCwd = repoRoot;
  }

  if (rootDirectory) {
    // Check if the rootDirectory is already part of the cwd path
    // to avoid path duplication
    const normalizedCwd = resolvedCwd.replace(/\\/g, '/');
    const normalizedRootDir = rootDirectory.replace(/\\/g, '/');

    if (!normalizedCwd.endsWith(normalizedRootDir)) {
      resolvedCwd = join(resolvedCwd, rootDirectory);
    }
  }

  return resolvedCwd;
}
