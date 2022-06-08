import { detectFramework } from './detect-framework';
import { DetectorFilesystem } from './detectors/filesystem';
import frameworks from '@vercel/frameworks';

const MAX_DEPTH_TRAVERSE = 2;

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

  const directoryContents = await fs.readdir(topPath);

  const topDir = !path ? [{ path: topPath, type: 'dir', name: topPath }] : [];
  const childDirs = [
    ...directoryContents.filter(
      stat => stat.type === 'dir' && !skipPaths?.includes(stat.path)
    ),
    ...topDir,
  ];

  if (!childDirs.length) {
    return allPaths;
  }

  const dirFinals = await Promise.all(
    childDirs.flatMap(async ({ path }) => {
      const hasPackageJsonDir = await fs.hasPath(`${path}/package.json`);
      if (hasPackageJsonDir && path) {
        const framework = await detectFramework({
          fs: fs.chdir(path),
          frameworkList: frameworks,
        });
        if (framework) {
          return path;
        }
      }
      const isRootPath = path === './' || path === '.';
      if (!isRootPath) {
        const paths = await getProjectPaths({
          fs,
          path: path,
          depth: depth - 1,
          skipPaths,
        });
        return paths;
      }
      return [];
    })
  );
  dirFinals.flat().forEach(path => allPaths.push(path));
  return allPaths;
};
