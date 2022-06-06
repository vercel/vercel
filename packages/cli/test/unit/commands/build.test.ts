import ms from 'ms';
import fs from 'fs-extra';
import { join } from 'path';
import { client } from '../../mocks/client';
import build from '../../../src/commands/build';

jest.setTimeout(ms('1 minute'));

const fixture = (name: string) =>
  join(__dirname, '../../fixtures/unit/commands/build', name);

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

  it('should build with 3rd party Builder', async () => {
    const cwd = fixture('third-party-builder');
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
            src: '!{api/**,package.json}',
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

      // `builds.json` says that "@vercel/node" was run
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
            src: '!{api/**,package.json}',
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
      console.log(vcConfig);
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
});
