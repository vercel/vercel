import { DetectorFilesystem } from '../detectors/filesystem';
import { workspaceManagers } from './workspace-managers';
import { detectFramework as detectWorkspaceManagers } from '../detect-framework';

const MAX_DEPTH_TRAVERSE = 2;

export interface GetWorkspaceOptions {
  fs: DetectorFilesystem;
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
}: GetWorkspaceOptions): Promise<Workspace[]> {
  const rootWorkspaceImplementation = await detectWorkspaceManagers({
    fs,
    frameworkList: workspaceManagers,
  });

  if (rootWorkspaceImplementation === null) {
    const workspaces: Array<Workspace> = [];
    let childDirectories = await getChildDirectories(fs);
    for (
      let currentDepth = 0;
      currentDepth < MAX_DEPTH_TRAVERSE;
      currentDepth++
    ) {
      workspaces.push(
        ...(
          await Promise.all(
            childDirectories.map(async childDirectory => {
              const workspaceType = await detectWorkspaceManagers({
                fs: fs.chdir(childDirectory.path),
                frameworkList: workspaceManagers,
              });
              console.log('getWorkspaces', childDirectory, workspaceType);

              if (!workspaceType) return null;

              return {
                type: workspaceType,
                rootPath: `/${childDirectory.path}`,
              };
            })
          )
        ).filter((workspace): workspace is Workspace => workspace !== null)
      );

      // exit out of the loop early if we detected a workspace at this level in the folder tree
      if (workspaces.length > 0) break;

      childDirectories = (
        await Promise.all(
          childDirectories.map(childDirectory =>
            getChildDirectories(fs, childDirectory.path)
          )
        )
      ).flat();
    }

    return workspaces;
  }

  return [
    {
      type: rootWorkspaceImplementation as WorkspaceType,
      rootPath: '/',
    },
  ];
}
