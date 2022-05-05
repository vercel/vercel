import path from 'path';
import { detectFramework } from '../src/detect-framework';
import monorepoManagers from '../src/monorepos/monorepo-managers';
import { FixtureFilesystem } from './utils/fixture-filesystem';

describe('monorepo-managers', () => {
  describe.each([
    ['turbo', '28-turborepo-with-yarn-workspaces'],
    [null, '22-pnpm'],
  ])('with detectFramework', (frameworkSlug, fixturePath) => {
    const testName = frameworkSlug
      ? `should detect a ${frameworkSlug} workspace for ${fixturePath}`
      : `should not detect a monorepo manager for ${fixturePath}`;

    it(testName, async () => {
      const fixture = path.join(__dirname, 'fixtures', fixturePath);
      const fs = new FixtureFilesystem(fixture);

      const result = await detectFramework({
        fs,
        frameworkList: monorepoManagers,
      });

      expect(result).toBe(frameworkSlug);
    });
  });
});
