import path from 'path';
import { remove } from 'fs-extra';
import { build } from '../src';

jest.setTimeout(2 * 60 * 1000);

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
});
