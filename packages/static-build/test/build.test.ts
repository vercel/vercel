import path from 'path';
import os from 'os';
import {
  chmod,
  mkdtemp,
  remove,
  writeFile,
  outputFile,
  outputJSON,
  symlink,
} from 'fs-extra';
import { build } from '../src';

vi.setConfig({ testTimeout: 2 * 60 * 1000, hookTimeout: 2 * 60 * 1000 });

describe('build()', () => {
  describe('automatic static publishing with daemons', () => {
    let project: string;
    beforeEach(async () => {
      project = await mkdtemp(path.join(os.tmpdir(), 'static-build-daemons-'));
      for (const file of [
        'Dockerfile',
        'index.html',
        'backend/Dockerfile',
        'backend/server.py',
        'public/index.html',
        'apps/Dockerfile',
        'apps/web/index.html',
        'apps/web/dist/index.html',
      ]) {
        await outputFile(path.join(project, file), file);
      }
    });
    afterEach(async () => {
      await remove(project);
    });

    async function run(
      daemonRoot: string,
      outputDirectory: string,
      workspace = '.',
      routePrefix = '/',
      buildCommand = 'node -e ""'
    ) {
      const workPath = path.join(project, workspace);
      await outputJSON(path.join(workPath, 'package.json'), {
        name: 'daemon-static-test',
        private: true,
      });
      return build({
        files: {},
        entrypoint: 'package.json',
        workPath,
        repoRootPath: project,
        config: {
          zeroConfig: true,
          framework: null,
          installCommand: '',
          buildCommand,
          outputDirectory,
          routePrefix,
        },
        meta: {
          skipDownload: true,
          cliVersion: '0.0.0',
          daemonContext: {
            projectRoot: project,
            daemons: {
              worker: {
                root: daemonRoot,
                entrypoint: 'Dockerfile',
                instances: {},
              },
            },
          },
        },
      });
    }

    it('excludes nested sources when publishing the project root under a URL prefix', async () => {
      const result = await run('backend', '.', '.', '/admin');
      if (!('output' in result)) throw new Error('Expected a file map');
      const keys = Object.keys(result.output);
      expect(keys.some(key => key.includes(`backend${path.sep}`))).toBe(false);
      expect(result.output[path.join('admin', 'index.html')]).toBeDefined();
    });

    it.each([
      ['backend', 'backend', '.', '/admin'],
      ['backend', '.', 'backend', '/backend'],
    ])('rejects daemon=%s output=%s workspace=%s prefix=%s', async (daemon, output, workspace, prefix) => {
      await expect(
        run(daemon, output, workspace, prefix)
      ).rejects.toMatchObject({ code: 'INVALID_DAEMON_ROOT' });
    });

    it('publishes the selected service output directory under its URL prefix', async () => {
      const serviceResult = await run('apps', 'dist', 'apps/web', '/web');
      if (!('output' in serviceResult)) throw new Error('Expected a file map');
      expect(Object.keys(serviceResult.output)).toEqual([
        path.join('web', 'index.html'),
      ]);
    });

    it('publishes daemon files deliberately copied by a build script into dist', async () => {
      await outputFile(
        path.join(project, 'build.js'),
        `
        const fs = require('fs');
        fs.mkdirSync('dist');
        fs.copyFileSync('backend/server.py', 'dist/server.py');
        fs.copyFileSync('Dockerfile', 'dist/Dockerfile');
      `
      );
      const result = await run('.', 'dist', '.', '/', 'node build.js');
      if (!('output' in result)) throw new Error('Expected a file map');
      expect(Object.keys(result.output).sort()).toEqual([
        'Dockerfile',
        'server.py',
      ]);
    });

    it('excludes a public symlink into a daemon directory', async () => {
      await symlink(
        path.join(project, 'backend/server.py'),
        path.join(project, 'public/download.txt')
      );
      const result = await run('backend', 'public', '.', '/admin');
      if (!('output' in result)) throw new Error('Expected a file map');
      expect(Object.keys(result.output)).toEqual([
        path.join('admin', 'index.html'),
      ]);
    });

    it.skipIf(process.platform === 'win32')(
      'protects legacy shell builds that publish the project root',
      async () => {
        await outputFile(path.join(project, 'build.sh'), '#!/bin/sh\nexit 0\n');
        await chmod(path.join(project, 'build.sh'), 0o755);
        const result = await build({
          files: {},
          entrypoint: 'build.sh',
          workPath: project,
          repoRootPath: project,
          config: { distDir: '.', routePrefix: '/admin' },
          meta: {
            skipDownload: true,
            daemonContext: {
              projectRoot: project,
              daemons: {
                worker: {
                  root: 'backend',
                  entrypoint: 'Dockerfile',
                  instances: {},
                },
              },
            },
          },
        });
        if (!('output' in result)) throw new Error('Expected a file map');
        expect(Object.keys(result.output)).toContain(
          path.join('admin', 'index.html')
        );
        expect(
          Object.keys(result.output).some(key =>
            key.includes(`backend${path.sep}`)
          )
        ).toBe(false);
      }
    );

    it('treats custom Build Output API artifacts as explicitly published output', async () => {
      await outputJSON(path.join(project, '.vercel/output/config.json'), {
        version: 3,
      });
      await outputFile(
        path.join(project, '.vercel/output/static/backend/server.py'),
        'explicit build artifact'
      );
      const result = await run('.', '.');
      expect(result).toMatchObject({
        buildOutputVersion: 3,
        buildOutputPath: path.join(project, '.vercel/output'),
      });
    });
  });

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
        const about =
          buildResult.output[
            path.join('.vercel', 'functions', 'about', 'index')
          ];
        expect(about.type).toBe('Lambda');
        if (about.type !== 'Lambda') {
          throw new Error('Expected the about output to be a Lambda');
        }
        expect(about.maxConcurrency).toBe(8);
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
