import path from 'path';
import { normalizePath } from '@vercel/build-utils';
import { getProjectPaths, ProjectPath } from '../src/get-project-paths';
import { FixtureFilesystem } from './utils/fixture-filesystem';

describe.each<{
  fixturePath: string;
  resultPaths: ProjectPath[];
  skipPaths?: ProjectPath[];
  readdirCalls: number;
}>([
  {
    fixturePath: '32-monorepo-highly-nested',
    resultPaths: [],
    readdirCalls: 2,
  },
  {
    fixturePath: '33-hybrid-monorepo',
    resultPaths: ['backend/app-three'],
    readdirCalls: 2,
    skipPaths: ['frontend'],
  },
  {
    fixturePath: '34-monorepo-no-workspaces',
    resultPaths: ['backend/app-three', 'frontend/app-one', 'frontend/app-two'],
    readdirCalls: 3,
  },
  {
    fixturePath: '35-no-monorepo',
    resultPaths: [],
    readdirCalls: 1,
  },
  {
    fixturePath: '36-monorepo-some-nested',
    resultPaths: ['frontend/app-two'],
    readdirCalls: 2,
  },
  {
    fixturePath: '37-project-depth-one-level',
    resultPaths: ['./'],
    readdirCalls: 1,
  },
])(
  '`getProjectPaths()`',
  ({ resultPaths, readdirCalls, fixturePath, skipPaths }) => {
    const testName =
      resultPaths.length > 0
        ? `should detect ${resultPaths.join()} project${
            resultPaths.length > 1 ? 's' : ''
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
      expect(normalizedPaths).toEqual(resultPaths);
      expect(fs.readdir).toHaveBeenCalledTimes(readdirCalls);
    });
  }
);
