import path from 'path';
import { getWorkspaces, Workspace } from '../src/workspaces/get-workspaces';
import { FixtureFilesystem } from './utils/fixture-filesystem';

describe.each<[Workspace[], string]>([
  [[{ implementation: 'npm', rootPath: '/' }], '21-npm-workspaces'],
  [[{ implementation: 'pnpm', rootPath: '/' }], '23-pnpm-workspaces'],
  [[{ implementation: 'yarn', rootPath: '/' }], '27-yarn-workspaces'],
  [[{ implementation: 'yarn', rootPath: '/' }], '25-multiple-lock-files-yarn'],
  [[{ implementation: 'pnpm', rootPath: '/' }], '26-multiple-lock-files-pnpm'],
  [
    [
      { implementation: 'pnpm', rootPath: '/backend' },
      { implementation: 'yarn', rootPath: '/frontend' },
    ],
    '29-nested-workspaces',
  ],
  [[], '22-pnpm'],
])('`getWorkspaces()`', (workspaces, fixturePath) => {
  const expectedImplementations = workspaces.map(
    ({ implementation }) => implementation
  );
  const testName =
    workspaces.length > 0
      ? `should detect ${expectedImplementations.join()} workspace${
          expectedImplementations.length > 1 ? 's' : ''
        } for ${fixturePath}`
      : `should not detect any workspace for ${fixturePath}`;

  it(testName, async () => {
    const fixture = path.join(__dirname, 'fixtures', fixturePath);
    const fs = new FixtureFilesystem(fixture);

    const actualWorkspaces = await getWorkspaces({ fs });

    expect(actualWorkspaces).toEqual(expect.arrayContaining(workspaces));
  });
});
