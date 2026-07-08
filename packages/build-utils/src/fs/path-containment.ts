import path from 'path';

export function hasParentDirectorySegment(relativePath: string): boolean {
  return relativePath.split(/[/\\]/).some(segment => segment === '..');
}

export function assertPathWithinDirectory(
  rootDir: string,
  targetPath: string
): void {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedTarget = path.resolve(targetPath);
  const relativePath = path.relative(resolvedRoot, resolvedTarget);

  if (
    relativePath === '' ||
    (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
  ) {
    return;
  }

  throw new Error(`Path "${targetPath}" resolves outside of "${rootDir}"`);
}
