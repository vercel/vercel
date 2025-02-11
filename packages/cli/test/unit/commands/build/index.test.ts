// split into part 1 and 2

import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { join } from 'path';
import { getWriteableDirectory } from '@vercel/build-utils';
import build from '../../../../src/commands/build';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { vi } from 'vitest';
import { REGEX_NON_VERCEL_PLATFORM_FILES } from '@vercel/fs-detectors';

vi.setConfig({ testTimeout: 6 * 60 * 1000 });

const fixture = (name: string) =>
  join(__dirname, '../../../fixtures/unit/commands/build', name);

const flakey =
  process.platform === 'win32' && process.version.startsWith('v22');

describe.skipIf(flakey)('build', () => {
  beforeEach(() => {
    delete process.env.__VERCEL_BUILD_RUNNING;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'build';

      client.setArgv(command, '--help');
      const exitCodePromise = build(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  it('should build with `@vercel/static`', async () => {
    const cwd = fixture('static');
    const output = join(cwd, '.vercel/output');

    client.cwd = cwd;
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
  });

  it('should build with `@now/static`', async () => {
    const cwd = fixture('now-static');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
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
  });

  it('should build with `@vercel/node`', async () => {
    const cwd = fixture('node');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
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
  });

  it('should handle symlinked static files', async () => {
    const cwd = fixture('static-symlink');
    const output = join(cwd, '.vercel/output');

    // try to create the symlink, if it fails (e.g. Windows), skip the test
    try {
      await fs.unlink(join(cwd, 'foo.html'));
      await fs.symlink(join(cwd, 'index.html'), join(cwd, 'foo.html'));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('Symlinks not available, skipping test');
      return;
    }

    client.cwd = cwd;
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
  });

  it('should normalize "src" path in `vercel.json`', async () => {
    const cwd = fixture('normalize-src');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
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
  });

  it('should build with 3rd party Builder', async () => {
    const cwd = fixture('third-party-builder');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
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
          src: REGEX_NON_VERCEL_PLATFORM_FILES,
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
  });

  it('should serialize `EdgeFunction` output in version 3 Builder', async () => {
    const cwd = fixture('edge-function');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
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
          src: REGEX_NON_VERCEL_PLATFORM_FILES,
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
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:prod', value: 'TRUE' },
    ]);
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
      client.cwd = cwd;
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
    }
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:yes', value: 'TRUE' },
    ]);
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
      client.cwd = cwd;
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
    }
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'flag:prod', value: 'TRUE' },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });

  it('should pull "production" env vars with `--target production`', async () => {
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
      client.cwd = cwd;
      client.setArgv('build', '--yes', '--target', 'production');
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
    }
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'option:target', value: 'production' },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });

  it('should build root-level `middleware.js` and exclude from static files', async () => {
    const cwd = fixture('middleware');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
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
          src: REGEX_NON_VERCEL_PLATFORM_FILES,
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
          middlewareRawSrc: [],
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
  });

  it('should build root-level `middleware.js` with "Root Directory" setting', async () => {
    const cwd = fixture('middleware-root-directory');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
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
          src: REGEX_NON_VERCEL_PLATFORM_FILES,
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
          middlewareRawSrc: [],
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
  });

  it('should build root-level `middleware.js` with "matcher" config', async () => {
    const cwd = fixture('middleware-with-matcher');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
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
          src: REGEX_NON_VERCEL_PLATFORM_FILES,
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
          middlewareRawSrc: ['/about/:path*', '/dashboard/:path*'],
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
  });

  it('should support `--output` parameter', async () => {
    const cwd = fixture('static');
    const output = await getWriteableDirectory();
    try {
      client.cwd = cwd;
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
    }
  });

  // This test is for `vercel-sapper` which doesn't export `version` property,
  // but returns a structure that's compatible with `version: 2`
  it("should support Builder that doesn't export `version`", async () => {
    const cwd = fixture('versionless-builder');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
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
  });

  it('should store `detectBuilders()` error in `builds.json`', async () => {
    const cwd = fixture('error-vercel-json-validation');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
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
  });
});
