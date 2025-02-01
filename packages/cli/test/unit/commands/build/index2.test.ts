// split into part 1 and 2

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { join } from 'path';
import build from '../../../../src/commands/build';
import { client } from '../../../mocks/client';
import { defaultProject, useProject } from '../../../mocks/project';
import { useTeams } from '../../../mocks/team';
import { useUser } from '../../../mocks/user';
import { execSync } from 'child_process';
import { vi } from 'vitest';

vi.setConfig({ testTimeout: 6 * 60 * 1000 });

const fixture = (name: string) =>
  join(__dirname, '../../../fixtures/unit/commands/build', name);

describe('build', () => {
  beforeEach(() => {
    delete process.env.__VERCEL_BUILD_RUNNING;
  });

  it('should store Builder error in `builds.json`', async () => {
    const cwd = fixture('node-error');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
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
  });

  it('should error when "functions" has runtime that emits discontinued "nodejs12.x"', async () => {
    if (process.platform === 'win32') {
      // eslint-disable-next-line no-console
      console.log('Skipping test on Windows');
      return;
    }
    const cwd = fixture('discontinued-nodejs12.x');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
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
  });

  it('should allow for missing "build" script', async () => {
    const cwd = fixture('static-with-pkg');
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
    expect(files.sort()).toEqual(['index.html', 'package.json']);
  });

  it('should set `VERCEL_ANALYTICS_ID` environment variable if Vercel Speed Insights is enabled', async () => {
    const cwd = fixture('vercel-analytics-id');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toEqual(0);

    const env = await fs.readJSON(join(output, 'static', 'env.json'));
    expect(Object.keys(env).includes('VERCEL_ANALYTICS_ID')).toEqual(true);
  });

  it('should load environment variables from `.vercel/.env.preview.local`', async () => {
    const cwd = fixture('env-from-vc-pull');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toEqual(0);

    const env = await fs.readJSON(join(output, 'static', 'env.json'));
    expect(env['ENV_FILE']).toEqual('preview');
  });

  it('should load environment variables from `.vercel/.env.production.local`', async () => {
    const cwd = fixture('env-from-vc-pull');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
    client.setArgv('build', '--prod');
    const exitCode = await build(client);
    expect(exitCode).toEqual(0);

    const env = await fs.readJSON(join(output, 'static', 'env.json'));
    expect(env['ENV_FILE']).toEqual('production');
  });

  it('should NOT load environment variables from `.env`', async () => {
    const cwd = fixture('env-root-level');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toEqual(0);

    const env = await fs.readJSON(join(output, 'static', 'env.json'));
    // The `.env` in this fixture has `ENV_FILE=root"`,
    // so if that's not defined then we're good
    expect(env['ENV_FILE']).toBeUndefined();
  });

  it('should apply function configuration from "vercel.json" to Serverless Functions', async () => {
    const cwd = fixture('lambda-with-128-memory');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
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
  });

  it('should apply project settings overrides from "vercel.json"', async () => {
    if (process.platform === 'win32') {
      // this test runs a build command with `mkdir -p` which is unsupported on Windows
      // eslint-disable-next-line no-console
      console.log('Skipping test on Windows');
      return;
    }

    const cwd = fixture('project-settings-override');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toEqual(0);

    // The `buildCommand` override in "vercel.json" outputs "3" to the
    // index.txt file, so verify that that was produced in the build output
    const contents = await fs.readFile(
      join(output, 'static/index.txt'),
      'utf8'
    );
    expect(contents.trim()).toEqual('3');
  });

  it('should set VERCEL_PROJECT_SETTINGS_ environment variables', async () => {
    const cwd = fixture('project-settings-env-vars');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toEqual(0);

    const contents = await fs.readJSON(join(output, 'static/env.json'));
    expect(contents).toMatchObject({
      VERCEL_PROJECT_SETTINGS_BUILD_COMMAND: `node build.cjs`,
      VERCEL_PROJECT_SETTINGS_INSTALL_COMMAND: '',
      VERCEL_PROJECT_SETTINGS_OUTPUT_DIRECTORY: 'out',
      VERCEL_PROJECT_SETTINGS_NODE_VERSION: '18.x',
    });
  });

  it('should apply "images" configuration from `vercel.json`', async () => {
    const cwd = fixture('images');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toEqual(0);

    // `config.json` includes "images" from `vercel.json`
    const configJson = await fs.readJSON(join(output, 'config.json'));
    expect(configJson).toMatchObject({
      images: {
        sizes: [256, 384, 600, 1000],
        qualities: [25, 50, 75],
        domains: [],
        minimumCacheTTL: 60,
        localPatterns: [{ search: '' }],
        formats: ['image/avif', 'image/webp'],
        contentDispositionType: 'attachment',
      },
    });
  });

  it('should fail with invalid "rewrites" configuration from `vercel.json`', async () => {
    const cwd = fixture('invalid-rewrites');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
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
      stack: expect.stringContaining('at Module.validateConfig'),
      hideStackTrace: true,
      code: 'INVALID_VERCEL_CONFIG',
      link: 'https://vercel.com/docs/concepts/projects/project-configuration#rewrites',
      action: 'View Documentation',
    });
    const configJson = await fs.readJSON(join(output, 'config.json'));
    expect(configJson.version).toBe(3);
  });

  it('should include crons property in build output', async () => {
    const cwd = fixture('with-cron');
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config).toHaveProperty('crons', [
      {
        path: '/api/cron-job',
        schedule: '0 0 * * *',
      },
    ]);
  });

  it('should merge crons property from build output with vercel.json crons property', async () => {
    const cwd = fixture('with-cron-merge');
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;
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
  });

  describe('should find packages with different main/module/browser keys', function () {
    let output: string;

    beforeAll(async function () {
      delete process.env.__VERCEL_BUILD_RUNNING;

      const cwd = fixture('import-from-main-keys');
      output = join(cwd, '.vercel/output');

      client.cwd = cwd;
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

  it('should use --local-config over default vercel.json', async () => {
    const cwd = fixture('local-config');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
    let exitCode = await build(client);
    delete process.env.__VERCEL_BUILD_RUNNING;
    expect(exitCode).toEqual(0);

    let config = await fs.readJSON(join(output, 'config.json'));
    expect(config.routes).toContainEqual({
      src: '^/another-main$',
      dest: '/main.html',
    });
    expect(config.routes).not.toContainEqual({
      src: '^/another-test$',
      dest: '/test.html',
    });

    client.localConfigPath = 'vercel-test.json';
    exitCode = await build(client);
    expect(exitCode).toEqual(0);

    config = await fs.readJSON(join(output, 'config.json'));
    expect(config.routes).not.toContainEqual({
      src: '^/another-main$',
      dest: '/main.html',
    });
    expect(config.routes).toContainEqual({
      src: '^/another-test$',
      dest: '/test.html',
    });
  });

  it('should build Storybook project and ignore middleware', async () => {
    const cwd = fixture('storybook-with-middleware');
    const output = join(cwd, '.vercel/output');
    try {
      client.cwd = cwd;
      process.env.STORYBOOK_DISABLE_TELEMETRY = '1';
      execSync('npm install');

      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // `builds.json` says that "@vercel/static" was run
      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds).toMatchObject({
        target: 'preview',
        builds: [
          {
            require: '@vercel/static-build',
            apiVersion: 2,
            src: 'package.json',
            use: '@vercel/static-build',
          },
        ],
      });

      const files = await fs.readdir(output);
      // we should NOT see `functions` because that means `middleware.ts` was processed
      expect(files.sort()).toEqual(['builds.json', 'config.json', 'static']);
    } finally {
      delete process.env.STORYBOOK_DISABLE_TELEMETRY;
    }
  });

  it('should error if .npmrc exists containing use-node-version', async () => {
    const cwd = fixture('npmrc-use-node-version');
    client.cwd = cwd;
    client.setArgv('build');
    const exitCodePromise = build(client);
    await expect(client.stderr).toOutput('Error: Detected unsupported');
    const exitCode = await exitCodePromise;
    expect(exitCode, 'exit code for "build"').toEqual(1);
  });

  it('should ignore `.env` for static site', async () => {
    const cwd = fixture('static-env');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toEqual(0);

    expect(fs.existsSync(join(output, 'static', 'index.html'))).toBe(true);
    expect(fs.existsSync(join(output, 'static', '.env'))).toBe(false);
  });

  it('should build with `repo.json` link', async () => {
    const cwd = fixture('../../monorepo-link');

    useUser();
    useTeams('team_dummy');

    // "blog" app
    useProject({
      ...defaultProject,
      id: 'QmScb7GPQt6gsS',
      name: 'monorepo-blog',
      rootDirectory: 'blog',
      outputDirectory: 'dist',
      framework: null,
    });
    let output = join(cwd, 'blog/.vercel/output');
    client.cwd = join(cwd, 'blog');
    client.setArgv('build', '--yes');
    let exitCode = await build(client);
    expect(exitCode).toEqual(0);
    delete process.env.__VERCEL_BUILD_RUNNING;

    let files = await fs.readdir(join(output, 'static'));
    expect(files.sort()).toEqual(['index.txt']);
    expect(
      (await fs.readFile(join(output, 'static/index.txt'), 'utf8')).trim()
    ).toEqual('blog');

    // "dashboard" app
    useProject({
      ...defaultProject,
      id: 'QmbKpqpiUqbcke',
      name: 'monorepo-dashboard',
      rootDirectory: 'dashboard',
      outputDirectory: 'dist',
      framework: null,
    });
    output = join(cwd, 'dashboard/.vercel/output');
    client.cwd = join(cwd, 'dashboard');
    client.setArgv('build', '--yes');
    exitCode = await build(client);
    expect(exitCode).toEqual(0);
    delete process.env.__VERCEL_BUILD_RUNNING;

    files = await fs.readdir(join(output, 'static'));
    expect(files.sort()).toEqual(['index.txt']);
    expect(
      (await fs.readFile(join(output, 'static/index.txt'), 'utf8')).trim()
    ).toEqual('dashboard');

    // "marketing" app
    useProject({
      ...defaultProject,
      id: 'QmX6P93ChNDoZP',
      name: 'monorepo-marketing',
      rootDirectory: 'marketing',
      outputDirectory: 'dist',
      framework: null,
    });
    output = join(cwd, 'marketing/.vercel/output');
    client.cwd = join(cwd, 'marketing');
    client.setArgv('build', '--yes');
    exitCode = await build(client);
    expect(exitCode).toEqual(0);
    delete process.env.__VERCEL_BUILD_RUNNING;

    files = await fs.readdir(join(output, 'static'));
    expect(files.sort()).toEqual(['index.txt']);
    expect(
      (await fs.readFile(join(output, 'static/index.txt'), 'utf8')).trim()
    ).toEqual('marketing');
  });

  it('should write to flags.json', async () => {
    const cwd = fixture('with-flags');
    const output = join(cwd, '.vercel', 'output');

    client.cwd = cwd;
    client.setArgv('build', '--yes');

    const exitCode = await build(client);
    expect(exitCode).toEqual(0);

    expect(fs.existsSync(join(output, 'flags.json'))).toBe(true);
    expect(fs.readJSONSync(join(output, 'flags.json'))).toEqual({
      definitions: {
        'my-next-flag': {
          options: [{ value: true }, { value: false }],
        },
      },
    });
  });

  it('should not apply framework `defaultRoutes` when build command outputs Build Output API', async () => {
    const cwd = fixture('build-output-api-with-api-dir');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toEqual(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config).toMatchInlineSnapshot(`
      {
        "crons": [],
        "routes": [
          {
            "handle": "filesystem",
          },
          {
            "src": "^/api(/.*)?$",
            "status": 404,
          },
          {
            "handle": "error",
          },
          {
            "dest": "/404.html",
            "src": "^(?!/api).*$",
            "status": 404,
          },
          {
            "handle": "miss",
          },
          {
            "check": true,
            "dest": "/api/$1",
            "src": "^/api/(.+)(?:\\.(?:js))$",
          },
        ],
        "version": 3,
      }
    `);
  });

  it('should detect framework version in monorepo app', async () => {
    const cwd = fixture('monorepo');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toEqual(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(typeof config.framework.version).toEqual('string');
  });

  it('should create symlinks for duplicate references to Lambda / EdgeFunction instances', async () => {
    if (process.platform === 'win32') {
      // eslint-disable-next-line no-console
      console.log('Skipping test on Windows');
      return;
    }
    const cwd = fixture('functions-symlink');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toEqual(0);

    // "functions" directory has output Functions
    const functions = await fs.readdir(join(output, 'functions'));
    expect(functions.sort()).toEqual([
      'edge.func',
      'edge2.func',
      'lambda.func',
      'lambda2.func',
    ]);
    expect(
      fs.lstatSync(join(output, 'functions/lambda.func')).isDirectory()
    ).toEqual(true);
    expect(
      fs.lstatSync(join(output, 'functions/edge.func')).isDirectory()
    ).toEqual(true);
    expect(
      fs.lstatSync(join(output, 'functions/lambda2.func')).isSymbolicLink()
    ).toEqual(true);
    expect(
      fs.lstatSync(join(output, 'functions/edge2.func')).isSymbolicLink()
    ).toEqual(true);
    expect(fs.readlinkSync(join(output, 'functions/lambda2.func'))).toEqual(
      'lambda.func'
    );
    expect(fs.readlinkSync(join(output, 'functions/edge2.func'))).toEqual(
      'edge.func'
    );
  });

  describe('with Vercel Speed Insights', () => {
    it('should not include VERCEL_ANALYTICS_ID if @vercel/speed-insights is present', async () => {
      const cwd = fixture('nextjs-with-speed-insights-package');
      const output = join(cwd, '.vercel/output');

      client.cwd = cwd;
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const env = await fs.readJSON(join(output, 'static', 'env.json'));
      expect(Object.keys(env).includes('VERCEL_ANALYTICS_ID')).toEqual(false);
    });

    it('should include VERCEL_ANALYTICS_ID if @vercel/speed-insights is not present', async () => {
      const cwd = fixture('nextjs-without-speed-insights-package');
      const output = join(cwd, '.vercel/output');

      client.cwd = cwd;
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const env = await fs.readJSON(join(output, 'static', 'env.json'));
      expect(Object.keys(env).includes('VERCEL_ANALYTICS_ID')).toEqual(true);
    });
  });
});
