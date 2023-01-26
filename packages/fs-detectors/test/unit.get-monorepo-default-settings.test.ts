import {
  getMonorepoDefaultSettings,
  LocalFileSystemDetector,
  MissingBuildPipeline,
  MissingBuildTarget,
} from '../src';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { FixtureFilesystem } from './utils/fixture-filesystem';

describe('getMonorepoDefaultSettings', () => {
  test('MissingBuildTarget is an error', () => {
    const missingBuildTarget = new MissingBuildTarget();
    expect(missingBuildTarget).toBeInstanceOf(Error);
    expect(missingBuildTarget.message).toBe(
      'Missing required `build` target in either nx.json, project.json, or package.json Nx configuration.'
    );
  });
  test('MissingBuildPipeline is an error', () => {
    const missingBuildPipeline = new MissingBuildPipeline();
    expect(missingBuildPipeline).toBeInstanceOf(Error);
    expect(missingBuildPipeline.message).toBe(
      'Missing required `build` pipeline in turbo.json or package.json Turbo configuration.'
    );
  });

  test.each([
    ['turbo', 'turbo', false, 'app-14'],
    ['turbo-package-config', 'turbo', false, 'app-13'],
    ['turbo-npm', 'turbo', true, 'app-15'],
    ['nx', 'nx', false, 'app-12'],
    ['nx-package-config', 'nx', false, 'app-11'],
    ['nx-project-and-package-config-1', 'nx', false, 'app-10'],
    ['nx-project-and-package-config-2', 'nx', false, 'app-9'],
    ['nx-project-config', 'nx', false, 'app-8'],
  ])('fixture %s', async (fixture, expectedResultKey, isNpm, packageName) => {
    const expectedResultMap: Record<string, Record<string, string>> = {
      turbo: {
        monorepoManager: 'turbo',
        buildCommand: `cd ../.. && npx turbo run build --filter={packages/${packageName}}...`,
        installCommand: isNpm ? 'npm install --prefix=../..' : 'yarn install',
        commandForIgnoringBuildStep: 'npx turbo-ignore',
      },
      nx: {
        monorepoManager: 'nx',
        buildCommand: `cd ../.. && npx nx build ${packageName}`,
        installCommand: 'yarn install',
      },
    };

    const ffs = new FixtureFilesystem(
      path.join(__dirname, 'fixtures', 'get-monorepo-default-settings', fixture)
    );
    const result = await getMonorepoDefaultSettings(
      'app-1',
      'packages/app-1',
      '../..',
      ffs
    );
    expect(result).toStrictEqual(expectedResultMap[expectedResultKey]);
  });

  test('returns null when neither nx nor turbo is detected', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'monorepo-test-'));
    const lfs = new LocalFileSystemDetector(dir);
    const result = await getMonorepoDefaultSettings('', '', '', lfs);
    expect(result).toBe(null);
  });
});
