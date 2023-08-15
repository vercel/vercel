import path from 'path';
import { LocalFileSystemDetector } from '../src';
import { detectFramework } from '../src/detect-framework';
import monorepoManagers from '../src/monorepos/monorepo-managers';

describe('monorepo-managers', () => {
  describe.each([
    ['28-turborepo-with-yarn-workspaces', 'turbo'],
    ['31-turborepo-in-package-json', 'turbo'],
    ['22-pnpm', null],
    ['39-nx-monorepo', 'nx'],
    ['40-rush-monorepo', 'rush'],
  ])('with detectFramework', (fixturePath, frameworkSlug) => {
    const testName = frameworkSlug
      ? `should detect a ${frameworkSlug} workspace for ${fixturePath}`
      : `should not detect a monorepo manager for ${fixturePath}`;

    it.skip(testName, async () => {
      const fixture = path.join(__dirname, 'fixtures', fixturePath);
      const fs = new LocalFileSystemDetector(fixture);

      const result = await detectFramework({
        fs,
        frameworkList: monorepoManagers,
      });

      expect(result).toBe(frameworkSlug);
    });
  });
});
