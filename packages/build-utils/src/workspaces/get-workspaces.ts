import { DetectorFilesystem } from '../detectors/filesystem';
import { workspaceManagers as frameworkList } from './workspace-managers';
import { detectFramework } from '../detect-framework';

const MAX_DEPTH_TRAVERSE = 2;

export interface GetWorkspaceOptions {
  fs: DetectorFilesystem;
}

export type WorkspaceType = 'yarn' | 'pnpm' | 'npm';

export type Workspace = {
  implementation: WorkspaceType;
  rootPath: string;
};

export async function getWorkspaces({
  fs,
}: GetWorkspaceOptions): Promise<Workspace[]> {
  const rootWorkspaceImplementation = await detectFramework({
    fs,
    frameworkList,
  });

  if (rootWorkspaceImplementation === null) {
    const workspaces: Array<Workspace> = [];
    const directoryContents = await fs.readdir('./');
    const childDirectories = directoryContents.filter(
      stat => stat.type === 'dir'
    );
    let currentDepth = 1;

    while (currentDepth++ < MAX_DEPTH_TRAVERSE) {
      workspaces.push(
        ...(
          await Promise.all(
            childDirectories.map(async childDirectory => ({
              implementation: await detectFramework({
                fs: fs.chdir(childDirectory.name),
                frameworkList,
              }),
              rootPath: `/${childDirectory.name}`,
            }))
          )
        ).filter((i): i is Workspace => i.implementation !== null)
      );
    }

    return workspaces;
  }

  return [
    {
      implementation: rootWorkspaceImplementation as WorkspaceType,
      rootPath: '/',
    },
  ];
}
