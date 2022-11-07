import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fixtures, prepare } from '../../helpers/prepare';
import { executeVercelCLI } from './util';

const tmpdir = path.join(os.tmpdir(), 'monorepo-detection-turbo');

describe('turbo', () => {
  let directoryPath: string;

  beforeEach(async () => {
    directoryPath = await prepare(
      tmpdir,
      'monorepo-detection-turbo',
      fixtures['monorepo-detection-turbo']
    );
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
      /Automatically detected Turbo monorepo manager\. Attempting to assign default `buildCommand` and `installCommand` settings\./
    );

    const result = await fs.readFile(
      path.join(directoryPath, '.vercel/output/static/index.txt'),
      'utf8'
    );

    expect(result).toMatch(/Hello, world/);
  });

  test('should warn and not configure settings when project does not satisfy requirements', async () => {
    const turboJSONPath = path.join(directoryPath, 'turbo.json');

    await fs.writeFile(
      turboJSONPath,
      JSON.stringify({
        pipeline: {},
      })
    );

    const output = await executeVercelCLI(['build'], { cwd: directoryPath });
    expect(output.exitCode).toBe(1);
    expect(output.stderr).toMatch(
      /Missing required `build` pipeline in turbo\.json\. Skipping automatic setting assignment\./
    );
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
          buildCommand: 'cd ../.. && npx turbo run build --filter=app-1...',
          installCommand: 'cd ../.. && yarn install',
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
        buildCommand: 'cd ../.. && npx turbo run build --filter=app-1...',
        installCommand: 'cd ../.. && yarn install',
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
