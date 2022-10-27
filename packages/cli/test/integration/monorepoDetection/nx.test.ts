import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fixtures, prepare } from '../../helpers/prepare';
import { executeVercelCLI } from './util';

const tmpdir = path.join(os.tmpdir(), 'monorepo-detection-nx');

jest.setTimeout(10000);

describe('nx', () => {
  describe.each([
    'monorepo-detection-nx',
    'monorepo-detection-nx-project-config',
    'monorepo-detection-nx-package-config',
    'monorepo-detection-nx-project-and-package-config-1',
    'monorepo-detection-nx-project-and-package-config-2',
  ] as const)('fixture: %s', fixture => {
    let directoryPath: string;

    beforeEach(async () => {
      directoryPath = await prepare(tmpdir, fixture, fixtures[fixture]);
    });

    afterEach(async () => {
      if (!directoryPath) {
        throw new Error('directoryPath unexpectedly undefined');
      }
      await fs.rm(directoryPath, { recursive: true, force: true });
    });

    test('should detect and use correct defaults', async () => {
      const output = await executeVercelCLI(['build'], { cwd: directoryPath });
      expect(output.exitCode).toBe(0);
      expect(output.stderr).toMatch(
        /Automatically detected Nx monorepo manager\. Attempting to assign default `buildCommand` and `installCommand` settings\./
      );
      const result = await fs.readFile(
        path.join(directoryPath, '.vercel/output/static/index.txt'),
        'utf8'
      );
      expect(result).toMatch(/Hello, world/);
    });

    test('should not override preconfigured project settings', async () => {
      const projectJSONPath = path.join(directoryPath, '.vercel/project.json');
      const projectJSON = JSON.parse(
        await fs.readFile(projectJSONPath, 'utf-8')
      );

      await fs.writeFile(
        projectJSONPath,
        JSON.stringify({
          ...projectJSON,
          settings: {
            ...projectJSON.settings,
            buildCommand: 'cd ../.. && npx nx build app-1',
            installCommand: 'cd ../.. && npm install',
          },
        })
      );

      const output = await executeVercelCLI(['build'], { cwd: directoryPath });
      expect(output.exitCode).toBe(0);
      expect(output.stderr).toMatch(
        /Cannot automatically assign buildCommand as it is already set via project settings or configuarion overrides\./
      );
      expect(output.stderr).toMatch(
        /Cannot automatically assign installCommand as it is already set via project settings or configuarion overrides\./
      );
    });

    test('should not override configuration overrides', async () => {
      await fs.writeFile(
        path.join(directoryPath, 'packages/app-1/vercel.json'),
        JSON.stringify({
          buildCommand: 'cd ../.. && npx nx build app-1',
          installCommand: 'cd ../.. && npm install',
        })
      );

      const output = await executeVercelCLI(['build'], { cwd: directoryPath });

      expect(output.exitCode).toBe(0);
      expect(output.stderr).toMatch(
        /Cannot automatically assign buildCommand as it is already set via project settings or configuarion overrides\./
      );
      expect(output.stderr).toMatch(
        /Cannot automatically assign installCommand as it is already set via project settings or configuarion overrides\./
      );
    });
  });

  describe.each([
    [
      'monorepo-detection-nx',
      'nx.json',
      'targetDefaults.build',
      [
        /Missing default `build` target in nx\.json\. Checking for project level Nx configuration\.\.\./,
        /Missing required `build` target in either project\.json or package\.json Nx configuration\. Skipping automatic setting assignment\./,
      ],
    ],
    [
      'monorepo-detection-nx-project-config',
      'packages/app-1/project.json',
      'targets.build',
      [
        /Missing default `build` target in nx\.json\. Checking for project level Nx configuration\.\.\./,
        /Found project\.json Nx configuration\./,
        /Missing required `build` target in either project\.json or package\.json Nx configuration\. Skipping automatic setting assignment\./,
      ],
    ],
    [
      'monorepo-detection-nx-package-config',
      'packages/app-1/package.json',
      'nx.targets.build',
      [
        /Missing default `build` target in nx\.json\. Checking for project level Nx configuration\.\.\./,
        /Found package\.json Nx configuration\./,
        /Missing required `build` target in either project\.json or package\.json Nx configuration\. Skipping automatic setting assignment\./,
      ],
    ],
  ] as const)(
    'fixture: %s',
    (fixture, configFile, propertyAccessor, expectedLogs) => {
      let directoryPath: string;

      beforeEach(async () => {
        directoryPath = await prepare(tmpdir, fixture, fixtures[fixture]);
      });

      afterEach(async () => {
        if (!directoryPath) {
          throw new Error('directoryPath unexpectedly undefined');
        }
        await fs.rm(directoryPath, { recursive: true, force: true });
      });

      function deleteSubProperty(
        obj: { [k: string]: any },
        accessorString: string
      ) {
        const accessors = accessorString.split('.');
        const lastAccessor = accessors.pop();
        for (const accessor of accessors) {
          obj = obj[accessor];
        }
        // lastAccessor cannot be undefined as accessors will always be an array of atleast one string
        delete obj[lastAccessor as string];
      }

      test('should warn and not configure settings when project does not satisfy requirements', async () => {
        const configPath = path.join(directoryPath, configFile);
        const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));

        deleteSubProperty(config, propertyAccessor);
        await fs.writeFile(configPath, JSON.stringify(config));

        const output = await executeVercelCLI(['build'], {
          cwd: directoryPath,
        });

        expect(output.exitCode).toBe(1);
        for (const log of expectedLogs) {
          expect(output.stderr).toMatch(log);
        }
      });
    }
  );
});
