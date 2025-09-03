import os from 'os';
import path from 'path';
import { mkdtempSync } from 'fs';
import {
  getMonorepoDefaultSettings,
  LocalFileSystemDetector,
  MissingBuildPipeline,
  MissingBuildTarget,
} from '../src';

describe('getMonorepoDefaultSettings', () => {
  test('MissingBuildTarget is an error', () => {
    const missingBuildTarget = new MissingBuildTarget();
    expect(missingBuildTarget).toBeInstanceOf(Error);
    expect(missingBuildTarget.message).toBe(
      'Missing required `build` target in either nx.json, project.json, or package.json Nx configuration.'
    );
  });
  test('MissingBuildPipeline is an error', () => {
    const missingBuildPipeline = new MissingBuildPipeline(false);
    expect(missingBuildPipeline).toBeInstanceOf(Error);
    expect(missingBuildPipeline.message).toBe(
      'Missing required `build` pipeline in turbo.json or package.json Turbo configuration.'
    );

    const missingBuildTask = new MissingBuildPipeline(true);
    expect(missingBuildTask).toBeInstanceOf(Error);
    expect(missingBuildTask.message).toBe(
      'Missing required `build` task in turbo.json.'
    );
  });

  test.each([
    ['turbo', 'turbo', false, 'app-14', false, false],
    ['turbo-has-filter', 'turbo', false, 'app-14', false, true],
    ['turbo-package-config', 'turbo', false, 'app-13', false, false],
    ['turbo-npm', 'turbo', true, 'app-15', false, false],
    ['turbo-npm-root-proj', 'turbo', true, 'app-root-proj', true, false],
    ['turbo-latest', 'turbo', false, 'app-14', false, false],
    ['turbo-2', 'turbo', false, 'app-14', false, false],
    ['turbo-jsonc', 'turbo', false, 'app-1', false, false],
    ['nx', 'nx', false, 'app-12', false, false],
    ['nx-package-config', 'nx', false, 'app-11', false, false],
    ['nx-project-and-package-config-1', 'nx', false, 'app-10', false, false],
    ['nx-project-and-package-config-2', 'nx', false, 'app-9', false, false],
    ['nx-project-config', 'nx', false, 'app-8', false, false],
  ])(
    'fixture %s',
    async (
      fixture,
      expectedResultKey,
      isNpm,
      packageName,
      isRoot,
      supportsInference
    ) => {
      const expectedResultMap: Record<string, Record<string, string>> = {
        turbo: {
          monorepoManager: 'turbo',
          buildCommand:
            isRoot || supportsInference
              ? 'turbo run build'
              : 'cd ../.. && turbo run build --filter={packages/app-1}...',
          installCommand:
            isNpm && isRoot
              ? 'npm install'
              : isNpm
                ? 'npm install --prefix=../..'
                : 'yarn install',
          commandForIgnoringBuildStep: 'npx turbo-ignore',
        },
        nx: {
          monorepoManager: 'nx',
          buildCommand: `cd ../.. && npx nx build ${packageName}`,
          installCommand: 'yarn install',
        },
      };

      const fs = new LocalFileSystemDetector(
        path.join(
          __dirname,
          'fixtures',
          'get-monorepo-default-settings',
          fixture
        )
      );
      const result = await getMonorepoDefaultSettings(
        packageName,
        isRoot ? '/' : 'packages/app-1',
        isRoot ? '/' : '../..',
        fs
      );
      expect(result).toStrictEqual(expectedResultMap[expectedResultKey]);
    }
  );

  test('returns null when neither nx nor turbo is detected', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'monorepo-test-'));
    const fs = new LocalFileSystemDetector(dir);
    const result = await getMonorepoDefaultSettings('', '', '', fs);
    expect(result).toBe(null);
  });
});
