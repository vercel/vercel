import path from 'path';
import { remove, outputFile } from 'fs-extra';
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

  describe('Vite Environments API', () => {
    // The fixture's `build` script produces a realistic post-build layout:
    //   dist/client/{index.html,assets/main.js}   ← client env outDir
    //   dist/server/server.js                     ← server env outDir
    // We stub `vite` in the fixture's node_modules at test time so
    // `detectViteServerEnvironments` can resolve it and read a deterministic
    // environments map without pulling real vite + a framework plugin into
    // the test dependency graph. The stub reads its environments map from a
    // sibling JSON file each call, so tests can swap behaviour without
    // fighting Node's require cache.
    const workPath = path.join(
      __dirname,
      'build-fixtures',
      '17-vite-environments'
    );
    const viteStubDir = path.join(workPath, 'node_modules', 'vite');
    const viteStubConfigPath = path.join(viteStubDir, 'resolved.json');

    async function writeViteStub() {
      await outputFile(
        path.join(viteStubDir, 'package.json'),
        JSON.stringify({
          name: 'vite',
          version: '0.0.0-stub',
          main: 'index.js',
        })
      );
      await outputFile(
        path.join(viteStubDir, 'index.js'),
        `const fs = require('fs');
const path = require('path');
exports.resolveConfig = async function resolveConfig(inlineConfig) {
  const cfg = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'resolved.json'), 'utf8')
  );
  return Object.assign({ root: inlineConfig && inlineConfig.root }, cfg);
};
`
      );
    }

    async function writeStubConfig(config: unknown) {
      await outputFile(viteStubConfigPath, JSON.stringify(config));
    }

    async function cleanup() {
      await Promise.all([
        remove(path.join(workPath, 'dist')),
        remove(path.join(workPath, 'node_modules')),
      ]);
    }

    beforeEach(writeViteStub);
    afterEach(cleanup);

    it('wraps the server env entry as a function and ships the client env as static', async () => {
      await writeStubConfig({
        build: { outDir: 'dist' },
        environments: {
          client: {
            consumer: 'client',
            build: { outDir: 'dist/client' },
            resolve: { conditions: ['browser', 'import'] },
          },
          server: {
            consumer: 'server',
            build: {
              outDir: 'dist/server',
              rollupOptions: { input: { server: 'src/server.ts' } },
            },
            resolve: { conditions: ['node', 'import', 'require'] },
          },
        },
      });

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

      // Client env's outDir → static files at the root of the output.
      expect(buildResult.output['index.html']).toBeTruthy();
      expect(buildResult.output['assets/main.js']).toBeTruthy();

      // Server env's entry → a Vercel Function at `index`. The handler is
      // relative to `repoRootPath`, which equals `workPath` here.
      const fn = buildResult.output['index'] as any;
      expect(fn).toBeTruthy();
      expect(fn.type).toBe('Lambda');
      expect(fn.useWebApi).toBe(true);
      expect(fn.handler).toBe(path.join('dist', 'server', 'server.js'));

      // Routes: filesystem first, then catch-all to the server function.
      const routes = buildResult.routes ?? [];
      expect(routes[0]).toEqual({ handle: 'filesystem' });
      expect(routes[1]).toEqual({ src: '/(.*)', dest: '/index' });
    });

    it('falls through when no server environment is declared', async () => {
      await writeStubConfig({
        build: { outDir: 'dist' },
        environments: {
          client: { consumer: 'client', build: { outDir: 'dist/client' } },
        },
      });

      const buildResult = await build({
        files: {},
        entrypoint: 'package.json',
        repoRootPath: workPath,
        workPath,
        config: { outputDirectory: 'dist/client' },
        meta: {
          skipDownload: true,
          cliVersion: '0.0.0',
        },
      });

      if ('buildOutputVersion' in buildResult) {
        throw new Error('Unexpected `buildOutputVersion` in build result');
      }

      // Static-build's normal path was used: no server function.
      expect(buildResult.output['index']).toBeFalsy();
      expect(buildResult.output['index.html']).toBeTruthy();
    });

    it('falls through when the server env shares the client env outDir', async () => {
      // @sveltejs/vite-plugin-svelte registers a phantom `ssr` env with
      // outDir defaulting to `dist`. Make sure we don't try to take over.
      await writeStubConfig({
        build: { outDir: 'dist' },
        environments: {
          client: { consumer: 'client', build: { outDir: 'dist/client' } },
          ssr: { consumer: 'server', build: { outDir: 'dist/client' } },
        },
      });

      const buildResult = await build({
        files: {},
        entrypoint: 'package.json',
        repoRootPath: workPath,
        workPath,
        config: { outputDirectory: 'dist/client' },
        meta: {
          skipDownload: true,
          cliVersion: '0.0.0',
        },
      });

      if ('buildOutputVersion' in buildResult) {
        throw new Error('Unexpected `buildOutputVersion` in build result');
      }

      expect(buildResult.output['index']).toBeFalsy();
      expect(buildResult.output['index.html']).toBeTruthy();
    });
  });
});
