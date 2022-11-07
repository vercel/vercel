import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import execa from 'execa';
import { fixtures, prepare } from '../../helpers/prepare';
import { executeVercelCLI } from './util';

const tmpdir = path.join(os.tmpdir(), 'monorepo-detection-rush');

jest.setTimeout(30000);

let testCount = 0;

describe('rush', () => {
  let directoryPath: string;

  beforeEach(async () => {
    directoryPath = await prepare(
      path.join(tmpdir, testCount.toString()),
      'monorepo-detection-rush',
      fixtures['monorepo-detection-rush']
    );
    await execa('npx', ['@microsoft/rush', 'update', '--bypass-policy'], {
      cwd: directoryPath,
      reject: false,
    });
    testCount++;
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
      /Automatically detected Rush monorepo manager\. Assigning default `buildCommand` and `installCommand` settings\./
    );
    const result = await fs.readFile(
      path.join(directoryPath, '.vercel/output/static/index.txt'),
      'utf8'
    );
    expect(result).toMatch(/Hello, world/);
  });

  test('should not override preconfigured project settings', async () => {
    const projectJSONPath = path.join(directoryPath, '.vercel/project.json');
    const projectJSON = JSON.parse(await fs.readFile(projectJSONPath, 'utf-8'));

    await fs.writeFile(
      projectJSONPath,
      JSON.stringify({
        ...projectJSON,
        settings: {
          ...projectJSON.settings,
          buildCommand:
            'node ../../common/scripts/install-run-rush.js build --to app-1',
          installCommand:
            'node ../../common/scripts/install-run-rush.js install',
        },
      })
    );

    await execa('npx', ['@microsoft/rush', 'update'], {
      cwd: directoryPath,
      reject: false,
    });

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
        buildCommand:
          'node ../../common/scripts/install-run-rush.js build --to app-1',
        installCommand: 'node ../../common/scripts/install-run-rush.js install',
      })
    );

    await execa('npx', ['@microsoft/rush', 'update'], {
      cwd: directoryPath,
      reject: false,
    });

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
