import path from 'path';
import { detectFramework } from '../src/detect-framework';
import workspaceManagers from '../src/workspaces/workspace-managers';
import { FixtureFilesystem } from './utils/fixture-filesystem';

describe('workspace-managers', () => {
  describe.each([
    ['21-npm-workspaces', 'npm'],
    ['23-pnpm-workspaces', 'pnpm'],
    ['27-yarn-workspaces', 'yarn'],
    ['25-multiple-lock-files-yarn', 'yarn'],
    ['26-multiple-lock-files-pnpm', 'pnpm'],
    ['22-pnpm', null],
    ['38-workspaces-no-lock-file', 'yarn'],
  ])('with detectFramework', (fixturePath, frameworkSlug) => {
    const testName = frameworkSlug
      ? `should detect a ${frameworkSlug} workspace for ${fixturePath}`
      : `should not detect framework for ${fixturePath}`;

    it(testName, async () => {
      const fixture = path.join(__dirname, 'fixtures', fixturePath);
      const fs = new FixtureFilesystem(fixture);

      const result = await detectFramework({
        fs,
        frameworkList: workspaceManagers,
      });

      expect(result).toBe(frameworkSlug);
    });
  });
});
