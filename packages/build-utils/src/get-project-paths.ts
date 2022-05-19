import { detectFramework } from './detect-framework';
import { DetectorFilesystem } from './detectors/filesystem';
import frameworks from '@vercel/frameworks';

const MAX_DEPTH_TRAVERSE = 3;

export interface GetProjectPathsOptions {
  fs: DetectorFilesystem;
  path?: string;
  skipPaths?: string[];
}

export type ProjectPath = string;

export const getProjectPaths = async ({
  fs,
  path,
  skipPaths,
}: GetProjectPathsOptions): Promise<ProjectPath[]> => {
  const allPaths: Array<ProjectPath> = [];
  for (
    let currentDepth = 0;
    currentDepth < MAX_DEPTH_TRAVERSE;
    currentDepth++
  ) {
    if (path && skipPaths?.includes(path)) {
      return allPaths;
    }
    const directoryContents = await fs.readdir(path ?? './');

    const hasPackageJson = directoryContents.some(
      dir => dir.type === 'file' && dir.name === 'package.json'
    );
    const childDirs = directoryContents.filter(stat => stat.type === 'dir');

    if (!childDirs.length && !hasPackageJson) {
      return allPaths;
    }

    if (childDirs.length) {
      const dirPaths = await Promise.all(
        childDirs.flatMap(async current => {
          const paths = await getProjectPaths({
            fs,
            path: current.path,
          });
          return paths;
        })
      );
      dirPaths.flat().forEach(path => allPaths.push(path));
    }
    if (hasPackageJson && path) {
      const framework = await detectFramework({
        fs: fs.chdir(path),
        frameworkList: frameworks,
      });
      if (framework) {
        allPaths.push(path);
      }
    }
  }
  return allPaths;
};
