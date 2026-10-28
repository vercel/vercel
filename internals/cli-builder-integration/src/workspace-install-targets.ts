import { dirname, join, relative } from 'path';
import {
  isExperimentalService,
  scanParentDirs,
  type Builder,
  type Service,
  type WorkspaceInstallTarget,
} from '@vercel/build-utils';
import {
  LocalFileSystemDetector,
  resolveWorkspacePackageTargets,
} from '@vercel/fs-detectors';

function isWorkspaceInstallTarget(
  target: unknown
): target is WorkspaceInstallTarget {
  return Boolean(
    target &&
      typeof target === 'object' &&
      typeof (target as WorkspaceInstallTarget).installRoot === 'string' &&
      typeof (target as WorkspaceInstallTarget).packageJsonPath === 'string' &&
      typeof (target as WorkspaceInstallTarget).relativePath === 'string'
  );
}

export async function collectWorkspaceInstallTargets({
  builds,
  existingTargets,
  repoRootPath,
  serviceByBuilder,
  workPath,
}: {
  builds: Builder[];
  existingTargets?: unknown;
  repoRootPath: string;
  serviceByBuilder: Map<Builder, Service>;
  workPath: string;
}): Promise<WorkspaceInstallTarget[]> {
  const targets = new Map<string, WorkspaceInstallTarget>(
    Array.isArray(existingTargets)
      ? existingTargets
          .filter(isWorkspaceInstallTarget)
          .map(target => [target.packageJsonPath, target])
      : []
  );
  const targetPaths: string[] = [];

  for (const build of builds) {
    const service = serviceByBuilder.get(build);
    const isNodeBuild =
      build.use.startsWith('@vercel/node') ||
      build.use.startsWith('@vercel/backends') ||
      service?.runtime === 'node';
    // Services with a custom or disabled install stay in the target set even
    // though they never run the scoped install: `yarn workspaces focus` prunes
    // every workspace outside the focus set, including their dependencies.
    if (!isNodeBuild) {
      continue;
    }

    if (service) {
      const serviceRoot = isExperimentalService(service)
        ? service.workspace
        : service.root;
      targetPaths.push(
        serviceRoot && serviceRoot !== '.'
          ? join(workPath, serviceRoot)
          : workPath
      );
    } else if (typeof build.src === 'string') {
      targetPaths.push(join(workPath, dirname(build.src)));
    }
  }

  const installScopes = new Map<
    string,
    { paths: string[]; type: 'npm' | 'pnpm' | 'yarn' | 'bun' }
  >();
  await Promise.all(
    targetPaths.map(async targetPath => {
      const { cliType, lockfilePath } = await scanParentDirs(
        targetPath,
        false,
        repoRootPath
      );
      if (
        !lockfilePath ||
        (cliType !== 'npm' &&
          cliType !== 'pnpm' &&
          cliType !== 'yarn' &&
          cliType !== 'bun')
      ) {
        return;
      }

      const installRoot = dirname(lockfilePath);
      const scope = installScopes.get(installRoot) ?? {
        paths: [],
        type: cliType,
      };
      scope.paths.push(relative(installRoot, targetPath));
      installScopes.set(installRoot, scope);
    })
  );

  await Promise.all(
    Array.from(installScopes, async ([installRoot, { paths, type }]) => {
      const resolved = await resolveWorkspacePackageTargets({
        fs: new LocalFileSystemDetector(installRoot),
        targetPaths: paths,
        type,
      });
      if (!resolved) {
        for (const [packageJsonPath, target] of targets) {
          if (target.installRoot === installRoot) {
            targets.delete(packageJsonPath);
          }
        }
        return;
      }

      for (const target of resolved) {
        const packageJsonPath = join(installRoot, target.packageJsonPath);
        targets.set(packageJsonPath, {
          ...target,
          installRoot,
          packageJsonPath,
        });
      }
    })
  );

  return Array.from(targets.values());
}
