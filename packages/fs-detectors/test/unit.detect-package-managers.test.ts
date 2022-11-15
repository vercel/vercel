import path from 'path';
import { packageManagers, detectFramework } from '../src';
import { FixtureFilesystem } from './utils/fixture-filesystem';

describe('package-managers', () => {
  describe.each([
    ['50-no-specified-package-manager', 'yarn'],
    ['51-npm-with-lockfile', 'npm'],
    ['52-npm-with-corepack', 'npm'],
    ['53-yarn-with-lockfile', 'yarn'],
    ['54-yarn-with-corepack', 'yarn'],
    ['55-pnpm-with-lockfile', 'pnpm'],
    ['56-pnpm-with-corepack', 'pnpm'],
  ])('with detectFramework', (fixturePath, frameworkSlug) => {
    const testName = `should detect package manager '${frameworkSlug}' for ${fixturePath}`;

    it(testName, async () => {
      const fixture = path.join(__dirname, 'fixtures', fixturePath);
      const fs = new FixtureFilesystem(fixture);

      const result = await detectFramework({
        fs,
        frameworkList: packageManagers,
      });

      expect(result).toBe(frameworkSlug);
    });
  });
});
