import path from 'path';
import { DetectorFilesystem } from '../detectors/filesystem';
import { workspaceManagers } from './workspace-managers';
import { detectFramework as detectWorkspaceManagers } from '../detect-framework';

const MAX_DEPTH_TRAVERSE = 3;
const posixPath = path.posix;

export interface GetWorkspaceOptions {
  fs: DetectorFilesystem;
  depth?: number;
  cwd?: string;
}

export type WorkspaceType = 'yarn' | 'pnpm' | 'npm';

export type Workspace = {
  type: WorkspaceType;
  rootPath: string;
};

async function getChildDirectories(fs: DetectorFilesystem, dirPath = './') {
  const directoryContents = await fs.readdir(dirPath);
  return directoryContents.filter(stat => stat.type === 'dir');
}

export async function getWorkspaces({
  fs,
  depth = MAX_DEPTH_TRAVERSE,
  cwd = '/',
}: GetWorkspaceOptions): Promise<Workspace[]> {
  if (depth === 0) return [];

  const workspaceImplementation = await detectWorkspaceManagers({
    fs,
    frameworkList: workspaceManagers,
  });

  if (workspaceImplementation === null) {
    const childDirectories = await getChildDirectories(fs);

    return (
      await Promise.all(
        childDirectories.map(childDirectory =>
          getWorkspaces({
            fs: fs.chdir(childDirectory.path),
            depth: depth - 1,
            cwd: posixPath.join(cwd, childDirectory.path),
          })
        )
      )
    ).flat();
  }

  return [
    {
      type: workspaceImplementation as WorkspaceType,
      rootPath: `${cwd}`,
    },
  ];
}
