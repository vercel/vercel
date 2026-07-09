import path from 'path';
import os from 'os';
import { chmod, mkdtemp, remove, writeFile } from 'fs-extra';
import { build } from '../src';

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

  describe('routePrefix validation', () => {
    const workPath = path.join(
      __dirname,
      'build-fixtures',
      '11-build-output-v1'
    );
    const baseBuildArgs = {
      files: {},
      entrypoint: 'package.json',
      repoRootPath: workPath,
      workPath,
      meta: {
        skipDownload: true,
        cliVersion: '0.0.0',
      },
    };

    it.each([
      '/../../../../outside-target/static-escape',
      '/admin/../../outside-target/static-escape',
      '/..\\..\\outside-target/static-escape',
    ])('should reject routePrefix traversal value %s', async routePrefix => {
      await expect(
        build({
          ...baseBuildArgs,
          config: { routePrefix },
        })
      ).rejects.toMatchObject({
        code: 'STATIC_BUILD_UNSAFE_ROUTE_PREFIX',
      });
    });

    it('should mount safe routePrefix values under the prefixed output path', async () => {
      const workPath = await mkdtemp(
        path.join(os.tmpdir(), 'static-build-route-prefix-')
      );

      try {
        const buildScript = path.join(workPath, 'build.sh');
        await writeFile(
          buildScript,
          '#!/bin/sh\nmkdir -p dist\necho hello > dist/index.html\n'
        );
        await chmod(buildScript, 0o755);

        const buildResult = await build({
          files: {},
          entrypoint: 'build.sh',
          repoRootPath: workPath,
          workPath,
          config: { routePrefix: '/admin' },
          meta: {
            skipDownload: true,
            cliVersion: '0.0.0',
          },
        });

        if ('buildOutputVersion' in buildResult) {
          throw new Error('Unexpected `buildOutputVersion` in build result');
        }

        // `glob()` joins the mountpoint with `path.join`, so output keys use
        // the platform separator (`admin\index.html` on Windows)
        expect(
          buildResult.output[path.join('admin', 'index.html')]
        ).toBeTruthy();
      } finally {
        await remove(workPath);
      }
    });
  });
});
