import path from 'path';
import { getProjectPaths, ProjectPath } from '../src/get-project-paths';
import { FixtureFilesystem } from './utils/fixture-filesystem';

describe.each<[ProjectPath[], string, ProjectPath[]]>([
  [
    ['backend/app-three', 'frontend/app-one', 'frontend/app-two'],
    '34-monorepo-no-workspaces',
    [],
  ],
  [[], '35-no-monorepo', []],
  [[], '32-monorepo-highly-nested', []],
  [['backend/app-three'], '33-hybrid-monorepo', ['frontend']],
])('`getProjectPaths()`', (paths, fixturePath, skipPaths) => {
  const testName =
    paths.length > 0
      ? `should detect ${paths.join()} project${
          paths.length > 1 ? 's' : ''
        } for ${fixturePath}`
      : `should not detect any path for ${fixturePath}`;

  it(testName, async () => {
    const fixture = path.join(__dirname, 'fixtures', fixturePath);
    const fs = new FixtureFilesystem(fixture);

    const actualPaths = await getProjectPaths({ fs, skipPaths });

    expect(actualPaths).toEqual(expect.arrayContaining(paths));
  });
});
