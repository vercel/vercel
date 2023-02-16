import ms from 'ms';
import fs from 'fs-extra';
import { join } from 'path';
import { getWriteableDirectory } from '@vercel/build-utils';
import build from '../../../../src/commands/build';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { setupFixture } from '../../../helpers/setup-fixture';
import JSON5 from 'json5';
// TODO (@Ethan-Arrowood) - After shipping support for turbo and nx, revisit rush support
// import execa from 'execa';

jest.setTimeout(ms('1 minute'));

const fixture = (name: string) =>
  join(__dirname, '../../../fixtures/unit/commands/build', name);

describe('build', () => {
  const originalCwd = process.cwd();

  it('should build with `@vercel/static`', async () => {
    const cwd = fixture('static');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // `builds.json` says that "@vercel/static" was run
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds).toMatchObject({
        target: 'preview',
        builds: [
          {
            require: '@vercel/static',
            apiVersion: 2,
            src: '**',
            use: '@vercel/static',
          },
        ],
      });

      // "static" directory contains static files
      const files = await fs.readdir(join(output, 'static'));
      expect(files.sort()).toEqual(['index.html']);
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should build with `@now/static`', async () => {
    const cwd = fixture('now-static');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds).toMatchObject({
        target: 'preview',
        builds: [
          {
            require: '@now/static',
            apiVersion: 2,
            src: 'www/index.html',
            use: '@now/static',
          },
        ],
      });

      const files = await fs.readdir(join(output, 'static'));
      expect(files).toEqual(['www']);
      const www = await fs.readdir(join(output, 'static', 'www'));
      expect(www).toEqual(['index.html']);
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should build with `@vercel/node`', async () => {
    const cwd = fixture('node');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // `builds.json` says that "@vercel/node" was run
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds).toMatchObject({
        target: 'preview',
        builds: [
          {
            require: '@vercel/node',
            apiVersion: 3,
            use: '@vercel/node',
            src: 'api/es6.js',
            config: { zeroConfig: true },
          },
          {
            require: '@vercel/node',
            apiVersion: 3,
            use: '@vercel/node',
            src: 'api/index.js',
            config: { zeroConfig: true },
          },
          {
            require: '@vercel/node',
            apiVersion: 3,
            use: '@vercel/node',
            src: 'api/mjs.mjs',
            config: { zeroConfig: true },
          },
          {
            require: '@vercel/node',
            apiVersion: 3,
            use: '@vercel/node',
            src: 'api/typescript.ts',
            config: { zeroConfig: true },
          },
        ],
      });

      // "static" directory is empty
      const hasStaticFiles = await fs.pathExists(join(output, 'static'));
      expect(
        hasStaticFiles,
        'Expected ".vercel/output/static" to not exist'
      ).toEqual(false);

      // "functions/api" directory has output Functions
      const functions = await fs.readdir(join(output, 'functions/api'));
      expect(functions.sort()).toEqual([
        'es6.func',
        'index.func',
        'mjs.func',
        'typescript.func',
      ]);
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should handle symlinked static files', async () => {
    const cwd = fixture('static-symlink');
    const output = join(cwd, '.vercel/output');

    // try to create the symlink, if it fails (e.g. Windows), skip the test
    try {
      await fs.unlink(join(cwd, 'foo.html'));
      await fs.symlink(join(cwd, 'index.html'), join(cwd, 'foo.html'));
    } catch (e) {
      console.log('Symlinks not available, skipping test');
      return;
    }

    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // `builds.json` says that "@vercel/static" was run
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds).toMatchObject({
        target: 'preview',
        builds: [
          {
            require: '@vercel/static',
            apiVersion: 2,
            src: '**',
            use: '@vercel/static',
          },
        ],
      });

      // "static" directory contains static files
      const files = await fs.readdir(join(output, 'static'));
      expect(files.sort()).toEqual(['foo.html', 'index.html']);
      expect(
        (await fs.lstat(join(output, 'static', 'foo.html'))).isSymbolicLink()
      ).toEqual(true);
      expect(
        (await fs.lstat(join(output, 'static', 'index.html'))).isSymbolicLink()
      ).toEqual(false);
    } finally {
      await fs.unlink(join(cwd, 'foo.html'));
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should normalize "src" path in `vercel.json`', async () => {
    const cwd = fixture('normalize-src');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // `builds.json` says that "@vercel/node" was run
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds).toMatchObject({
        target: 'preview',
        builds: [
          {
            require: '@vercel/node',
            apiVersion: 3,
            use: '@vercel/node',
            src: 'server.js',
          },
        ],
      });

      // `config.json` includes "route" from `vercel.json`
      const config = await fs.readJSON(join(output, 'config.json'));
      expect(config).toMatchObject({
        version: 3,
        routes: [
          {
            src: '^/(.*)$',
            dest: '/server.js',
          },
        ],
      });

      // "static" directory is empty
      const hasStaticFiles = await fs.pathExists(join(output, 'static'));
      expect(
        hasStaticFiles,
        'Expected ".vercel/output/static" to not exist'
      ).toEqual(false);

      // "functions" directory has output Function
      const functions = await fs.readdir(join(output, 'functions'));
      expect(functions.sort()).toEqual(['server.js.func']);
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should build with 3rd party Builder', async () => {
    const cwd = fixture('third-party-builder');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // `builds.json` says that "txt-builder" was run
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds).toMatchObject({
        target: 'preview',
        builds: [
          {
            require: 'txt-builder',
            apiVersion: 3,
            use: 'txt-builder@0.0.0',
            src: 'api/foo.txt',
            config: {
              zeroConfig: true,
              functions: {
                'api/*.txt': {
                  runtime: 'txt-builder@0.0.0',
                },
              },
            },
          },
          {
            require: '@vercel/static',
            apiVersion: 2,
            use: '@vercel/static',
            src: '!{api/**,package.json,middleware.[jt]s}',
            config: {
              zeroConfig: true,
            },
          },
        ],
      });

      // "static" directory is empty
      const hasStaticFiles = await fs.pathExists(join(output, 'static'));
      expect(
        hasStaticFiles,
        'Expected ".vercel/output/static" to not exist'
      ).toEqual(false);

      // "functions/api" directory has output Functions
      const functions = await fs.readdir(join(output, 'functions/api'));
      expect(functions.sort()).toEqual(['foo.func']);

      const vcConfig = await fs.readJSON(
        join(output, 'functions/api/foo.func/.vc-config.json')
      );
      expect(vcConfig).toMatchObject({
        handler: 'api/foo.txt',
        runtime: 'provided',
        environment: {},
      });
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should serialize `EdgeFunction` output in version 3 Builder', async () => {
    const cwd = fixture('edge-function');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      client.setArgv('build', '--prod');
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // `builds.json` says that "edge-function" Builder was run
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds).toMatchObject({
        target: 'production',
        builds: [
          {
            require: 'edge-function',
            apiVersion: 3,
            use: 'edge-function@0.0.0',
            src: 'api/edge.js',
            config: {
              zeroConfig: true,
              functions: {
                'api/*.js': {
                  runtime: 'edge-function@0.0.0',
                },
              },
            },
          },
          {
            require: '@vercel/static',
            apiVersion: 2,
            use: '@vercel/static',
            src: '!{api/**,package.json,middleware.[jt]s}',
            config: {
              zeroConfig: true,
            },
          },
        ],
      });

      // "static" directory is empty
      const hasStaticFiles = await fs.pathExists(join(output, 'static'));
      expect(
        hasStaticFiles,
        'Expected ".vercel/output/static" to not exist'
      ).toEqual(false);

      // "functions/api" directory has output Functions
      const functions = await fs.readdir(join(output, 'functions/api'));
      expect(functions.sort()).toEqual(['edge.func']);

      const vcConfig = await fs.readJSON(
        join(output, 'functions/api/edge.func/.vc-config.json')
      );
      expect(vcConfig).toMatchObject({
        runtime: 'edge',
        name: 'api/edge.js',
        deploymentTarget: 'v8-worker',
        entrypoint: 'api/edge.js',
      });
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should pull "preview" env vars by default', async () => {
    const cwd = fixture('static-pull');
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });
    const envFilePath = join(cwd, '.vercel', '.env.preview.local');
    const projectJsonPath = join(cwd, '.vercel', 'project.json');
    const originalProjectJson = await fs.readJSON(
      join(cwd, '.vercel/project.json')
    );
    try {
      process.chdir(cwd);
      client.setArgv('build', '--yes');
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const previewEnv = await fs.readFile(envFilePath, 'utf8');
      const envFileHasPreviewEnv = previewEnv.includes(
        'REDIS_CONNECTION_STRING'
      );
      expect(envFileHasPreviewEnv).toBeTruthy();
    } finally {
      await fs.remove(envFilePath);
      await fs.writeJSON(projectJsonPath, originalProjectJson, { spaces: 2 });
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should pull "production" env vars with `--prod`', async () => {
    const cwd = fixture('static-pull');
    useUser();
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: 'vercel-pull-next',
      name: 'vercel-pull-next',
    });
    const envFilePath = join(cwd, '.vercel', '.env.production.local');
    const projectJsonPath = join(cwd, '.vercel', 'project.json');
    const originalProjectJson = await fs.readJSON(
      join(cwd, '.vercel/project.json')
    );
    try {
      process.chdir(cwd);
      client.setArgv('build', '--yes', '--prod');
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const prodEnv = await fs.readFile(envFilePath, 'utf8');
      const envFileHasProductionEnv1 = prodEnv.includes(
        'REDIS_CONNECTION_STRING'
      );
      expect(envFileHasProductionEnv1).toBeTruthy();
      const envFileHasProductionEnv2 = prodEnv.includes(
        'SQL_CONNECTION_STRING'
      );
      expect(envFileHasProductionEnv2).toBeTruthy();
    } finally {
      await fs.remove(envFilePath);
      await fs.writeJSON(projectJsonPath, originalProjectJson, { spaces: 2 });
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should build root-level `middleware.js` and exclude from static files', async () => {
    const cwd = fixture('middleware');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // `builds.json` says that "@vercel/node" was run
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds).toMatchObject({
        target: 'preview',
        builds: [
          {
            require: '@vercel/node',
            apiVersion: 3,
            use: '@vercel/node',
            src: 'middleware.js',
            config: {
              zeroConfig: true,
              middleware: true,
            },
          },
          {
            require: '@vercel/static',
            apiVersion: 2,
            use: '@vercel/static',
            src: '!{api/**,package.json,middleware.[jt]s}',
            config: {
              zeroConfig: true,
            },
          },
        ],
      });

      // `config.json` includes the "middlewarePath" route
      const config = await fs.readJSON(join(output, 'config.json'));
      expect(config).toMatchObject({
        version: 3,
        routes: [
          {
            src: '^/.*$',
            middlewarePath: 'middleware',
            override: true,
            continue: true,
          },
          { handle: 'error' },
          { status: 404, src: '^(?!/api).*$', dest: '/404.html' },
        ],
      });

      // "static" directory contains `index.html`, but *not* `middleware.js`
      const staticFiles = await fs.readdir(join(output, 'static'));
      expect(staticFiles.sort()).toEqual(['index.html']);

      // "functions" directory contains `middleware.func`
      const functions = await fs.readdir(join(output, 'functions'));
      expect(functions.sort()).toEqual(['middleware.func']);
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should build root-level `middleware.js` with "Root Directory" setting', async () => {
    const cwd = fixture('middleware-root-directory');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // `builds.json` says that "@vercel/static" was run
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds).toMatchObject({
        target: 'preview',
        builds: [
          {
            require: '@vercel/node',
            apiVersion: 3,
            use: '@vercel/node',
            src: 'middleware.js',
            config: {
              zeroConfig: true,
              middleware: true,
            },
          },
          {
            require: '@vercel/static',
            apiVersion: 2,
            use: '@vercel/static',
            src: '!{api/**,package.json,middleware.[jt]s}',
            config: {
              zeroConfig: true,
            },
          },
        ],
      });

      // `config.json` includes the "middlewarePath" route
      const config = await fs.readJSON(join(output, 'config.json'));
      expect(config).toMatchObject({
        version: 3,
        routes: [
          {
            src: '^/.*$',
            middlewarePath: 'middleware',
            override: true,
            continue: true,
          },
          { handle: 'error' },
          { status: 404, src: '^(?!/api).*$', dest: '/404.html' },
        ],
      });

      // "static" directory contains `index.html`, but *not* `middleware.js`
      const staticFiles = await fs.readdir(join(output, 'static'));
      expect(staticFiles.sort()).toEqual(['index.html']);

      // "functions" directory contains `middleware.func`
      const functions = await fs.readdir(join(output, 'functions'));
      expect(functions.sort()).toEqual(['middleware.func']);
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should build root-level `middleware.js` with "matcher" config', async () => {
    const cwd = fixture('middleware-with-matcher');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // `builds.json` says that "@vercel/node" was run
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds).toMatchObject({
        target: 'preview',
        builds: [
          {
            require: '@vercel/node',
            apiVersion: 3,
            use: '@vercel/node',
            src: 'middleware.js',
            config: {
              zeroConfig: true,
              middleware: true,
            },
          },
          {
            require: '@vercel/static',
            apiVersion: 2,
            use: '@vercel/static',
            src: '!{api/**,package.json,middleware.[jt]s}',
            config: {
              zeroConfig: true,
            },
          },
        ],
      });

      // `config.json` includes the "middlewarePath" route
      const config = await fs.readJSON(join(output, 'config.json'));
      expect(config).toMatchObject({
        version: 3,
        routes: [
          {
            src: '^\\/about(?:\\/((?:[^\\/#\\?]+?)(?:\\/(?:[^\\/#\\?]+?))*))?[\\/#\\?]?$|^\\/dashboard(?:\\/((?:[^\\/#\\?]+?)(?:\\/(?:[^\\/#\\?]+?))*))?[\\/#\\?]?$',
            middlewarePath: 'middleware',
            override: true,
            continue: true,
          },
          { handle: 'error' },
          { status: 404, src: '^(?!/api).*$', dest: '/404.html' },
        ],
      });

      // "static" directory contains `index.html`, but *not* `middleware.js`
      const staticFiles = await fs.readdir(join(output, 'static'));
      expect(staticFiles.sort()).toEqual(['index.html']);

      // "functions" directory contains `middleware.func`
      const functions = await fs.readdir(join(output, 'functions'));
      expect(functions.sort()).toEqual(['middleware.func']);
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should support `--output` parameter', async () => {
    const cwd = fixture('static');
    const output = await getWriteableDirectory();
    try {
      process.chdir(cwd);
      client.setArgv('build', '--output', output);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // `builds.json` says that "@vercel/static" was run
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds).toMatchObject({
        target: 'preview',
        builds: [
          {
            require: '@vercel/static',
            apiVersion: 2,
            src: '**',
            use: '@vercel/static',
          },
        ],
      });

      // "static" directory contains static files
      const files = await fs.readdir(join(output, 'static'));
      expect(files.sort()).toEqual(['index.html']);
    } finally {
      await fs.remove(output);
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  // This test is for `vercel-sapper` which doesn't export `version` property,
  // but returns a structure that's compatible with `version: 2`
  it("should support Builder that doesn't export `version`", async () => {
    const cwd = fixture('versionless-builder');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // `builds.json` says that "versionless-builder" was run
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds).toMatchObject({
        target: 'preview',
        builds: [
          {
            require: 'versionless-builder',
            src: 'package.json',
            use: 'versionless-builder@0.0.0',
          },
        ],
      });

      // "static" directory contains static files
      const files = await fs.readdir(join(output, 'static'));
      expect(files.sort()).toEqual(['file']);

      expect(await fs.readFile(join(output, 'static/file'), 'utf8')).toEqual(
        'file contents'
      );

      // "functions" directory has output Functions
      const functions = await fs.readdir(join(output, 'functions'));
      expect(functions.sort()).toEqual(['withTrailingSlash.func']);
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should store `detectBuilders()` error in `builds.json`', async () => {
    const cwd = fixture('error-vercel-json-validation');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(1);

      // Error gets printed to the terminal
      await expect(client.stderr).toOutput(
        'Error: Function must contain at least one property.'
      );

      // `builds.json` contains top-level "error" property
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds.builds).toBeUndefined();

      expect(builds.error.code).toEqual('invalid_function');
      expect(builds.error.message).toEqual(
        'Function must contain at least one property.'
      );

      // `config.json` contains `version`
      const configJson = await fs.readJSON(join(output, 'config.json'));
      expect(configJson.version).toBe(3);
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should store Builder error in `builds.json`', async () => {
    const cwd = fixture('node-error');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(1);

      // Error gets printed to the terminal
      await expect(client.stderr).toOutput("Duplicate identifier 'res'.");

      // `builds.json` contains "error" build
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds.builds).toHaveLength(4);

      const errorBuilds = builds.builds.filter((b: any) => 'error' in b);
      expect(errorBuilds).toHaveLength(1);

      expect(errorBuilds[0].error).toEqual({
        name: 'Error',
        message: expect.stringContaining('TS1005'),
        stack: expect.stringContaining('api/typescript.ts'),
        hideStackTrace: true,
        code: 'NODE_TYPESCRIPT_ERROR',
      });

      // top level "error" also contains the same error
      expect(builds.error).toEqual({
        name: 'Error',
        message: expect.stringContaining('TS1005'),
        stack: expect.stringContaining('api/typescript.ts'),
        hideStackTrace: true,
        code: 'NODE_TYPESCRIPT_ERROR',
      });

      // `config.json` contains `version`
      const configJson = await fs.readJSON(join(output, 'config.json'));
      expect(configJson.version).toBe(3);
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should error when "functions" has runtime that emits discontinued "nodejs12.x"', async () => {
    if (process.platform === 'win32') {
      console.log('Skipping test on Windows');
      return;
    }
    const cwd = fixture('discontinued-nodejs12.x');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(1);

      // Error gets printed to the terminal
      await expect(client.stderr).toOutput(
        'The Runtime "vercel-php@0.1.0" is using "nodejs12.x", which is discontinued. Please upgrade your Runtime to a more recent version or consult the author for more details.'
      );

      // `builds.json` contains "error" build
      const builds = await fs.readJSON(join(output, 'builds.json'));
      const errorBuilds = builds.builds.filter((b: any) => 'error' in b);
      expect(errorBuilds).toHaveLength(1);
      expect(errorBuilds[0].error).toEqual({
        name: 'Error',
        message: expect.stringContaining('Please upgrade your Runtime'),
        stack: expect.stringContaining('Please upgrade your Runtime'),
        hideStackTrace: true,
        code: 'NODEJS_DISCONTINUED_VERSION',
        link: 'https://github.com/vercel/vercel/blob/main/DEVELOPING_A_RUNTIME.md#lambdaruntime',
      });

      // top level "error" also contains the same error
      expect(builds.error).toEqual({
        name: 'Error',
        message: expect.stringContaining('Please upgrade your Runtime'),
        stack: expect.stringContaining('Please upgrade your Runtime'),
        hideStackTrace: true,
        code: 'NODEJS_DISCONTINUED_VERSION',
        link: 'https://github.com/vercel/vercel/blob/main/DEVELOPING_A_RUNTIME.md#lambdaruntime',
      });

      // `config.json` contains `version`
      const configJson = await fs.readJSON(join(output, 'config.json'));
      expect(configJson.version).toBe(3);
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  /* Skipping because this legacy builder is causing something to break with cwd
  it('should error when builder returns result without "output" such as @now/node-server', async () => {
    const cwd = join(os.tmpdir(), 'now-node-server');
    const output = join(cwd, '.vercel/output');
    try {
      // Copy to a temp directory to avoid breaking other tests
      await fs.copy(fixture('now-node-server'), cwd);
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(1);

      // Error gets printed to the terminal
      const message =
        'The build result from "@now/node-server" is missing the "output" property. Please update from "@now" to "@vercel" in your `vercel.json` file.';
      await expect(client.stderr).toOutput(message);

      const builds = await fs.readJSON(join(output, 'builds.json'));

      // top level "error" also contains the same error
      expect(builds.error).toEqual({
        name: 'Error',
        message,
        stack: expect.stringContaining(message),
      });

      // `config.json` contains `version`
      const configJson = await fs.readJSON(join(output, 'config.json'));
      expect(configJson.version).toBe(3);
    } finally {
      await fs.remove(cwd);
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });
  */

  it('should allow for missing "build" script', async () => {
    const cwd = fixture('static-with-pkg');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // `builds.json` says that "@vercel/static" was run
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds).toMatchObject({
        target: 'preview',
        builds: [
          {
            require: '@vercel/static',
            apiVersion: 2,
            src: '**',
            use: '@vercel/static',
          },
        ],
      });

      // "static" directory contains static files
      const files = await fs.readdir(join(output, 'static'));
      expect(files.sort()).toEqual(['index.html', 'package.json']);
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should set `VERCEL_ANALYTICS_ID` environment variable', async () => {
    const cwd = fixture('vercel-analytics');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const env = await fs.readJSON(join(output, 'static', 'env.json'));
      expect(Object.keys(env).includes('VERCEL_ANALYTICS_ID')).toEqual(true);
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should load environment variables from `.vercel/.env.preview.local`', async () => {
    const cwd = fixture('env-from-vc-pull');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const env = await fs.readJSON(join(output, 'static', 'env.json'));
      expect(env['ENV_FILE']).toEqual('preview');
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should load environment variables from `.vercel/.env.production.local`', async () => {
    const cwd = fixture('env-from-vc-pull');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      client.setArgv('build', '--prod');
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const env = await fs.readJSON(join(output, 'static', 'env.json'));
      expect(env['ENV_FILE']).toEqual('production');
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should NOT load environment variables from `.env`', async () => {
    const cwd = fixture('env-root-level');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const env = await fs.readJSON(join(output, 'static', 'env.json'));
      // The `.env` in this fixture has `ENV_FILE=root"`,
      // so if that's not defined then we're good
      expect(env['ENV_FILE']).toBeUndefined();
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should apply function configuration from "vercel.json" to Serverless Functions', async () => {
    const cwd = fixture('lambda-with-128-memory');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // "functions/api" directory has output Functions
      const functions = await fs.readdir(join(output, 'functions/api'));
      expect(functions.sort()).toEqual(['memory.func']);

      const vcConfig = await fs.readJSON(
        join(output, 'functions/api/memory.func/.vc-config.json')
      );
      expect(vcConfig).toMatchObject({
        handler: 'api/memory.js',
        memory: 128,
        environment: {},
        launcherType: 'Nodejs',
        shouldAddHelpers: true,
        shouldAddSourcemapSupport: false,
        awsLambdaHandler: '',
      });
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should apply project settings overrides from "vercel.json"', async () => {
    if (process.platform === 'win32') {
      // this test runs a build command with `mkdir -p` which is unsupported on Windows
      console.log('Skipping test on Windows');
      return;
    }

    const cwd = fixture('project-settings-override');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // The `buildCommand` override in "vercel.json" outputs "3" to the
      // index.txt file, so verify that that was produced in the build output
      const contents = await fs.readFile(
        join(output, 'static/index.txt'),
        'utf8'
      );
      expect(contents.trim()).toEqual('3');
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should set VERCEL_PROJECT_SETTINGS_ environment variables', async () => {
    const cwd = fixture('project-settings-env-vars');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const contents = await fs.readJSON(join(output, 'static/env.json'));
      expect(contents).toMatchObject({
        VERCEL_PROJECT_SETTINGS_BUILD_COMMAND: `node build.cjs`,
        VERCEL_PROJECT_SETTINGS_INSTALL_COMMAND: '',
        VERCEL_PROJECT_SETTINGS_OUTPUT_DIRECTORY: 'out',
        VERCEL_PROJECT_SETTINGS_NODE_VERSION: '18.x',
      });
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should apply "images" configuration from `vercel.json`', async () => {
    const cwd = fixture('images');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // `config.json` includes "images" from `vercel.json`
      const configJson = await fs.readJSON(join(output, 'config.json'));
      expect(configJson).toMatchObject({
        images: {
          sizes: [256, 384, 600, 1000],
          domains: [],
          minimumCacheTTL: 60,
          formats: ['image/avif', 'image/webp'],
        },
      });
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should fail with invalid "rewrites" configuration from `vercel.json`', async () => {
    const cwd = fixture('invalid-rewrites');
    const output = join(cwd, '.vercel/output');
    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(
        'Error: Invalid vercel.json - `rewrites[2]` should NOT have additional property `src`. Did you mean `source`?' +
          '\n' +
          'View Documentation: https://vercel.com/docs/concepts/projects/project-configuration#rewrites'
      );
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds.builds).toBeUndefined();
      expect(builds.error).toEqual({
        name: 'Error',
        message:
          'Invalid vercel.json - `rewrites[2]` should NOT have additional property `src`. Did you mean `source`?',
        stack: expect.stringContaining('at validateConfig'),
        hideStackTrace: true,
        code: 'INVALID_VERCEL_CONFIG',
        link: 'https://vercel.com/docs/concepts/projects/project-configuration#rewrites',
        action: 'View Documentation',
      });
      const configJson = await fs.readJSON(join(output, 'config.json'));
      expect(configJson.version).toBe(3);
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should include crons property in build output', async () => {
    const cwd = fixture('with-cron');
    const output = join(cwd, '.vercel', 'output');

    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toBe(0);

      const config = await fs.readJSON(join(output, 'config.json'));
      expect(config).toHaveProperty('crons', [
        {
          path: '/api/cron-job',
          schedule: '0 0 * * *',
        },
      ]);
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  it('should merge crons property from build output with vercel.json crons property', async () => {
    const cwd = fixture('with-cron-merge');
    const output = join(cwd, '.vercel', 'output');

    try {
      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toBe(0);

      const config = await fs.readJSON(join(output, 'config.json'));
      expect(config).toHaveProperty('crons', [
        {
          path: '/api/cron-job',
          schedule: '0 0 * * *',
        },
        {
          path: '/api/cron-job-build-output',
          schedule: '0 0 * * *',
        },
      ]);
    } finally {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    }
  });

  describe('should find packages with different main/module/browser keys', function () {
    let output: string;

    beforeAll(async function () {
      const cwd = fixture('import-from-main-keys');
      output = join(cwd, '.vercel/output');

      process.chdir(cwd);
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const functions = await fs.readdir(join(output, 'functions/api'));
      const sortedFunctions = functions.sort();
      expect(sortedFunctions).toEqual([
        'prefer-browser.func',
        'prefer-main.func',
        'prefer-module.func',
        'use-browser.func',
        'use-classic.func',
        'use-main.func',
        'use-module.func',
      ]);
    });

    afterAll(function () {
      process.chdir(originalCwd);
      delete process.env.__VERCEL_BUILD_RUNNING;
    });

    it('use-classic', async function () {
      const packageDir = join(
        output,
        'functions/api',
        'use-classic.func',
        'packages',
        'only-classic'
      );
      const packageDistFiles = await fs.readdir(packageDir);
      expect(packageDistFiles).toContain('index.js');
    });

    it('use-main', async function () {
      const packageDir = join(
        output,
        'functions/api',
        'use-main.func',
        'packages',
        'only-main'
      );
      const packageDistFiles = await fs.readdir(packageDir);
      expect(packageDistFiles).toContain('dist-main.js');
    });

    it('use-module', async function () {
      const packageDir = join(
        output,
        'functions/api',
        'use-module.func',
        'packages',
        'only-module'
      );
      const packageDistFiles = await fs.readdir(packageDir);
      expect(packageDistFiles).toContain('dist-module.js');
    });

    it('use-browser', async function () {
      const packageDir = join(
        output,
        'functions/api',
        'use-browser.func',
        'packages',
        'only-browser'
      );
      const packageDistFiles = await fs.readdir(packageDir);
      expect(packageDistFiles).toContain('dist-browser.js');
    });

    it('prefer-browser', async function () {
      const packageDir = join(
        output,
        'functions/api',
        'prefer-browser.func',
        'packages',
        'prefer-browser'
      );
      const packageDistFiles = await fs.readdir(packageDir);
      expect(packageDistFiles).toContain('dist-browser.js');
    });

    it('prefer-main', async function () {
      const packageDir = join(
        output,
        'functions/api',
        'prefer-main.func',
        'packages',
        'prefer-main'
      );
      const packageDistFiles = await fs.readdir(packageDir);
      expect(packageDistFiles).toContain('dist-main.js');
    });

    it('prefer-module', async function () {
      const packageDir = join(
        output,
        'functions/api',
        'prefer-module.func',
        'packages',
        'prefer-module'
      );
      const packageDistFiles = await fs.readdir(packageDir);
      expect(packageDistFiles).toContain('dist-module.js');
    });
  });

  /**
   * TODO (@Ethan-Arrowood) - After shipping support for turbo and nx, revisit rush support
   * Previously, rush tests were too flaky and consistently would timeout beyone the excessive
   * timeout window granted for these tests. Maybe we are doing something wrong.
   */
  describe('monorepo-detection', () => {
    beforeAll(() => {
      process.env.VERCEL_BUILD_MONOREPO_SUPPORT = '1';
    });

    afterAll(() => {
      delete process.env.VERCEL_BUILD_MONOREPO_SUPPORT;
    });

    const setupMonorepoDetectionFixture = (fixture: string) => {
      const cwd = setupFixture(`commands/build/monorepo-detection/${fixture}`);
      process.chdir(cwd);
      return cwd;
    };

    describe.each([
      'nx',
      'nx-package-config',
      'nx-project-and-package-config-1',
      'nx-project-and-package-config-2',
      'nx-project-config',
      // 'rush',
      'turbo',
      'turbo-package-config',
    ])('fixture: %s', fixture => {
      const monorepoManagerMap: Record<string, Record<string, string>> = {
        turbo: {
          name: 'Turbo',
          buildCommand: 'cd ../.. && npx turbo run build --filter=app-1...',
          installCommand: 'yarn install',
          ignoreCommand: 'npx turbo-ignore',
        },
        nx: {
          name: 'Nx',
          buildCommand: 'cd ../.. && npx nx build app-1',
          installCommand: 'yarn install',
        },
        // rush: {
        //   name: 'Rush',
        //   buildCommand:
        //     'node ../../common/scripts/install-run-rush.js build --to app-1',
        //   installCommand:
        //     'node ../../common/scripts/install-run-rush.js install',
        // },
      };

      const { name, ...commands } = monorepoManagerMap[fixture.split('-')[0]];

      test(
        'should detect and use correct defaults',
        async () => {
          try {
            const cwd = setupMonorepoDetectionFixture(fixture);

            // if (fixture === 'rush') {
            //   await execa('npx', ['@microsoft/rush', 'update'], {
            //     cwd,
            //     reject: false,
            //   });
            // }

            const exitCode = await build(client);
            expect(exitCode).toBe(0);
            await expect(client.stderr).toOutput(
              `Automatically detected ${name} monorepo manager. Attempting to assign default settings.`
            );
            const result = await fs.readFile(
              join(cwd, '.vercel/output/static/index.txt'),
              'utf8'
            );
            expect(result).toMatch(/Hello, world/);
          } finally {
            process.chdir(originalCwd);
            delete process.env.__VERCEL_BUILD_RUNNING;
          }
        },
        ms('5 minutes')
      );

      test(
        'should not override preconfigured project settings',
        async () => {
          try {
            const cwd = setupMonorepoDetectionFixture(fixture);

            // if (fixture === 'rush') {
            //   await execa('npx', ['@microsoft/rush', 'update'], {
            //     cwd,
            //     reject: false,
            //   });
            // }

            const projectJSONPath = join(cwd, '.vercel/project.json');
            const projectJSON = JSON.parse(
              await fs.readFile(projectJSONPath, 'utf-8')
            );

            const projectJSONCommands = {
              ...commands,
            };

            if (projectJSONCommands.ignoreCommand) {
              projectJSONCommands.commandForIgnoringBuildStep =
                projectJSONCommands.ignoreCommand;
              delete projectJSONCommands.ignoreCommand;
            }

            await fs.writeFile(
              projectJSONPath,
              JSON.stringify({
                ...projectJSON,
                settings: {
                  ...projectJSON.settings,
                  ...projectJSONCommands,
                },
              })
            );

            const exitCode = await build(client);
            expect(exitCode).toBe(0);
            await expect(client.stderr).toOutput(
              'Cannot automatically assign buildCommand as it is already set via project settings or configuration overrides.'
            );
            await expect(client.stderr).toOutput(
              'Cannot automatically assign installCommand as it is already set via project settings or configuration overrides.'
            );
            if (name === 'Turbo') {
              await expect(client.stderr).toOutput(
                'Cannot automatically assign commandForIgnoringBuildStep as it is already set via project settings or configuration overrides.'
              );
            }
          } finally {
            process.chdir(originalCwd);
            delete process.env.__VERCEL_BUILD_RUNNING;
          }
        },
        ms('5 minutes')
      );

      test(
        'should not override configuration overrides',
        async () => {
          try {
            const cwd = setupMonorepoDetectionFixture(fixture);

            // if (fixture === 'rush') {
            //   await execa('npx', ['@microsoft/rush', 'update'], {
            //     cwd,
            //     reject: false,
            //   });
            // }

            await fs.writeFile(
              join(cwd, 'packages/app-1/vercel.json'),
              JSON.stringify({
                ...commands,
              })
            );

            const exitCode = await build(client);
            expect(exitCode).toBe(0);
            await expect(client.stderr).toOutput(
              'Cannot automatically assign buildCommand as it is already set via project settings or configuration overrides.'
            );
            await expect(client.stderr).toOutput(
              'Cannot automatically assign installCommand as it is already set via project settings or configuration overrides.'
            );
            if (name === 'Turbo') {
              await expect(client.stderr).toOutput(
                'Cannot automatically assign commandForIgnoringBuildStep as it is already set via project settings or configuration overrides.'
              );
            }
          } finally {
            process.chdir(originalCwd);
            delete process.env.__VERCEL_BUILD_RUNNING;
          }
        },
        ms('5 minutes')
      );

      test(
        `skip when rootDirectory is null or '.'`,
        async () => {
          try {
            const cwd = setupMonorepoDetectionFixture(fixture);

            const projectJSONPath = join(cwd, '.vercel/project.json');
            const projectJSON = JSON.parse(
              await fs.readFile(projectJSONPath, 'utf-8')
            );

            await fs.writeFile(
              projectJSONPath,
              JSON.stringify({
                ...projectJSON,
                settings: {
                  rootDirectory: null,
                  outputDirectory: null,
                },
              })
            );

            const packageJSONPath = join(cwd, 'package.json');
            const packageJSON = JSON.parse(
              await fs.readFile(packageJSONPath, 'utf-8')
            );

            await fs.writeFile(
              packageJSONPath,
              JSON.stringify({
                ...packageJSON,
                scripts: {
                  ...packageJSON.scripts,
                  build: `node build.js`,
                },
              })
            );

            const exitCode = await build(client);
            expect(exitCode).toBe(0);
            const result = await fs.readFile(
              join(cwd, '.vercel/output/static/index.txt'),
              'utf8'
            );
            expect(result).toMatch(/Hello, from build\.js/);
          } finally {
            process.chdir(originalCwd);
            delete process.env.__VERCEL_BUILD_RUNNING;
          }
        },
        ms('5 miuntes')
      );

      test(
        `skip when vercel-build is defined`,
        async () => {
          try {
            const cwd = setupMonorepoDetectionFixture(fixture);

            const packageJSONPath = join(cwd, 'packages/app-1/package.json');
            const packageJSON = JSON.parse(
              await fs.readFile(packageJSONPath, 'utf-8')
            );

            await fs.writeFile(
              packageJSONPath,
              JSON.stringify({
                ...packageJSON,
                scripts: {
                  ...packageJSON.scripts,
                  'vercel-build': `node ../../build.js`,
                },
              })
            );

            const exitCode = await build(client);
            expect(exitCode).toBe(0);
            const result = await fs.readFile(
              join(cwd, '.vercel/output/static/index.txt'),
              'utf8'
            );
            expect(result).toMatch(/Hello, from build\.js/);
          } finally {
            process.chdir(originalCwd);
            delete process.env.__VERCEL_BUILD_RUNNING;
          }
        },
        ms('5 miuntes')
      );

      test(
        `skip when VERCEL_BUILD_MONOREPO_SUPPORT is disabled`,
        async () => {
          try {
            process.env.VERCEL_BUILD_MONOREPO_SUPPORT = '0';
            const cwd = setupMonorepoDetectionFixture(fixture);

            const packageJSONPath = join(cwd, 'packages/app-1/package.json');
            const packageJSON = JSON.parse(
              await fs.readFile(packageJSONPath, 'utf-8')
            );

            await fs.writeFile(
              packageJSONPath,
              JSON.stringify({
                ...packageJSON,
                scripts: {
                  ...packageJSON.scripts,
                  build: `node ../../build.js`,
                },
              })
            );

            const exitCode = await build(client);
            expect(exitCode).toBe(0);
            const result = await fs.readFile(
              join(cwd, '.vercel/output/static/index.txt'),
              'utf8'
            );
            expect(result).toMatch(/Hello, from build\.js/);
          } finally {
            process.chdir(originalCwd);
            delete process.env.__VERCEL_BUILD_RUNNING;
            process.env.VERCEL_BUILD_MONOREPO_SUPPORT = '1';
          }
        },
        ms('5 miuntes')
      );
    });

    describe.each([
      [
        'nx',
        'nx.json',
        'targetDefaults.build',
        [
          'Missing required `build` target in either nx.json, project.json, or package.json Nx configuration. Skipping automatic setting assignment.',
        ],
      ],
      [
        'nx-project-config',
        'packages/app-1/project.json',
        'targets.build',
        [
          'Missing required `build` target in either nx.json, project.json, or package.json Nx configuration. Skipping automatic setting assignment.',
        ],
      ],
      [
        'nx-package-config',
        'packages/app-1/package.json',
        'nx.targets.build',
        [
          'Missing required `build` target in either nx.json, project.json, or package.json Nx configuration. Skipping automatic setting assignment.',
        ],
      ],
      [
        'turbo',
        'turbo.json',
        'pipeline.build',
        [
          'Missing required `build` pipeline in turbo.json or package.json Turbo configuration. Skipping automatic setting assignment.',
        ],
      ],
      [
        'turbo-package-config',
        'package.json',
        'turbo.pipeline.build',
        [
          'Missing required `build` pipeline in turbo.json or package.json Turbo configuration. Skipping automatic setting assignment.',
        ],
      ],
    ])('fixture: %s', (fixture, configFile, propertyAccessor, expectedLogs) => {
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

      test(
        'should warn and not configure settings when project does not satisfy requirements',
        async () => {
          try {
            const cwd = setupMonorepoDetectionFixture(fixture);

            const configPath = join(cwd, configFile);
            const config = JSON5.parse(await fs.readFile(configPath, 'utf-8'));

            deleteSubProperty(config, propertyAccessor);
            await fs.writeFile(configPath, JSON.stringify(config));

            const exitCode = await build(client);

            expect(exitCode).toBe(1);
            for (const log of expectedLogs) {
              await expect(client.stderr).toOutput(log);
            }
          } finally {
            process.chdir(originalCwd);
            delete process.env.__VERCEL_BUILD_RUNNING;
          }
        },
        ms('3 minutes')
      );
    });
  });
});
