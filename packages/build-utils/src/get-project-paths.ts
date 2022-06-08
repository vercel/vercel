import { detectFramework } from './detect-framework';
import { DetectorFilesystem } from './detectors/filesystem';
import frameworks from '@vercel/frameworks';

const MAX_DEPTH_TRAVERSE = 3;

export interface GetProjectPathsOptions {
  fs: DetectorFilesystem;
  path?: string;
  skipPaths?: string[];
  depth?: number;
}

export type ProjectPath = string;

export const getProjectPaths = async ({
  fs,
  path,
  skipPaths,
  depth = MAX_DEPTH_TRAVERSE,
}: GetProjectPathsOptions): Promise<ProjectPath[]> => {
  if (depth === 0) return [];

  const allPaths: Array<ProjectPath> = [];
  const topPath: string = path ?? './';

  if (path && skipPaths?.includes(path)) {
    return allPaths;
  }
  const framework = await detectFramework({
    fs: fs.chdir(topPath),
    frameworkList: frameworks,
  });

  if (framework !== null) allPaths.push(topPath);

  if (depth > 1) {
    const directoryContents = await fs.readdir(topPath);
    const childDirectories = directoryContents.filter(
      stat => stat.type === 'dir' && !skipPaths?.includes(stat.path)
    );

    const paths = (
      await Promise.all(
        childDirectories.map(({ path }) => {
          return getProjectPaths({
            fs,
            path,
            depth: depth - 1,
            skipPaths,
          });
        })
      )
    ).flat();

    return [...paths, ...allPaths];
  }

  return allPaths;
};
