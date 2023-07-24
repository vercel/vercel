import path from 'path';
import {
  packageManagers,
  detectFramework,
  LocalFileSystemDetector,
} from '../src';

describe('package-managers', () => {
  describe.each([
    ['50-no-specified-package-manager', 'yarn'],
    ['51-npm-with-lockfile', 'npm'],
    ['52-npm-with-corepack', 'npm'],
    ['53-yarn-with-lockfile', 'yarn'],
    ['54-yarn-with-corepack', 'yarn'],
    ['55-pnpm-with-lockfile', 'pnpm'],
    ['56-pnpm-with-corepack', 'pnpm'],
    ['57-bun-with-lockfile', 'bun'],
  ])('with detectFramework', (fixturePath, frameworkSlug) => {
    const testName = `should detect package manager '${frameworkSlug}' for ${fixturePath}`;

    it(testName, async () => {
      const fixture = path.join(__dirname, 'fixtures', fixturePath);
      const fs = new LocalFileSystemDetector(fixture);

      const result = await detectFramework({
        fs,
        frameworkList: packageManagers,
      });

      expect(result).toBe(frameworkSlug);
    });
  });
});
