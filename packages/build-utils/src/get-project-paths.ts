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
  depth = 1,
}: GetProjectPathsOptions): Promise<ProjectPath[]> => {
  const allPaths: Array<ProjectPath> = [];
  if (path && skipPaths?.includes(path)) {
    return allPaths;
  }

  if (depth < MAX_DEPTH_TRAVERSE) {
    const directoryContents = await fs.readdir(path ?? './');

    const topDir = !path
      ? [{ path: path ?? './', type: 'dir', name: path ?? './' }]
      : [];
    const childDirs = [
      ...directoryContents.filter(
        stat => stat.type === 'dir' && !skipPaths?.includes(stat.path)
      ),
      ...topDir,
    ];

    if (!childDirs.length) {
      return allPaths;
    }

    if (childDirs.length) {
      const dirFinals = await Promise.all(
        childDirs.flatMap(async current => {
          const hasPackageJsonDir = await fs.hasPath(
            `${current.path}/package.json`
          );
          if (hasPackageJsonDir && current.path) {
            const framework = await detectFramework({
              fs: fs.chdir(current.path),
              frameworkList: frameworks,
            });
            if (framework) {
              return current.path;
            }
          }
          if (current.path !== './') {
            const paths = await getProjectPaths({
              fs,
              path: current.path,
              depth: depth + 1,
              skipPaths,
            });
            return paths;
          }
          return [];
        })
      );
      dirFinals.flat().forEach(path => allPaths.push(path));
    }
  }
  return allPaths;
};
