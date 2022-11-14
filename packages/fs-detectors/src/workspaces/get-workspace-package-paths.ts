import _path from 'path';
import yaml from 'js-yaml';
import glob from 'glob';
import json5 from 'json5';
import { DetectorFilesystem } from '../detectors/filesystem';
import { Workspace } from './get-workspaces';
import { getGlobFs } from './get-glob-fs';

const posixPath = _path.posix;

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
  const { type, rootPath } = workspace;
  const workspaceFs = fs.chdir(rootPath);

  let results: string[] = [];

  switch (type) {
    case 'yarn':
    case 'npm':
      results = await getPackageJsonWorkspacePackagePaths({ fs: workspaceFs });
      break;
    case 'pnpm':
      results = await getPnpmWorkspacePackagePaths({ fs: workspaceFs });
      break;
    case 'nx':
      results = await getNxWorkspacePackagePaths({ fs: workspaceFs });
      break;
    case 'rush':
      results = await getRushWorkspacePackagePaths({ fs: workspaceFs });
      break;
    default:
      throw new Error(`Unknown workspace implementation: ${type}`);
  }

  return results.map(packagePath => {
    return posixPath.join(rootPath, posixPath.dirname(packagePath));
  });
}

type PackageJsonWithWorkspace = {
  workspaces?:
    | {
        packages?: string[];
        noHoist?: string[];
      }
    | string[];
};

type PnpmWorkspaces = {
  packages?: string[];
};

type RushWorkspaces = {
  projects: [
    {
      projectFolder: string;
    }
  ];
};

const isWin = process.platform === 'win32';
const normalizePath = (p: string) => (isWin ? p.replace(/\\/g, '/') : p);

async function getPackagePaths(
  packages: string[],
  fs: DetectorFilesystem
): Promise<string[]> {
  return (
    await Promise.all(
      packages.map(
        packageGlob =>
          new Promise<string[]>((resolve, reject) => {
            glob(
              normalizePath(posixPath.join(packageGlob, 'package.json')),
              {
                cwd: '/',
                fs: getGlobFs(fs),
              },
              (err, matches) => {
                if (err) reject(err);
                else resolve(matches);
              }
            );
          })
      )
    )
  ).flat();
}

async function getPackageJsonWorkspacePackagePaths({
  fs,
}: GetPackagePathOptions): Promise<string[]> {
  const packageJsonAsBuffer = await fs.readFile('package.json');
  const { workspaces } = JSON.parse(
    packageJsonAsBuffer.toString()
  ) as PackageJsonWithWorkspace;

  let packages: string[] = [];

  if (Array.isArray(workspaces)) {
    packages = workspaces;
  } else {
    packages = workspaces?.packages ?? [];
  }

  return getPackagePaths(packages, fs);
}

async function getNxWorkspacePackagePaths({
  fs,
}: GetPackagePathOptions): Promise<string[]> {
  const nxWorkspaceJsonAsBuffer = await fs.readFile('workspace.json');

  const { projects } = JSON.parse(nxWorkspaceJsonAsBuffer.toString());

  const packages: string[] = Object.values(projects);
  return getPackagePaths(packages, fs);
}

async function getPnpmWorkspacePackagePaths({
  fs,
}: GetPackagePathOptions): Promise<string[]> {
  const pnpmWorkspaceAsBuffer = await fs.readFile('pnpm-workspace.yaml');
  const { packages = [] } = yaml.load(
    pnpmWorkspaceAsBuffer.toString()
  ) as PnpmWorkspaces;

  return getPackagePaths(packages, fs);
}

async function getRushWorkspacePackagePaths({
  fs,
}: GetPackagePathOptions): Promise<string[]> {
  const rushWorkspaceAsBuffer = await fs.readFile('rush.json');

  const { projects = [] } = json5.parse(
    rushWorkspaceAsBuffer.toString()
  ) as RushWorkspaces;

  if (Array.isArray(projects)) {
    const packages = projects
      .filter(proj => proj.projectFolder)
      .map(project => project.projectFolder);

    return getPackagePaths(packages, fs);
  } else {
    return [];
  }
}
