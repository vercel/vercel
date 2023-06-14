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

export type WorkspaceType = 'yarn' | 'pnpm' | 'npm' | 'nx' | 'rush';

export type Workspace = {
  type: WorkspaceType;
  rootPath: string;
};

export async function getWorkspaces({
  fs,
  depth = MAX_DEPTH_TRAVERSE,
  cwd = '/',
}: GetWorkspaceOptions): Promise<Workspace[]> {
  if (depth === 0) return [];

  const workspaceType = await detectWorkspaceManagers({
    fs,
    frameworkList: workspaceManagers,
  });

  if (workspaceType === null) {
    const directoryContents = await fs.readdir('./');
    const childDirectories = directoryContents.filter(
      stat => stat.type === 'dir'
    );

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
      type: workspaceType as WorkspaceType,
      rootPath: cwd,
    },
  ];
}
