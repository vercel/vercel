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
      expect(await build(client)).toEqual(0);

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
      expect(await build(client)).toEqual(0);

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
});
