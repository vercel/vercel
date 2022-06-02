import path from 'path';
import { normalizePath } from '../src';
import { getProjectPaths, ProjectPath } from '../src/get-project-paths';
import { FixtureFilesystem } from './utils/fixture-filesystem';

describe.each<[ProjectPath[], number, number, string, ProjectPath[]?]>([
  [[], 2, 4, '32-monorepo-highly-nested'],
  [['backend/app-three'], 2, 3, '33-hybrid-monorepo', ['frontend']],
  [
    ['backend/app-three', 'frontend/app-one', 'frontend/app-two'],
    3,
    6,
    '34-monorepo-no-workspaces',
  ],
  [[], 1, 1, '35-no-monorepo'],
  [['frontend/app-two'], 2, 4, '36-monorepo-some-nested'],
])(
  '`getProjectPaths()`',
  (paths, readdirCalls, hasPathCalls, fixturePath, skipPaths) => {
    const testName =
      paths.length > 0
        ? `should detect ${paths.join()} project${
            paths.length > 1 ? 's' : ''
          } for ${fixturePath}`
        : `should not detect any path for ${fixturePath}`;

    it(testName, async () => {
      const fixture = path.join(__dirname, 'fixtures', fixturePath);
      const fs = new FixtureFilesystem(fixture);
      const mockReaddir = jest.fn().mockImplementation(fs.readdir);
      const mockHasPath = jest.fn().mockImplementation(fs.hasPath);
      fs.readdir = mockReaddir;
      fs.hasPath = mockHasPath;

      const actualPaths = await getProjectPaths({ fs, skipPaths });
      const normalizedPaths = actualPaths.map(path => normalizePath(path));
      expect(normalizedPaths).toEqual(paths);
      expect(fs.readdir).toHaveBeenCalledTimes(readdirCalls);
      expect(fs.hasPath).toHaveBeenCalledTimes(hasPathCalls);
    });
  }
);
