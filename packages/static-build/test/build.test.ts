import path from 'path';
import { promises as fs } from 'fs';
import { remove } from 'fs-extra';
import { build } from '../src';
import { detectNitroCrons, patchConfigJson } from '../src/utils/nitro';

vi.setConfig({ testTimeout: 2 * 60 * 1000, hookTimeout: 2 * 60 * 1000 });

describe('build()', () => {
  describe('Build Output API v1', () => {
    it('should detect the output format', async () => {
      const workPath = path.join(
        __dirname,
        'build-fixtures',
        '11-build-output-v1'
      );

      try {
        const buildResult = await build({
          files: {},
          entrypoint: 'package.json',
          repoRootPath: workPath,
          workPath,
          config: {},
          meta: {
            skipDownload: true,
            cliVersion: '0.0.0',
          },
        });
        if ('buildOutputVersion' in buildResult) {
          throw new Error('Unexpected `buildOutputVersion` in build result');
        }

        expect(buildResult.output['index.html']).toBeTruthy();
      } finally {
        remove(path.join(workPath, '.vercel_build_output'));
      }
    });

    it('should detect the v1 output format when .output exists', async () => {
      const workPath = path.join(
        __dirname,
        'build-fixtures',
        '12-build-output-v1-conflict'
      );

      try {
        process.env.NOW_BUILDER = '1';
        const buildResult = await build({
          files: {},
          entrypoint: 'package.json',
          repoRootPath: workPath,
          workPath,
          config: {},
          meta: {
            skipDownload: true,
            cliVersion: '0.0.0',
          },
        });
        if ('buildOutputVersion' in buildResult) {
          throw new Error('Unexpected `buildOutputVersion` in build result');
        }

        expect(buildResult.output['index.html']).toBeTruthy();
      } finally {
        delete process.env.NOW_BUILDER;
      }
    });
  });

  describe('Build Output API v2', () => {
    it('should detect the output format', async () => {
      const workPath = path.join(
        __dirname,
        'build-fixtures',
        '10-build-output-v2'
      );

      try {
        const buildResult = await build({
          files: {},
          entrypoint: 'package.json',
          repoRootPath: workPath,
          workPath,
          config: {},
          meta: {
            skipDownload: true,
            cliVersion: '0.0.0',
          },
        });
        if ('buildOutputVersion' in buildResult) {
          throw new Error('Unexpected `buildOutputVersion` in build result');
        }

        expect(buildResult.output['index.html']).toBeTruthy();
        expect(buildResult.output['middleware']).toBeTruthy();
      } finally {
        remove(path.join(workPath, '.output'));
      }
    });
  });

  describe('Build Output API v3', () => {
    it('should detect the output format with `vercel build`', async () => {
      const workPath = path.join(
        __dirname,
        'build-fixtures',
        '09-build-output-v3'
      );
      const buildResult = await build({
        files: {},
        entrypoint: 'package.json',
        repoRootPath: workPath,
        workPath,
        config: {},
        meta: {
          skipDownload: true,
          cliVersion: '0.0.0',
        },
      });
      if ('output' in buildResult) {
        throw new Error('Unexpected `output` in build result');
      }
      expect(buildResult.buildOutputVersion).toEqual(3);
      expect(buildResult.buildOutputPath).toEqual(
        path.join(workPath, '.vercel/output')
      );
    });

    it('should detect the output format without `vercel build`', async () => {
      const workPath = path.join(
        __dirname,
        'build-fixtures',
        '09-build-output-v3'
      );
      const buildResult = await build({
        files: {},
        entrypoint: 'package.json',
        repoRootPath: workPath,
        workPath,
        config: {},
        meta: {
          skipDownload: true,
        },
      });
      if ('output' in buildResult) {
        throw new Error('Unexpected `output` in build result');
      }
      expect(buildResult.buildOutputVersion).toEqual(3);
      expect(buildResult.buildOutputPath).toEqual(
        path.join(workPath, '.vercel/output')
      );
    });

    it('should throw an Error when `vercel dev` is used with `@vercel/static-build`', async () => {
      let err;
      const workPath = path.join(
        __dirname,
        'build-fixtures',
        '09-build-output-v3'
      );
      try {
        await build({
          files: {},
          entrypoint: 'package.json',
          repoRootPath: workPath,
          workPath,
          config: {},
          meta: {
            skipDownload: true,
            isDev: true,
          },
        });
      } catch (_err: any) {
        err = _err;
      }
      expect(err.message).toEqual(
        `Detected Build Output v3 from the "build" script, but it is not supported for \`vercel dev\`. Please set the Development Command in your Project Settings.`
      );
    });
  });

  describe('Nitro scheduled tasks', () => {
    const fixture = path.join(__dirname, 'build-fixtures', '17-nitro-cron');

    afterEach(async () => {
      await remove(path.join(fixture, '.vercel'));
    });

    it('detectNitroCrons reads scheduledTasks from nitro.config.js', async () => {
      const crons = await detectNitroCrons(fixture);
      expect(crons).toEqual(
        expect.arrayContaining([
          { path: '/_nitro/tasks/db:cleanup', schedule: '* * * * *' },
          { path: '/_nitro/tasks/cms:update', schedule: '*/2 * * * *' },
        ])
      );
      expect(crons).toHaveLength(2);
    });

    it('detectNitroCrons returns empty array when no scheduledTasks', async () => {
      const crons = await detectNitroCrons(
        path.join(__dirname, 'build-fixtures', '09-build-output-v3')
      );
      expect(crons).toEqual([]);
    });

    it('patchConfigJson merges crons into existing config.json', async () => {
      const tmpDir = path.join(fixture, '.vercel', 'output');
      await fs.mkdir(tmpDir, { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, 'config.json'),
        JSON.stringify({ routes: [] })
      );

      await patchConfigJson(tmpDir, [
        { path: '/_nitro/tasks/db:cleanup', schedule: '* * * * *' },
      ]);

      const result = JSON.parse(
        await fs.readFile(path.join(tmpDir, 'config.json'), 'utf8')
      );
      expect(result.routes).toEqual([]);
      expect(result.crons).toEqual([
        { path: '/_nitro/tasks/db:cleanup', schedule: '* * * * *' },
      ]);
    });

    it('build() injects Nitro crons into config.json for nitro framework', async () => {
      const buildResult = await build({
        files: {},
        entrypoint: 'package.json',
        repoRootPath: fixture,
        workPath: fixture,
        config: { zeroConfig: true },
        meta: { skipDownload: true, cliVersion: '0.0.0' },
      });

      if (!('buildOutputVersion' in buildResult)) {
        throw new Error('Expected Build Output v3 result');
      }
      expect(buildResult.buildOutputVersion).toBe(3);

      const config = JSON.parse(
        await fs.readFile(
          path.join(buildResult.buildOutputPath, 'config.json'),
          'utf8'
        )
      );
      expect(config.crons).toEqual(
        expect.arrayContaining([
          { path: '/_nitro/tasks/db:cleanup', schedule: '* * * * *' },
          { path: '/_nitro/tasks/cms:update', schedule: '*/2 * * * *' },
        ])
      );
    });
  });
});
