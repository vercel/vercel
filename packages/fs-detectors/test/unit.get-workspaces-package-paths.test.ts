import path from 'path';
import { getWorkspaces } from '../src/workspaces/get-workspaces';
import { getWorkspacePackagePaths } from '../src/workspaces/get-workspace-package-paths';
import { FixtureFilesystem } from './utils/fixture-filesystem';

describe.each<[string, string[]]>([
  ['21-npm-workspaces', ['/a', '/b']],
  ['23-pnpm-workspaces', ['/c', '/d']],
  ['27-yarn-workspaces', ['/a', '/b']],
  ['25-multiple-lock-files-yarn', ['/a', '/b']],
  ['26-multiple-lock-files-pnpm', ['/a', '/b']],
  [
    '29-nested-workspaces',
    ['/backend/c', '/backend/d', '/frontend/a', '/frontend/b'],
  ],
  ['22-pnpm', []],
  ['41-nx-workspace', ['/apps/app-one', '/apps/app-two']],
  ['42-npm-workspace-with-nx', ['/apps/app-one', '/apps/app-two']],
  ['43-nx-json-misshaped', []],
  ['44-nx-json-string', []],
  ['40-rush-monorepo', ['/apps/my-app', '/apps/my-second-app']],
  ['41-rush-monorepo-empty', []],
  ['42-rush-json-invalid', []],
  ['45-rush-no-project-folder', ['/apps/my-second-app']],
])('`getWorkspacePackagePaths()`', (fixturePath, packagePaths) => {
  const testName =
    packagePaths.length > 0
      ? `should detect ${packagePaths.join()} package${
          packagePaths.length > 1 ? 's' : ''
        } for ${fixturePath}`
      : `should not detect any workspace for ${fixturePath}`;

  it(testName, async () => {
    const fixture = path.join(__dirname, 'fixtures', fixturePath);
    const fs = new FixtureFilesystem(fixture);

    const workspaces = await getWorkspaces({ fs });
    const actualPackagePaths = (
      await Promise.all(
        workspaces.map(workspace => getWorkspacePackagePaths({ fs, workspace }))
      )
    ).flat();

    expect(actualPackagePaths).toEqual(packagePaths);
  });
});
