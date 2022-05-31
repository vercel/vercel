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
  depth = 0,
}: GetProjectPathsOptions): Promise<ProjectPath[]> => {
  const allPaths: Array<ProjectPath> = [];
  if (path && skipPaths?.includes(path)) {
    return allPaths;
  }
  const directoryContents = await fs.readdir(path ?? './');

  if (depth < MAX_DEPTH_TRAVERSE) {
    const hasPackageJson = directoryContents.some(
      dir => dir.type === 'file' && dir.name === 'package.json'
    );

    if (hasPackageJson && path) {
      const framework = await detectFramework({
        fs: fs.chdir(path),
        frameworkList: frameworks,
      });
      if (framework) {
        allPaths.push(path);
      }
    }

    const childDirs = directoryContents.filter(stat => stat.type === 'dir');

    if (!childDirs.length && !hasPackageJson) {
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
            } else {
              const paths = await getProjectPaths({
                fs,
                path: current.path,
                depth: depth + 1,
              });
              return paths;
            }
          }
          return [];
        })
      );
      dirFinals.flat().forEach(path => allPaths.push(path));
    }
  }
  return allPaths;
};
