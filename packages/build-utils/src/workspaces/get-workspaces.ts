import { DetectorFilesystem } from '../detectors/filesystem';
import { workspaceManagers } from './workspace-managers';
import { detectFramework as detectWorkspaceManagers } from '../detect-framework';

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
  const rootWorkspaceImplementation = await detectWorkspaceManagers({
    fs,
    frameworkList: workspaceManagers,
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
            childDirectories.map(async childDirectory => {
              const implementation = await detectWorkspaceManagers({
                fs: fs.chdir(childDirectory.name),
                frameworkList: workspaceManagers,
              });

              if (!implementation) return null;

              return {
                implementation,
                rootPath: `/${childDirectory.name}`,
              };
            })
          )
        ).filter((workspace): workspace is Workspace => workspace !== null)
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
