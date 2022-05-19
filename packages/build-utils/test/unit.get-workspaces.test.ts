import path from 'path';
import { getWorkspaces, Workspace } from '../src/workspaces/get-workspaces';
import { FixtureFilesystem } from './utils/fixture-filesystem';

describe.each<[Workspace[], string]>([
  [[{ type: 'npm', rootPath: '/' }], '21-npm-workspaces'],
  [[{ type: 'pnpm', rootPath: '/' }], '23-pnpm-workspaces'],
  [[{ type: 'yarn', rootPath: '/' }], '27-yarn-workspaces'],
  [[{ type: 'yarn', rootPath: '/' }], '25-multiple-lock-files-yarn'],
  [[{ type: 'pnpm', rootPath: '/' }], '26-multiple-lock-files-pnpm'],
  [
    [
      { type: 'pnpm', rootPath: '/backend' },
      { type: 'yarn', rootPath: '/frontend' },
    ],
    '29-nested-workspaces',
  ],
  [
    [
      { type: 'pnpm', rootPath: '/packages/backend' },
      { type: 'yarn', rootPath: '/packages/frontend' },
    ],
    '30-double-nested-workspaces',
  ],
  [[], '22-pnpm'],
])('`getWorkspaces()`', (workspaces, fixturePath) => {
  const expectedImplementations = workspaces.map(({ type }) => type);
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
