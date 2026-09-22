import { Task } from './types';

type PackageManifest = {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function isRemoteTarballPin(spec: string): boolean {
  return /^https?:\/\//i.test(spec);
}

/**
 * Yarn 1 does not install registry dependencies of packages that were
 * themselves installed from a tarball URL. Preview pack rewrites workspace
 * deps to tarball URLs, so copy those nested registry deps onto the parent
 * (e.g. `js-yaml` from `@vercel/python-analysis` onto `vercel`) so
 * `yarn add vercel.tgz` in the build container still gets them.
 */
export function hoistRegistryDependenciesFromWorkspaceTarballs(
  packageObj: PackageManifest,
  workspaceDependencies: ReadonlyMap<string, Record<string, string>>
): void {
  const parent = packageObj.dependencies;
  if (!parent) {
    return;
  }

  const toAdd: Record<string, string> = {};
  const seen = new Set<string>();

  const visit = (pkgName: string) => {
    if (seen.has(pkgName)) {
      return;
    }
    seen.add(pkgName);
    const deps = workspaceDependencies.get(pkgName);
    if (!deps) {
      return;
    }
    for (const [depName, depSpec] of Object.entries(deps)) {
      if (
        depSpec.startsWith('workspace:') ||
        workspaceDependencies.has(depName)
      ) {
        visit(depName);
        continue;
      }
      if (isRemoteTarballPin(depSpec)) {
        continue;
      }
      if (!(depName in parent) && !(depName in toAdd)) {
        toAdd[depName] = depSpec;
      }
    }
  };

  for (const [name, spec] of Object.entries(parent)) {
    if (isRemoteTarballPin(spec)) {
      visit(name);
    }
  }

  Object.assign(parent, toAdd);
}

export function pinWorkspacePeerDependencies(
  packageObj: PackageManifest,
  workspaceVersions: ReadonlyMap<string, string>,
  sha: string
): void {
  for (const [name, spec] of Object.entries(
    packageObj.peerDependencies ?? {}
  )) {
    const version = workspaceVersions.get(name);
    if (spec.startsWith('workspace:') && version) {
      packageObj.peerDependencies![name] = `${version}-${sha}`;
    }
  }
}

export function selectPackageTasks(tasks: Task[]): Task[] {
  const packageTasks = new Map<string, Task>();
  for (const task of tasks) {
    if (task.task !== 'build' && task.task !== 'build:package') {
      continue;
    }
    if (!packageTasks.has(task.package) || task.task === 'build:package') {
      packageTasks.set(task.package, task);
    }
  }
  return [...packageTasks.values()];
}
