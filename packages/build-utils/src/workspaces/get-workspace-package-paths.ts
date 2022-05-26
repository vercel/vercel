import _path from 'path';
import yaml from 'js-yaml';
import { DetectorFilesystem } from '../detectors/filesystem';
import { Workspace } from './get-workspaces';
import glob, { FsFiles } from '../fs/glob';
import { getGlobFs } from '../fs/get-glob-fs';

const path = _path.posix;

interface GetPackagePathOptions {
  fs: DetectorFilesystem;
}

export interface GetWorkspacePackagePathsOptions extends GetPackagePathOptions {
  fs: DetectorFilesystem;
  workspace: Workspace;
}

export async function getWorkspacePackagePaths({
  fs,
  workspace,
}: GetWorkspacePackagePathsOptions): Promise<string[]> {
  const { type, rootPath: workspaceRootPath } = workspace;
  const workspaceFs = fs.chdir(workspaceRootPath);

  let results: FsFiles[] = [];

  switch (type) {
    case 'yarn':
    case 'npm':
      results = await getPackageJsonWorkspacePackagePaths({ fs: workspaceFs });
      break;
    case 'pnpm':
      results = await getPnpmWorkspacePackagePaths({ fs: workspaceFs });
      break;
    default:
      throw new Error(`Unknown workspace implementation: ${type}`);
  }

  return results
    .flatMap(packagePaths => Object.keys(packagePaths))
    .map(packagePath =>
      path.join(workspaceRootPath, path.dirname(packagePath))
    );
}

type PackageJsonWithWorkspace = {
  workspaces:
    | {
        packages: string[];
        noHoist?: string[];
      }
    | string[];
};

type PnpmWorkspaces = {
  packages: string[];
};

async function getPackagePaths(
  packages: string[],
  fs: DetectorFilesystem
): Promise<FsFiles[]> {
  return Promise.all(
    packages.map(packageGlob =>
      glob(path.join(packageGlob, 'package.json').replace(/\\/g, '/'), {
        cwd: '/',
        fs: getGlobFs(fs),
      })
    )
  );
}

async function getPackageJsonWorkspacePackagePaths({
  fs,
}: GetPackagePathOptions): Promise<FsFiles[]> {
  const packageJsonAsBuffer = await fs.readFile('package.json');
  const { workspaces } = JSON.parse(
    packageJsonAsBuffer.toString()
  ) as PackageJsonWithWorkspace;

  let packages: string[] = [];

  if (Array.isArray(workspaces)) {
    packages = workspaces;
  } else {
    packages = workspaces.packages;
  }

  return getPackagePaths(packages, fs);
}

async function getPnpmWorkspacePackagePaths({
  fs,
}: GetPackagePathOptions): Promise<FsFiles[]> {
  const pnpmWorkspaceAsBuffer = await fs.readFile('pnpm-workspace.yaml');
  const { packages } = yaml.load(
    pnpmWorkspaceAsBuffer.toString()
  ) as PnpmWorkspaces;

  console.log('getPnpmWorkspacePackagePaths', packages);

  return getPackagePaths(packages, fs);
}
