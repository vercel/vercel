import { normalizePath } from '@vercel/build-utils';

function normalizeRootDirectory(value?: string | null): string {
  if (!value || value === '.') {
    return '';
  }
  return normalizePath(value);
}

export function getEffectiveRootDirectory({
  projectRootDirectory,
  repoProjectDirectory,
}: {
  projectRootDirectory?: string | null;
  repoProjectDirectory?: string | null;
}): string {
  const remoteRootDirectory = normalizeRootDirectory(projectRootDirectory);
  if (remoteRootDirectory) {
    return remoteRootDirectory;
  }
  return normalizeRootDirectory(repoProjectDirectory);
}
