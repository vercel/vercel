import { posix as path } from 'path';
import minimatch from 'minimatch';
import { DetectorFilesystem } from '../detectors/filesystem';
import { getWorkspacePatterns } from './get-workspace-package-paths';
import type { WorkspaceType } from './get-workspaces';

export interface WorkspacePackageTarget {
  isRoot?: boolean;
  name?: string;
  packageJsonPath: string;
  relativePath: string;
}

function normalize(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\//, '');
}

function matchesWorkspace(relativePath: string, patterns: string[]): boolean {
  const positives = patterns
    .filter(pattern => !pattern.startsWith('!'))
    .map(normalize);
  const negatives = patterns
    .filter(pattern => pattern.startsWith('!'))
    .map(pattern => normalize(pattern.slice(1)));
  return (
    positives.some(pattern => minimatch(relativePath, pattern)) &&
    !negatives.some(pattern => minimatch(relativePath, pattern))
  );
}

async function readPackage(
  fs: DetectorFilesystem,
  packageJsonPath: string
): Promise<{ name?: string } | null> {
  try {
    const packageJson = JSON.parse(
      (await fs.readFile(packageJsonPath)).toString()
    );
    return {
      name: typeof packageJson.name === 'string' ? packageJson.name : undefined,
    };
  } catch {
    return null;
  }
}

async function findPackage(
  fs: DetectorFilesystem,
  targetPath: string
): Promise<WorkspacePackageTarget | null> {
  if (
    targetPath.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(targetPath) ||
    normalize(targetPath) === '..' ||
    normalize(targetPath).startsWith('../')
  ) {
    return null;
  }

  let relativePath = normalize(targetPath);
  while (relativePath && relativePath !== '.') {
    const packageJsonPath = path.join(relativePath, 'package.json');
    const packageJson = await readPackage(fs, packageJsonPath);
    if (packageJson) {
      return {
        name: packageJson.name,
        packageJsonPath,
        relativePath,
      };
    }
    const parent = path.dirname(relativePath);
    if (parent === relativePath || parent === '.') return null;
    relativePath = parent;
  }
  return null;
}

export async function resolveWorkspacePackageTargets({
  fs,
  targetPaths,
  type,
}: {
  fs: DetectorFilesystem;
  targetPaths: string[];
  type: Extract<WorkspaceType, 'npm' | 'pnpm' | 'yarn' | 'bun'>;
}): Promise<WorkspacePackageTarget[] | null> {
  let patterns: string[];
  try {
    patterns = await getWorkspacePatterns({ fs, type });
  } catch {
    return null;
  }
  if (patterns.length === 0) return null;

  const targets = new Map<string, WorkspacePackageTarget>();
  for (const targetPath of targetPaths) {
    const target = await findPackage(fs, targetPath);
    if (!target || !matchesWorkspace(target.relativePath, patterns))
      return null;
    targets.set(target.packageJsonPath, target);
  }

  const rootPackageJson = await readPackage(fs, 'package.json');
  if (rootPackageJson) {
    targets.set('package.json', {
      isRoot: true,
      name: rootPackageJson.name,
      packageJsonPath: 'package.json',
      relativePath: '.',
    });
  }

  return Array.from(targets.values()).sort((a, b) =>
    a.relativePath.localeCompare(b.relativePath)
  );
}
