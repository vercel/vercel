import { join } from 'path';

export type PackageManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface UpgradePackageManager {
  metadataArgs(specifier: string): string[];
  installArgs(specifier: string): string[];
  /** Empty means unsupported; callers must reject an explicit bypass request. */
  releaseAgeBypassArgs: string[];
  globalDetection: {
    args: string[] | ((pkg: string) => string[]);
    packageDir?: (output: string, pkg: string) => string | undefined;
    /** For managers that expose a binary directory instead of a package root. */
    binaryNames?: string[];
  };
}

const packageManagers: Record<PackageManagerName, UpgradePackageManager> = {
  npm: {
    metadataArgs: specifier => [
      'view',
      specifier,
      'version',
      '--json',
      '--global',
    ],
    installArgs: specifier => ['i', '-g', specifier],
    releaseAgeBypassArgs: ['--min-release-age=0'],
    globalDetection: {
      args: ['root', '-g'],
      packageDir: (root, pkg) => join(root, pkg),
    },
  },
  pnpm: {
    metadataArgs: specifier => ['view', specifier, 'version', '--json'],
    installArgs: specifier => ['i', '-g', specifier],
    releaseAgeBypassArgs: ['--config.minimumReleaseAge=0'],
    globalDetection: {
      args: pkg => ['list', '-g', pkg, '--depth=0', '--json'],
      packageDir: (output, pkg) => {
        try {
          const projects = JSON.parse(output);
          const project = Array.isArray(projects) ? projects[0] : projects;
          const path = project?.dependencies?.[pkg]?.path;
          return typeof path === 'string' ? path : undefined;
        } catch {
          return undefined;
        }
      },
    },
  },
  yarn: {
    metadataArgs: specifier => [
      'info',
      specifier.endsWith('@latest')
        ? specifier.slice(0, -'@latest'.length)
        : specifier,
      'version',
      '--json',
    ],
    installArgs: specifier => ['global', 'add', specifier],
    releaseAgeBypassArgs: [],
    globalDetection: {
      args: ['--silent', 'global', 'dir'],
      packageDir: (root, pkg) => join(root, 'node_modules', pkg),
    },
  },
  bun: {
    metadataArgs: specifier => [
      'info',
      specifier,
      'version',
      '--json',
      '--global',
    ],
    installArgs: specifier => ['add', '-g', specifier],
    releaseAgeBypassArgs: [],
    globalDetection: {
      args: ['pm', 'bin', '-g'],
      binaryNames: ['vercel', 'vc'],
    },
  },
};

export function getUpgradePackageManager(
  name: PackageManagerName
): UpgradePackageManager {
  return packageManagers[name];
}
