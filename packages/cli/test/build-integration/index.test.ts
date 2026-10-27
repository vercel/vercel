import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import { basename, join } from 'path';
import {
  type AfterCacheBypassRule,
  getWriteableDirectory,
  sanitizeConsumerName,
  FileBlob,
  type BuilderV2,
  type BuildResultV2,
} from '@vercel/build-utils';
import build from '../../src/commands/build';
import cliPkg from '../../src/util/pkg';
import { client } from '../mocks/client';
import {
  defaultProject,
  useProject,
  useUnknownProject,
} from '../mocks/project';
import { useTeams } from '../mocks/team';
import { useUser } from '../mocks/user';
import { execSync } from 'child_process';
import { setupUnitFixture } from '../helpers/setup-unit-fixture';
import { vi } from 'vitest';
import * as linkModule from '../../src/util/projects/link';
import * as importBuildersModule from '../../src/builders/import-builders';
import * as staticBuilder from '../../src/builders/static-builder';
import * as staticBuildBuilder from '@vercel/static-build';
import * as builderProcessModule from '../../src/util/build/builder-process';
import {
  detectBuilders,
  REGEX_NON_VERCEL_PLATFORM_FILES,
} from '@vercel/fs-detectors';

vi.setConfig({ testTimeout: 6 * 60 * 1000 });

const fixture = (name: string) =>
  join(__dirname, '../fixtures/unit/commands/build', name);

const daemonImage = `vcr.vercel.com/team/project/daemon.heartbeat@sha256:${'a'.repeat(64)}`;

async function fakeDaemonBuild(
  options: Parameters<BuilderV2['build']>[0]
): Promise<BuildResultV2> {
  const daemon = options.config.daemon;
  return daemon
    ? {
        output: {},
        daemons: {
          [daemon.name]: {
            runtime: 'container',
            image: daemonImage,
            instances: daemon.instances!,
          },
        },
      }
    : { output: { 'index.html': new FileBlob({ data: 'web' }) } };
}

/** Asserts the output describes `fakeDaemonBuild`'s heartbeat daemon. */
async function expectHeartbeatDaemonOutput(output: string) {
  expect(await fs.readJSON(join(output, 'config.json'))).toMatchObject({
    version: 3,
    daemons: { heartbeat: {} },
  });
  expect(
    await fs.readJSON(join(output, 'daemons/heartbeat/.vc-config.json'))
  ).toEqual({
    runtime: 'container',
    image: daemonImage,
    instances: { sfo1: 1 },
  });
}

/** Use real static builders to check which files a deployment would publish. */
async function buildWithFakeBuilders(
  cwd: string,
  fakeBuild: BuilderV2['build']
): Promise<number> {
  const builder: BuilderV2 = { version: 2, build: fakeBuild };
  const importer = vi
    .spyOn(importBuildersModule, 'importBuilders')
    .mockImplementation(
      async specs =>
        new Map(
          [...specs].map(name => [
            name,
            {
              path: `/virtual/${name}/index.js`,
              pkgPath: `/virtual/${name}/package.json`,
              pkg: { name, version: '1.0.0' },
              dynamicallyInstalled: false,
              builder:
                name === '@vercel/static'
                  ? staticBuilder
                  : name === '@vercel/static-build'
                    ? staticBuildBuilder
                    : builder,
            },
          ])
        )
    );
  const subprocess = vi
    .spyOn(builderProcessModule, 'canBuildInSubprocess')
    .mockReturnValue(false);
  vi.stubEnv('VERCEL_ENABLE_DAEMONS_BOA', '1');
  try {
    client.cwd = cwd;
    return await build(client);
  } finally {
    importer.mockRestore();
    subprocess.mockRestore();
    vi.unstubAllEnvs();
  }
}

const flakey =
  process.platform === 'win32' &&
  ['v22', 'v24'].some(version => process.version.startsWith(version));

async function createTempServicesProject(params: {
  experimentalServices: Record<string, unknown>;
  files: Record<string, string>;
}) {
  const cwd = await getWriteableDirectory();
  await fs.ensureDir(join(cwd, '.vercel'));
  await fs.writeJSON(join(cwd, '.vercel', 'project.json'), {
    orgId: '.',
    projectId: '.',
    settings: {
      framework: null,
      installCommand: '',
    },
  });
  await fs.writeJSON(join(cwd, 'vercel.json'), {
    experimentalServices: params.experimentalServices,
  });
  await Promise.all(
    Object.entries(params.files).map(([name, contents]) =>
      fs.writeFile(join(cwd, name), contents)
    )
  );
  return cwd;
}

describe.skipIf(flakey)('build', () => {
  beforeEach(() => {
    delete process.env.__VERCEL_BUILD_RUNNING;
    delete process.env.VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION;
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'build';

      client.setArgv(command, '--help');
      const exitCodePromise = build(client);
      await expect(exitCodePromise).resolves.toEqual(0);

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
    expect(builds.cliVersion).toEqual(cliPkg.version);

    // "static" directory contains static files
    const files = await fs.readdir(join(output, 'static'));
    expect(files.sort()).toEqual(['index.html']);
  });

  it.each([
    true,
    false,
  ])('records an empty daemon inventory only for flagged builds (flagged=%s)', async flagged => {
    const cwd = await getWriteableDirectory();
    await fs.outputJSON(join(cwd, '.vercel/project.json'), {
      orgId: '.',
      projectId: '.',
      settings: { framework: null, installCommand: '' },
    });
    await fs.outputFile(join(cwd, 'index.html'), 'web');
    if (flagged) vi.stubEnv('VERCEL_ENABLE_DAEMONS_BOA', '1');
    try {
      client.cwd = cwd;
      expect(await build(client)).toBe(0);
      const config = await fs.readJSON(join(cwd, '.vercel/output/config.json'));
      expect(config.daemons).toEqual(flagged ? {} : undefined);
      expect(
        await fs.pathExists(join(cwd, '.vercel/output/static/index.html'))
      ).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      await fs.remove(cwd);
    }
  });

  it('rejects daemons when the daemon flag is off', async () => {
    const cwd = setupUnitFixture('daemons');
    await fs.outputJSON(join(cwd, '.vercel/project.json'), {
      orgId: '.',
      projectId: '.',
      settings: { framework: null, installCommand: '' },
    });
    client.cwd = cwd;
    expect(await build(client)).toBe(1);
    await expect(client.stderr).toOutput(
      "Can't build daemons yet: heartbeat. Remove `daemons` from vercel.json to build this project."
    );
  });

  it('builds daemons alongside a regular app', async () => {
    const cwd = setupUnitFixture('daemons');
    await fs.outputJSON(join(cwd, '.vercel/project.json'), {
      orgId: '.',
      projectId: '.',
      settings: { framework: null, installCommand: '' },
    });
    try {
      expect(await buildWithFakeBuilders(cwd, fakeDaemonBuild)).toBe(0);
      const output = join(cwd, '.vercel/output');
      await expectHeartbeatDaemonOutput(output);
      // The daemon's sources must not be published with the app.
      expect(await fs.readdir(join(output, 'static'))).toEqual(['index.html']);
      expect(await fs.pathExists(join(output, 'services'))).toBe(false);
    } finally {
      await fs.remove(cwd);
    }
  });

  it('builds daemons alongside a zero-config server app without public/', async () => {
    const cwd = setupUnitFixture('daemons');
    await fs.outputJSON(join(cwd, '.vercel/project.json'), {
      orgId: '.',
      projectId: '.',
      settings: { framework: 'go', installCommand: '' },
    });
    await fs.outputFile(join(cwd, 'go.mod'), 'module example.com/app\n');
    await fs.outputFile(join(cwd, 'main.go'), 'package main\nfunc main() {}\n');
    try {
      expect(await buildWithFakeBuilders(cwd, fakeDaemonBuild)).toBe(0);
      const output = join(cwd, '.vercel/output');
      // Zero-config server apps always get a static build for public/.
      const { builds } = await fs.readJSON(join(output, 'builds.json'));
      expect(builds).toContainEqual(
        expect.objectContaining({ src: 'public/**/*', use: '@vercel/static' })
      );
      await expectHeartbeatDaemonOutput(output);
    } finally {
      await fs.remove(cwd);
    }
  });

  it('builds daemons alongside services', async () => {
    const cwd = setupUnitFixture('daemons');
    await fs.outputJSON(join(cwd, '.vercel/project.json'), {
      orgId: '.',
      projectId: '.',
      settings: { framework: null, installCommand: '' },
    });
    const vercelJson = await fs.readJSON(join(cwd, 'vercel.json'));
    vercelJson.services = { web: { root: 'web' } };
    await fs.outputJSON(join(cwd, 'vercel.json'), vercelJson);
    await fs.outputFile(join(cwd, 'web/index.html'), 'web');
    try {
      expect(await buildWithFakeBuilders(cwd, fakeDaemonBuild)).toBe(0);
      const output = join(cwd, '.vercel/output');
      await expectHeartbeatDaemonOutput(output);
      expect(
        await fs.pathExists(join(output, 'services/web/static/index.html'))
      ).toBe(true);
    } finally {
      await fs.remove(cwd);
    }
  });

  /** The `daemons` fixture with the heartbeat daemon at the project root. */
  async function setupRootDaemonFixture(
    services?: Record<string, unknown>
  ): Promise<string> {
    const cwd = setupUnitFixture('daemons');
    await fs.outputJSON(join(cwd, '.vercel/project.json'), {
      orgId: '.',
      projectId: '.',
      settings: { framework: null, installCommand: '' },
    });
    const vercelJson = await fs.readJSON(join(cwd, 'vercel.json'));
    vercelJson.daemons.heartbeat.root = '.';
    if (services) vercelJson.services = services;
    await fs.outputJSON(join(cwd, 'vercel.json'), vercelJson);
    for (const file of ['Dockerfile', 'heartbeat.py']) {
      await fs.move(join(cwd, 'daemon', file), join(cwd, file));
    }
    return cwd;
  }

  it('rejects publishing the same directory as a daemon root', async () => {
    const cwd = await setupRootDaemonFixture();
    try {
      expect(await buildWithFakeBuilders(cwd, fakeDaemonBuild)).toBe(1);
      await expect(client.stderr).toOutput(
        `Can't build daemon "heartbeat": The app publishes "." as static files, but that is the daemon's root directory.`
      );
    } finally {
      await fs.remove(cwd);
    }
  });

  it.each([
    '.',
    'dist',
  ])('builds a root daemon next to a service publishing %s', async outputDirectory => {
    const cwd = await setupRootDaemonFixture({
      web: { root: 'site', outputDirectory },
    });
    await fs.outputFile(
      join(cwd, 'site', outputDirectory, 'index.html'),
      'web'
    );
    try {
      expect(await buildWithFakeBuilders(cwd, fakeDaemonBuild)).toBe(0);
      const output = join(cwd, '.vercel/output');
      await expectHeartbeatDaemonOutput(output);
      expect(await fs.readdir(join(output, 'services/web/static'))).toEqual([
        'index.html',
      ]);
    } finally {
      await fs.remove(cwd);
    }
  });

  it.each([
    false,
    true,
  ])('keeps daemon sources out of builds that copy their root from disk (root daemon=%s)', async rootDaemon => {
    const cwd = rootDaemon
      ? await setupRootDaemonFixture()
      : setupUnitFixture('daemons');
    await fs.outputJSON(join(cwd, '.vercel/project.json'), {
      orgId: '.',
      projectId: '.',
      settings: { framework: null, installCommand: '', outputDirectory: '.' },
    });
    await fs.outputJSON(join(cwd, 'package.json'), {
      scripts: { build: 'node -e ""' },
    });
    try {
      const status = await buildWithFakeBuilders(cwd, fakeDaemonBuild);
      if (rootDaemon) {
        expect(status).toBe(1);
        await expect(client.stderr).toOutput(
          'Can\'t build daemon "heartbeat": The app publishes "." as static files'
        );
        return;
      }
      expect(status).toBe(0);
      const output = join(cwd, '.vercel/output');
      const { builds } = await fs.readJSON(join(output, 'builds.json'));
      expect(builds.map((build: { use: string }) => build.use)).toContain(
        '@vercel/static-build'
      );
      await expectHeartbeatDaemonOutput(output);
      const published = await fs.readdir(join(output, 'static'));
      expect(published).toContain('index.html');
      expect(published).not.toContain('daemon');
    } finally {
      await fs.remove(cwd);
    }
  });

  it.each([
    'other',
    '../other',
  ])('rejects a daemon descriptor named %s', async name => {
    const cwd = setupUnitFixture('daemons');
    await fs.outputJSON(join(cwd, '.vercel/project.json'), {
      orgId: '.',
      projectId: '.',
      settings: { framework: null, installCommand: '' },
    });
    try {
      expect(
        await buildWithFakeBuilders(cwd, async options =>
          options.config.daemon
            ? {
                output: {},
                daemons: {
                  [name]: {
                    runtime: 'container',
                    image: daemonImage,
                    instances: { sfo1: 1 },
                  },
                },
              }
            : fakeDaemonBuild(options)
        )
      ).toBe(1);
      await expect(client.stderr).toOutput(
        `returned an unexpected daemon descriptor "${name}"`
      );
      expect(
        await fs.pathExists(join(cwd, '.vercel/output/daemons/other'))
      ).toBe(false);
      expect(await fs.pathExists(join(cwd, '.vercel/output/other'))).toBe(
        false
      );
    } finally {
      await fs.remove(cwd);
    }
  });

  it.each([
    'Dockerfile.vercel',
    'Containerfile',
  ])("doesn't detect the Container preset from a daemon's root %s", async dockerfile => {
    const cwd = setupUnitFixture('daemons');
    // The app publishes `public` so the root-level daemon's sources stay private.
    await fs.outputJSON(join(cwd, '.vercel/project.json'), {
      orgId: '.',
      projectId: '.',
      settings: {
        framework: null,
        installCommand: '',
        outputDirectory: 'public',
      },
    });
    await fs.move(join(cwd, 'index.html'), join(cwd, 'public/index.html'));
    // The daemon is built from a container file at the project root, which
    // would otherwise make the whole project a container on first deployment.
    await fs.copy(join(cwd, 'daemon/Dockerfile'), join(cwd, dockerfile));
    const vercelJson = await fs.readJSON(join(cwd, 'vercel.json'));
    vercelJson.daemons.heartbeat.root = '.';
    vercelJson.daemons.heartbeat.entrypoint = dockerfile;
    await fs.outputJSON(join(cwd, 'vercel.json'), vercelJson);
    vi.stubEnv('VERCEL_FIRST_DEPLOYMENT', '1');
    try {
      expect(await buildWithFakeBuilders(cwd, fakeDaemonBuild)).toBe(0);
      const output = join(cwd, '.vercel/output');
      await expectHeartbeatDaemonOutput(output);
      const { builds } = await fs.readJSON(join(output, 'builds.json'));
      expect(
        builds
          .filter((build: { use: string }) => build.use === '@vercel/container')
          .map((build: { src: string }) => build.src)
      ).toEqual([dockerfile]);
      expect(await fs.pathExists(join(output, 'static/index.html'))).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      await fs.remove(cwd);
    }
  });

  it('fails daemon builds without a descriptor', async () => {
    const cwd = setupUnitFixture('daemons');
    await fs.outputJSON(join(cwd, '.vercel/project.json'), {
      orgId: '.',
      projectId: '.',
      settings: { framework: null, installCommand: '' },
    });
    try {
      expect(
        await buildWithFakeBuilders(cwd, async () => ({ output: {} }))
      ).toBe(1);
      await expect(client.stderr).toOutput(
        'Failed to build daemon "heartbeat": its build returned no daemon descriptor.'
      );
    } finally {
      await fs.remove(cwd);
    }
  });

  it('emits a single deploy-manifest entry for @vercel/static with multiple files', async () => {
    // expandBuild('**') produces one Builder per file, so three files → three
    // diagnostics() calls. The dedup logic must collapse them to one entry.
    const cwd = await getWriteableDirectory();
    await fs.ensureDir(join(cwd, '.vercel'));
    await fs.writeJSON(join(cwd, '.vercel', 'project.json'), {
      orgId: '.',
      projectId: '.',
      settings: { framework: null },
    });
    await fs.writeFile(join(cwd, 'index.html'), '<h1>Home</h1>');
    await fs.writeFile(join(cwd, 'about.html'), '<h1>About</h1>');
    await fs.writeFile(join(cwd, 'styles.css'), 'body {}');

    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toEqual(0);

    const deployManifest = await fs.readJSON(
      join(cwd, '.vercel/output/diagnostics/deploy-manifest.json')
    );
    expect(deployManifest.builds).toEqual({
      '@vercel/static:.': {
        runtime: 'static',
        buildType: 'app',
        dependencies: [],
        root: '.',
        builder: '@vercel/static',
      },
    });
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
    } catch (_e) {
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

  it('should pull "production" env vars with `--environment production`', async () => {
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
      client.setArgv('build', '--yes', '--environment', 'production');
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const prodEnv = await fs.readFile(envFilePath, 'utf8');
      expect(prodEnv.includes('REDIS_CONNECTION_STRING')).toBeTruthy();
      expect(prodEnv.includes('SQL_CONNECTION_STRING')).toBeTruthy();
    } finally {
      await fs.remove(envFilePath);
      await fs.writeJSON(projectJsonPath, originalProjectJson, { spaces: 2 });
    }
    expect(client.stderr.getFullOutput()).not.toContain('deprecated');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'option:environment', value: 'production' },
      { key: 'flag:yes', value: 'TRUE' },
    ]);
  });

  it('links before asking to pull settings in an unlinked directory', async () => {
    const cwd = setupUnitFixture('commands/build/static-pull');
    await fs.remove(join(cwd, '.vercel'));

    useUser({ version: 'northstar' });
    useTeams('team_dummy');
    useProject({
      ...defaultProject,
      id: basename(cwd),
      name: basename(cwd),
    });

    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    try {
      client.cwd = cwd;
      client.setArgv('build');
      const exitCodePromise = build(client);

      // The link flow runs before the pull question. The single team
      // auto-selects; pick the detected folder-name match in the picker.
      await expect(client.stderr).toOutput('Which project?');
      client.events.keypress('enter');
      await expect(client.stderr).toOutput('Linked');

      await expect(client.stderr).toOutput('No Project Settings found locally');
      client.stdin.write('y\n');

      const exitCode = await exitCodePromise;
      expect(exitCode).toEqual(0);

      const projectJson = await fs.readJSON(join(cwd, '.vercel/project.json'));
      expect(projectJson.projectId).toEqual(basename(cwd));
    } finally {
      process.stdin.isTTY = originalIsTTY;
    }
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

  it('should build an explicit proxy with the Node.js runtime', async () => {
    const cwd = fixture('proxy');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toEqual(0);

    const builds = await fs.readJSON(join(output, 'builds.json'));
    expect(builds).toMatchObject({
      target: 'preview',
      builds: [
        {
          require: '@vercel/node',
          apiVersion: 3,
          use: '@vercel/node',
          src: 'proxy.ts',
          config: {
            zeroConfig: true,
            middleware: true,
            middlewareRuntime: 'nodejs',
            middlewareMatcher: '/api/:func*',
            functions: {
              'proxy.ts': {
                maxDuration: 10,
                memory: 1024,
              },
            },
          },
        },
        {
          require: '@vercel/static',
          apiVersion: 2,
          use: '@vercel/static',
          src: REGEX_NON_VERCEL_PLATFORM_FILES.replace('}', ',proxy.ts}'),
          config: {
            zeroConfig: true,
          },
        },
      ],
    });

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config).toMatchObject({
      version: 3,
      routes: [
        {
          src: '^\\/api(?:\\/((?:[^\\/#\\?]+?)(?:\\/(?:[^\\/#\\?]+?))*))?[\\/#\\?]?$',
          middlewarePath: 'proxy',
          middlewareRawSrc: ['/api/:func*'],
          override: true,
          continue: true,
        },
        { handle: 'error' },
        { status: 404, src: '^(?!/api).*$', dest: '/404.html' },
      ],
    });

    const staticFiles = await fs.readdir(join(output, 'static'));
    expect(staticFiles.sort()).toEqual(['index.html']);

    const functions = await fs.readdir(join(output, 'functions'));
    expect(functions.sort()).toEqual(['proxy.func']);

    const functionConfig = await fs.readJSON(
      join(output, 'functions/proxy.func/.vc-config.json')
    );
    expect(functionConfig.runtime).toMatch(/^nodejs/);
    expect(functionConfig.maxDuration).toBe(10);
    expect(functionConfig.memory).toBe(1024);
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
      'Error: [invalid_function] Function must contain at least one property.'
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
      link: 'https://vercel.link/function-runtimes',
    });

    // top level "error" also contains the same error
    expect(builds.error).toEqual({
      name: 'Error',
      message: expect.stringContaining('Please upgrade your Runtime'),
      stack: expect.stringContaining('Please upgrade your Runtime'),
      hideStackTrace: true,
      code: 'NODEJS_DISCONTINUED_VERSION',
      link: 'https://vercel.link/function-runtimes',
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
    expect(files.sort()).toEqual(['index.html']);
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

  describe.each([
    {
      fixtureName: 'with-valid-vercel-otel',
      dependency: '@vercel/otel',
      version: '1.11.0',
      expected: true,
    },
    {
      fixtureName: 'with-invalid-vercel-otel',
      dependency: '@vercel/otel',
      version: '1.10.0',
      expected: false,
    },
    {
      fixtureName: 'with-valid-opentelemetry-sdk',
      dependency: '@opentelemetry/sdk-trace-node',
      version: '1.19.0',
      expected: true,
    },
    {
      fixtureName: 'with-invalid-opentelemetry-sdk',
      dependency: '@opentelemetry/sdk-trace-node',
      version: '1.18.0',
      expected: false,
    },
    {
      fixtureName: 'with-valid-opentelemetry-api',
      dependency: '@opentelemetry/api',
      version: '1.7.0',
      expected: true,
    },
    {
      fixtureName: 'with-invalid-opentelemetry-api',
      dependency: '@opentelemetry/api',
      version: '1.6.0',
      expected: false,
    },
  ])('with instrumentation $dependency', ({
    fixtureName,
    dependency,
    version,
    expected,
  }) => {
    it(`should ${expected ? 'set' : 'not set'} VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION if ${dependency} version ${version} or higher is detected`, async () => {
      const cwd = fixture(fixtureName);
      const output = join(cwd, '.vercel/output');
      client.cwd = cwd;
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const env = await fs.readJSON(join(output, 'static', 'env.json'));
      expect(
        Object.keys(env).includes(
          'VERCEL_TRACING_DISABLE_AUTOMATIC_FETCH_INSTRUMENTATION'
        )
      ).toEqual(expected);

      // "functions/api" directory has output Functions
      const functions = await fs.readdir(join(output, 'functions/api'));
      expect(functions.sort()).toEqual(['index.func']);

      const vcConfig = await fs.readJSON(
        join(output, 'functions/api/index.func/.vc-config.json')
      );
      expect(vcConfig.shouldDisableAutomaticFetchInstrumentation).toBe(
        expected
      );
    });
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

  describe('--deployment', () => {
    function useDeploymentEnv() {
      const requests: string[] = [];
      client.scenario.get('/v3/env/pull/dpl_build', (req, res) => {
        requests.push(req.path);
        res.json({ env: {}, buildEnv: { ENV_FILE: 'deployment' } });
      });
      return requests;
    }

    it('loads environment variables from the deployment', async () => {
      const requests = useDeploymentEnv();
      const cwd = fixture('env-from-vc-pull');
      const output = join(cwd, '.vercel/output');
      client.cwd = cwd;
      client.setArgv('build', '--deployment', 'dpl_build');

      expect(await build(client)).toEqual(0);
      expect(requests).toEqual(['/v3/env/pull/dpl_build']);
      const env = await fs.readJSON(join(output, 'static', 'env.json'));
      expect(env['ENV_FILE']).toEqual('deployment');
      expect(client.stderr.getFullOutput()).not.toContain('deprecated');
    });

    it('still accepts the deprecated --id with a warning', async () => {
      const requests = useDeploymentEnv();
      const cwd = fixture('env-from-vc-pull');
      const output = join(cwd, '.vercel/output');
      client.cwd = cwd;
      client.setArgv('build', '--id', 'dpl_build');

      expect(await build(client)).toEqual(0);
      expect(requests).toEqual(['/v3/env/pull/dpl_build']);
      const env = await fs.readJSON(join(output, 'static', 'env.json'));
      expect(env['ENV_FILE']).toEqual('deployment');
      expect(client.stderr.getFullOutput()).toContain(
        '! --id is deprecated. Use --deployment.'
      );
    });
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
      regions: ['sfo1'],
      functionFailoverRegions: ['dub1'],
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
      VERCEL_PROJECT_SETTINGS_NODE_VERSION: '22.x',
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
      'Error: [INVALID_VERCEL_CONFIG] Invalid vercel.json - `rewrites[2]` should NOT have additional property `src`. Did you mean `source`?' +
        '\n' +
        'Fix: Fix the invalid settings in your Vercel configuration, then rebuild.\n' +
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

  it('should include schedules property in build output', async () => {
    const cwd = fixture('with-schedules');
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config).toHaveProperty('schedules', {
      'daily-report': {
        timezone: 'America/New_York',
        schedule: '0 0 * * *',
        function: 'api/scheduled-job',
      },
      'hourly-jobs': {
        schedule: '0 * * * *',
        jitter: 5,
        topic: 'hourly-jobs',
      },
      'every-ten': {
        schedule: '*/10 * * * *',
        jitter: 15,
        topic: 'every-ten',
      },
      'minimum-jitter': {
        schedule: '*/10 * * * *',
        jitter: 1,
        topic: 'minimum-jitter',
      },
    });
    expect(config.schedules['hourly-jobs']).not.toHaveProperty('timezone');
  });

  it('should include path-target schedules in build output', async () => {
    const cwd = fixture('with-schedules');
    const vercelJsonPath = join(cwd, 'vercel.json');
    const original = await fs.readJSON(vercelJsonPath);
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;

    try {
      await fs.writeJSON(vercelJsonPath, {
        schedules: {
          cleanup: {
            schedule: '0 0 * * *',
            path: '/api/cron?task=cleanup',
          },
          cron: { schedule: '0 0 * * *', path: '/api/cron' },
        },
      });

      expect(await build(client)).toBe(0);
      const config = await fs.readJSON(join(output, 'config.json'));
      expect(config).toHaveProperty('schedules', {
        cleanup: {
          schedule: '0 0 * * *',
          path: '/api/cron?task=cleanup',
        },
        cron: { schedule: '0 0 * * *', path: '/api/cron' },
      });
    } finally {
      await fs.writeJSON(vercelJsonPath, original, { spaces: 2 });
    }
  });

  it('should reject entrypoints without a supported runtime', async () => {
    const cwd = fixture('with-schedules');
    const vercelJsonPath = join(cwd, 'vercel.json');
    const original = await fs.readJSON(vercelJsonPath);
    client.cwd = cwd;

    try {
      await fs.writeJSON(vercelJsonPath, {
        schedules: {
          nightly: {
            schedule: '0 0 * * *',
            entrypoint: 'api/scheduled-job.js',
          },
        },
      });

      expect(await build(client)).toBe(1);
      await expect(client.stderr).toOutput(
        'Schedule "nightly" entrypoint "api/scheduled-job.js" uses an unsupported runtime.'
      );
    } finally {
      await fs.writeJSON(vercelJsonPath, original, { spaces: 2 });
    }
  });

  it('should resolve entrypoint schedules in build output', async () => {
    const cwd = fixture('with-python-schedule-entrypoint');
    const vercelJsonPath = join(cwd, 'vercel.json');
    const original = await fs.readJSON(vercelJsonPath);
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;

    try {
      await fs.writeJSON(vercelJsonPath, {
        ...original,
        schedules: {
          nightly: {
            schedule: '0 0 * * *',
            entrypoint: 'jobs/nightly.py',
            timezone: 'America/New_York',
            jitter: 5,
          },
          hourly: {
            schedule: '0 * * * *',
            entrypoint: 'jobs/hourly.py',
          },
          weekly: {
            schedule: '0 0 * * 0',
            entrypoint: 'jobs/weekly.py',
          },
        },
      });

      expect(await build(client)).toBe(0);
      const config = await fs.readJSON(join(output, 'config.json'));
      expect(config.schedules).toEqual({
        nightly: {
          schedule: '0 0 * * *',
          function: '_vercel/schedules/jobs/nightly',
          timezone: 'America/New_York',
          jitter: 5,
        },
        hourly: {
          schedule: '0 * * * *',
          function: '_vercel/schedules/default',
        },
        weekly: {
          schedule: '0 0 * * 0',
          function: '_vercel/schedules/default',
        },
      });
      const handler = await fs.readFile(
        join(
          output,
          'functions/_vercel/schedules/default.func/_vc_schedule_handlers/_vercel_schedules_default.py'
        ),
        'utf8'
      );
      expect(handler).toContain('"hourly": os.path.join(');
    } finally {
      await fs.writeJSON(vercelJsonPath, original, { spaces: 2 });
    }
  });

  it('should pack Python schedule scripts into one function per functions config', async () => {
    const cwd = fixture('with-python-schedule-entrypoint');
    const output = join(cwd, '.vercel', 'output');
    // `jobs/nightly` is the only entrypoint with `functions` config, so its
    // function is named after that pattern.
    const configuredPath = '_vercel/schedules/jobs/nightly';
    const defaultPath = '_vercel/schedules/default';
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const builds = await fs.readJSON(join(output, 'builds.json'));
    const pythonBuilds = builds.builds.filter(
      (candidate: { require: string }) => candidate.require === '@vercel/python'
    );
    expect(
      pythonBuilds.map((candidate: { src: string; config: unknown }) => [
        candidate.src,
        (candidate.config as { scheduleFunction: unknown }).scheduleFunction,
      ])
    ).toEqual([
      [
        'jobs/nightly.py',
        {
          outputPath: configuredPath,
          entrypoints: [
            {
              entrypoint: 'jobs/nightly.py',
              sourceFile: 'jobs/nightly.py',
              scheduleNames: ['nightly'],
            },
          ],
        },
      ],
      [
        'jobs/hourly.py',
        {
          outputPath: defaultPath,
          entrypoints: [
            {
              entrypoint: 'jobs/hourly.py',
              sourceFile: 'jobs/hourly.py',
              scheduleNames: ['hourly-cleanup'],
            },
            {
              entrypoint: 'jobs/weekly.py',
              sourceFile: 'jobs/weekly.py',
              scheduleNames: ['weekly'],
            },
          ],
        },
      ],
    ]);

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config.schedules).toEqual({
      nightly: {
        schedule: '0 0 * * *',
        function: configuredPath,
      },
      'hourly-cleanup': {
        schedule: '0 * * * *',
        function: defaultPath,
      },
      weekly: {
        schedule: '0 0 * * 0',
        function: defaultPath,
      },
    });
    expect(
      await fs.pathExists(
        join(output, 'functions/_vercel/schedules/jobs/hourly.func')
      )
    ).toBe(false);

    for (const [functionPath, maxDuration] of [
      [configuredPath, 42],
      [defaultPath, undefined],
    ] as const) {
      const functionConfig = await fs.readJSON(
        join(output, 'functions', `${functionPath}.func`, '.vc-config.json')
      );
      expect(functionConfig.handler).toBe('vc__handler__python.vc_handler');
      expect(functionConfig.experimentalTriggers).toEqual([
        { type: 'schedule/v1beta' },
      ]);
      expect(functionConfig.maxDuration).toBe(maxDuration);
    }

    expect(await fs.pathExists(join(output, 'static', 'jobs/nightly.py'))).toBe(
      false
    );
    expect(client.stderr.getFullOutput()).not.toContain(
      'published as static files'
    );
  });

  it('should warn about Python modules published next to schedule entrypoints', async () => {
    const cwd = fixture('with-python-schedule-entrypoint');
    const output = join(cwd, '.vercel', 'output');
    const helperPath = join(cwd, 'jobs', '_shared.py');
    client.cwd = cwd;

    try {
      await fs.writeFile(helperPath, 'GREETING = "hello"\n');

      expect(await build(client)).toBe(0);
      await expect(client.stderr).toOutput(
        'WARNING! 1 Python file is published as a static file and can be downloaded: jobs/_shared.py. To keep it private, set `outputDirectory` to a directory that only contains static files.'
      );
      expect(await fs.pathExists(join(output, 'static/jobs/_shared.py'))).toBe(
        true
      );
      expect(await fs.pathExists(join(output, 'static/jobs/nightly.py'))).toBe(
        false
      );
    } finally {
      await fs.remove(helperPath);
    }
  });

  it('should publish schedule sources selected by an explicit output directory', async () => {
    const cwd = fixture('with-python-schedule-entrypoint');
    const output = join(cwd, '.vercel', 'output');
    const vercelJsonPath = join(cwd, 'vercel.json');
    const original = await fs.readJSON(vercelJsonPath);
    client.cwd = cwd;

    try {
      await fs.writeJSON(vercelJsonPath, {
        ...original,
        buildCommand: 'node -e ""',
        installCommand: '',
        outputDirectory: '.',
      });

      expect(await build(client)).toBe(0);
      expect(
        await fs.pathExists(
          join(output, 'functions/_vercel/schedules/jobs/nightly.func')
        )
      ).toBe(true);
      expect(await fs.pathExists(join(output, 'static/index.html'))).toBe(true);
      expect(await fs.pathExists(join(output, 'static/jobs/nightly.py'))).toBe(
        true
      );
      await expect(client.stderr).toOutput(
        'WARNING! 3 Python files are published as static files and can be downloaded: jobs/hourly.py, jobs/nightly.py, and jobs/weekly.py.'
      );
    } finally {
      await fs.writeJSON(vercelJsonPath, original, { spaces: 2 });
    }
  });

  it('should give schedule entrypoints precedence over implicit API detection', async () => {
    const cwd = fixture('with-python-schedule-entrypoint-in-api');
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;

    expect(await build(client)).toBe(0);

    const builds = await fs.readJSON(join(output, 'builds.json'));
    const pythonBuilds = builds.builds.filter(
      (candidate: { require: string }) => candidate.require === '@vercel/python'
    );
    expect(pythonBuilds).toHaveLength(1);
    expect(pythonBuilds[0].config.scheduleFunction).toEqual({
      outputPath: '_vercel/schedules/default',
      entrypoints: [
        {
          entrypoint: 'api/nightly.py',
          sourceFile: 'api/nightly.py',
          scheduleNames: ['nightly'],
        },
      ],
    });
    expect(
      await fs.pathExists(join(output, 'functions/api/nightly.func'))
    ).toBe(false);
    expect(
      await fs.pathExists(
        join(output, 'functions/_vercel/schedules/default.func')
      )
    ).toBe(true);
  });

  it('should reject schedule entrypoint sources claimed by explicit builds', async () => {
    const cwd = fixture('with-python-schedule-entrypoint-in-api');
    const vercelJsonPath = join(cwd, 'vercel.json');
    const original = await fs.readJSON(vercelJsonPath);
    client.cwd = cwd;

    try {
      await fs.writeJSON(vercelJsonPath, {
        ...original,
        builds: [{ src: 'api/nightly.py', use: '@vercel/python' }],
      });

      expect(await build(client)).toBe(1);
      await expect(client.stderr).toOutput(
        'Schedule entrypoint "api/nightly.py" uses source file "api/nightly.py", which is also matched by builder "@vercel/python". Move the schedule entrypoint to its own file or remove the conflicting build.'
      );
    } finally {
      await fs.writeJSON(vercelJsonPath, original, { spaces: 2 });
    }
  });

  it('should reject a schedule entrypoint whose runtime differs from the framework', async () => {
    const cwd = fixture('with-schedules');
    const vercelJsonPath = join(cwd, 'vercel.json');
    const projectJsonPath = join(cwd, '.vercel', 'project.json');
    const originalVercelJson = await fs.readJSON(vercelJsonPath);
    const originalProjectJson = await fs.readJSON(projectJsonPath);
    client.cwd = cwd;

    try {
      await fs.writeJSON(projectJsonPath, {
        ...originalProjectJson,
        settings: { ...originalProjectJson.settings, framework: 'nextjs' },
      });
      await fs.writeJSON(vercelJsonPath, {
        schedules: {
          nightly: {
            schedule: '0 0 * * *',
            entrypoint: 'jobs/nightly.py',
          },
        },
      });

      expect(await build(client)).toBe(1);
      await expect(client.stderr).toOutput(
        'Schedule "nightly" entrypoint "jobs/nightly.py" uses the python runtime, but framework "nextjs" uses the node runtime. Schedule entrypoints must use the same runtime as the framework.'
      );
    } finally {
      await fs.writeJSON(vercelJsonPath, originalVercelJson, { spaces: 2 });
      await fs.writeJSON(projectJsonPath, originalProjectJson, { spaces: 2 });
    }
  });

  it('should reject mixed schedule entrypoint runtimes before resolution with framework null', async () => {
    const cwd = fixture('with-schedules');
    const vercelJsonPath = join(cwd, 'vercel.json');
    const projectJsonPath = join(cwd, '.vercel', 'project.json');
    const originalVercelJson = await fs.readJSON(vercelJsonPath);
    const originalProjectJson = await fs.readJSON(projectJsonPath);
    client.cwd = cwd;

    try {
      await fs.writeJSON(projectJsonPath, {
        ...originalProjectJson,
        settings: { ...originalProjectJson.settings, framework: null },
      });
      await fs.writeJSON(vercelJsonPath, {
        schedules: {
          nightly: {
            schedule: '0 0 * * *',
            entrypoint: 'jobs/nightly.py',
          },
          hourly: {
            schedule: '0 * * * *',
            entrypoint: 'jobs/hourly.ts',
          },
        },
      });

      expect(await build(client)).toBe(1);
      await expect(client.stderr).toOutput(
        'Schedule "nightly" entrypoint "jobs/nightly.py" uses the python runtime, but schedule "hourly" entrypoint "jobs/hourly.ts" uses the node runtime. Schedule entrypoints must all use the same runtime.'
      );
      await expect(client.stderr).not.toOutput('unsupported runtime');
    } finally {
      await fs.writeJSON(vercelJsonPath, originalVercelJson, { spaces: 2 });
      await fs.writeJSON(projectJsonPath, originalProjectJson, { spaces: 2 });
    }
  });

  it('should not include schedules property in build output when not configured', async () => {
    const cwd = fixture('with-cron');
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config).not.toHaveProperty('schedules');
  });

  it('should fail the build when schedules are malformed', async () => {
    const cwd = fixture('with-schedules');
    client.cwd = cwd;
    const vercelJsonPath = join(cwd, 'vercel.json');
    const original = await fs.readJSON(vercelJsonPath);
    try {
      await fs.writeJSON(vercelJsonPath, {
        schedules: { 'missing-required-fields': {} },
      });
      const exitCode = await build(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid vercel.json');
    } finally {
      await fs.writeJSON(vercelJsonPath, original, { spaces: 2 });
    }
  });

  it.each([
    16,
    1.5,
    '5m',
  ])('should fail the build for invalid schedule jitter %j', async jitter => {
    const cwd = fixture('with-schedules');
    client.cwd = cwd;
    const vercelJsonPath = join(cwd, 'vercel.json');
    const original = await fs.readJSON(vercelJsonPath);
    try {
      await fs.writeJSON(vercelJsonPath, {
        schedules: {
          'invalid-jitter': {
            schedule: '0 * * * *',
            jitter,
            topic: 'hourly-jobs',
          },
        },
      });
      const exitCode = await build(client);
      expect(exitCode).toBe(1);
      await expect(client.stderr).toOutput('Invalid vercel.json');
    } finally {
      await fs.writeJSON(vercelJsonPath, original, { spaces: 2 });
    }
  });

  it('should not duplicate routes for a service built through the Build Output API', async () => {
    const serviceRoutes = [
      {
        src: '^/(?<path>.+?)(?:/)?$',
        dest: '/$path.segments/$segmentPath.segment.rsc',
        has: [
          {
            type: 'header',
            key: 'next-router-segment-prefetch',
            value: '/(?<segmentPath>.+)',
          },
        ],
        continue: true,
      },
      { handle: 'miss' },
      {
        src: '^/(?<path>.+)(?<rscSuffix>\\.segments/.+\\.segment\\.rsc)(?:/)?$',
        dest: '/$path.rsc',
        check: true,
      },
    ];
    const cwd = await getWriteableDirectory();
    await fs.ensureDir(join(cwd, '.vercel'));
    await fs.writeJSON(join(cwd, '.vercel', 'project.json'), {
      orgId: '.',
      projectId: '.',
      settings: {
        framework: null,
        installCommand: '',
      },
    });
    await fs.writeJSON(join(cwd, 'vercel.json'), {
      services: {
        web: {
          root: 'web',
          framework: 'vite',
          buildCommand: 'node make-output.mjs',
        },
      },
      rewrites: [{ source: '/(.*)', destination: { service: 'web' } }],
    });
    await fs.ensureDir(join(cwd, 'web'));
    await fs.writeJSON(join(cwd, 'web', 'package.json'), { name: 'web' });
    await fs.writeFile(
      join(cwd, 'web', 'make-output.mjs'),
      [
        `import fs from 'node:fs';`,
        `import path from 'node:path';`,
        `import { fileURLToPath } from 'node:url';`,
        `const dir = path.dirname(fileURLToPath(import.meta.url));`,
        `const out = path.join(dir, '.vercel', 'output');`,
        `fs.mkdirSync(path.join(out, 'static'), { recursive: true });`,
        `fs.writeFileSync(path.join(out, 'static', 'index.html'), 'hello');`,
        `fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify({`,
        `  version: 3,`,
        `  routes: ${JSON.stringify(serviceRoutes)},`,
        `  services: { nested: { root: 'nested' } },`,
        `}));`,
      ].join('\n')
    );

    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const output = join(cwd, '.vercel', 'output');

    // Every route from the service's Build Output config appears exactly once.
    const webConfig = await fs.readJSON(
      join(output, 'services', 'web', 'config.json')
    );
    expect(webConfig.routes).toEqual(serviceRoutes);

    // The service's routes must not leak into the root route table.
    const rootConfig = await fs.readJSON(join(output, 'config.json'));
    expect(rootConfig.routes).not.toContainEqual(serviceRoutes[0]);
    expect(rootConfig.routes).toContainEqual(
      expect.objectContaining({
        destination: { type: 'service', service: 'web' },
      })
    );
  });

  it('should include legacy cron service type in build output crons', async () => {
    const cwd = fixture('with-services-cron');
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config.crons).toEqual([
      {
        path: '/_svc/cleanup/crons/index/cron',
        schedule: '0 0 * * *',
      },
    ]);
    expect(config.routes).toContainEqual({
      src: '^/_svc/cleanup/crons/.*$',
      dest: '/_svc/cleanup/index',
      check: true,
    });
  });

  it('should build multiple JS cron services from nested entrypoints', async () => {
    // Two cron services in one fixture, each with its own nested
    // entrypoint under `jobs/`. Verifies the cron URL path includes
    // the nested directories, that each service builds its own lambda
    // mounted at `_svc/{name}/index`, and that each lambda's
    // dispatcher shim ends up alongside the bundled handler.
    const cwd = fixture('with-services-cron-nested');
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config.crons).toEqual(
      expect.arrayContaining([
        {
          path: '/_svc/cleanup/crons/jobs/cleanup/cron',
          schedule: '0 0 * * *',
        },
        {
          path: '/_svc/report/crons/jobs/report/cron',
          schedule: '0 6 * * *',
        },
      ])
    );

    const cleanupConfig = await fs.readJSON(
      join(output, 'functions/_svc/cleanup/index.func/.vc-config.json')
    );
    expect(cleanupConfig.handler).toContain('__vc_cron_dispatch');

    const reportConfig = await fs.readJSON(
      join(output, 'functions/_svc/report/index.func/.vc-config.json')
    );
    expect(reportConfig.handler).toContain('__vc_cron_dispatch');
  });

  it('should build a JS cron service through the cron dispatcher', async () => {
    const cwd = fixture('with-services-cron-handler');
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    // Same build-output as the legacy fixture
    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config.crons).toEqual([
      {
        path: '/_svc/cleanup/crons/index/cron',
        schedule: '0 0 * * *',
      },
    ]);
    expect(config.routes).toContainEqual({
      src: '^/_svc/cleanup/crons/.*$',
      dest: '/_svc/cleanup/index',
      check: true,
    });

    // The lambda's handler points at the cron dispatcher shim, not the
    // user file directly.
    const funcDir = join(output, 'functions/_svc/cleanup/index.func');
    const vcConfig = await fs.readJSON(join(funcDir, '.vc-config.json'));
    expect(vcConfig.handler).toContain('__vc_cron_dispatch');

    // The dispatcher shim file lives in the bundle and embeds the
    // route table inline.
    const shimFiles = (await fs.readdir(funcDir)).filter(name =>
      name.includes('__vc_cron_dispatch')
    );
    expect(shimFiles).toHaveLength(1);
    const shimSource = await fs.readFile(join(funcDir, shimFiles[0]), 'utf-8');
    expect(shimSource).toContain(
      `JSON.parse('{"/_svc/cleanup/crons/index/cron":"default"}')`
    );
  });

  it('should include job service schedules and queue triggers in build output', async () => {
    const cwd = fixture('with-services-job');
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config.crons).toEqual([
      {
        path: '/_svc/cleanup/crons/index/cron',
        schedule: '0 0 * * *',
      },
    ]);

    const vcConfig = await fs.readJSON(
      join(output, 'functions/_svc/processor/index.func/.vc-config.json')
    );
    expect(vcConfig.experimentalTriggers).toEqual([
      {
        type: 'queue/v2beta',
        topic: 'orders',
        consumer: '_S__svc_Sprocessor_Sindex',
        retryAfterSeconds: 10,
        initialDelaySeconds: 5,
      },
    ]);
  });

  it('should append services SPA fallback after builder output routes', async () => {
    const cwd = await createTempServicesProject({
      experimentalServices: {
        api: {
          framework: 'nitro',
          entrypoint: '.',
          routePrefix: '/',
        },
      },
      files: {
        'package.json': JSON.stringify({
          scripts: {
            build: 'node build.mjs',
          },
        }),
        'build.mjs': `
          import { mkdirSync, writeFileSync } from 'node:fs';
          import { join } from 'node:path';

          const outputDir = join(process.cwd(), '.vercel', 'output');
          mkdirSync(outputDir, { recursive: true });
          writeFileSync(
            join(outputDir, 'config.json'),
            JSON.stringify({
              version: 3,
              routes: [
                { handle: 'filesystem' },
                { src: '/(.*)', dest: '/__server' },
              ],
            })
          );
        `,
      },
    });
    const output = join(cwd, '.vercel/output');

    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    const serverRouteIndex = config.routes.findIndex(
      (route: { dest?: string }) => route.dest === '/__server'
    );
    const fallbackRouteIndex = config.routes.findIndex(
      (route: { dest?: string }) => route.dest === '/index.html'
    );

    expect(serverRouteIndex).toBeGreaterThan(-1);
    expect(fallbackRouteIndex).toBeGreaterThan(-1);
    expect(serverRouteIndex).toBeLessThan(fallbackRouteIndex);
  });

  it('should fail build when schedule-triggered job uses a dynamic schedule without builder crons', async () => {
    const cwd = await createTempServicesProject({
      experimentalServices: {
        cleanup: {
          type: 'job',
          trigger: 'schedule',
          entrypoint: 'index.js',
          schedule: '<dynamic>',
        },
      },
      files: {
        'index.js': `const { createServer } = require('node:http');

createServer((_req, res) => {
  res.statusCode = 200;
  res.end('ok');
}).listen(3000);
`,
      },
    });
    const output = join(cwd, '.vercel', 'output');

    try {
      client.cwd = cwd;
      const exitCode = await build(client);
      expect(exitCode).toBe(1);

      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds.error.message).toContain(
        'Dynamic cron schedules ("<dynamic>") are not yet supported for JavaScript/TypeScript services'
      );
    } finally {
      // Tolerate EBUSY on Windows when the builder still holds file handles.
      await fs.remove(cwd).catch(() => {});
    }
  });

  it('should fail build when schedule-triggered job is not runtime-backed', async () => {
    const cwd = await createTempServicesProject({
      experimentalServices: {
        cleanup: {
          type: 'job',
          trigger: 'schedule',
          builder: '@vercel/static',
          entrypoint: 'main.html',
          schedule: '0 0 * * *',
        },
      },
      files: {
        'main.html':
          '<!doctype html><html><body>scheduled static job</body></html>',
      },
    });
    const output = join(cwd, '.vercel', 'output');

    try {
      client.cwd = cwd;
      const exitCode = await build(client);
      expect(exitCode).toBe(1);

      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds.error).toMatchObject({
        code: 'CRON_SERVICE_NO_CRONS',
      });
      expect(builds.error.message).toContain(
        'The builder "@vercel/static" may not support scheduled services.'
      );
    } finally {
      // Tolerate EBUSY on Windows when the builder still holds file handles.
      await fs.remove(cwd).catch(() => {});
    }
  });

  it('should fail build when CRON_SECRET contains invalid HTTP header characters', async () => {
    const cwd = fixture('with-cron');
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;

    // Set an invalid CRON_SECRET with a control character (newline)
    process.env.CRON_SECRET = 'my\nsecret';

    try {
      const exitCode = await build(client);
      expect(exitCode).toBe(1);

      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds.error).toMatchObject({
        code: 'INVALID_CRON_SECRET',
      });
      expect(builds.error.message).toContain('control character');
    } finally {
      delete process.env.CRON_SECRET;
    }
  });

  it('should fail build when CRON_SECRET contains non-ASCII characters', async () => {
    const cwd = fixture('with-cron');
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;

    // Set an invalid CRON_SECRET with a non-ASCII character
    process.env.CRON_SECRET = 'mysecret🔐';

    try {
      const exitCode = await build(client);
      expect(exitCode).toBe(1);

      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds.error).toMatchObject({
        code: 'INVALID_CRON_SECRET',
      });
      expect(builds.error.message).toContain('non-ASCII character');
    } finally {
      delete process.env.CRON_SECRET;
    }
  });

  it('should fail build when CRON_SECRET has leading/trailing whitespace', async () => {
    const cwd = fixture('with-cron');
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;

    // Set an invalid CRON_SECRET with trailing space
    process.env.CRON_SECRET = 'mysecret ';

    try {
      const exitCode = await build(client);
      expect(exitCode).toBe(1);

      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds.error).toMatchObject({
        code: 'INVALID_CRON_SECRET',
      });
      expect(builds.error.message).toContain('leading or trailing whitespace');
    } finally {
      delete process.env.CRON_SECRET;
    }
  });

  it('should build successfully when CRON_SECRET contains valid characters', async () => {
    const cwd = fixture('with-cron');
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;

    // Set a valid CRON_SECRET with alphanumeric and special chars
    process.env.CRON_SECRET = 'Bearer my-secret_token.123!@#$%^&*()';

    try {
      const exitCode = await build(client);
      expect(exitCode).toBe(0);

      const config = await fs.readJSON(join(output, 'config.json'));
      expect(config).toHaveProperty('crons');
    } finally {
      delete process.env.CRON_SECRET;
    }
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

  it('should merge schedules property from build output with vercel.json schedules property', async () => {
    const cwd = fixture('with-schedules-merge');
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config).toHaveProperty('schedules', {
      'hourly-jobs': {
        schedule: '0 * * * *',
        topic: 'hourly-jobs',
      },
      'db.cleanup': {
        schedule: '0 3 * * *',
        function: '_vercel/tasks',
      },
      report: {
        schedule: '0 0 * * *',
        path: '/api/report',
      },
    });
  });

  it('should reject schedule names defined by both vercel.json and build output', async () => {
    const cwd = fixture('with-schedules-merge');
    const vercelJsonPath = join(cwd, 'vercel.json');
    const original = await fs.readJSON(vercelJsonPath);
    client.cwd = cwd;

    try {
      await fs.writeJSON(vercelJsonPath, {
        schedules: {
          'db.cleanup': { schedule: '0 1 * * *', topic: 'cleanup' },
        },
      });

      expect(await build(client)).toBe(1);
      await expect(client.stderr).toOutput(
        'Schedule "db.cleanup" is defined by both vercel.json and the build output of "@vercel/static-build"'
      );
    } finally {
      await fs.writeJSON(vercelJsonPath, original, { spaces: 2 });
    }
  });

  it('should reject a name inside a schedule in build output', async () => {
    const cwd = fixture('with-schedules-merge');
    const buildOutputConfigPath = join(cwd, 'output', 'config.json');
    const original = await fs.readJSON(buildOutputConfigPath);
    client.cwd = cwd;

    try {
      await fs.writeJSON(buildOutputConfigPath, {
        version: 3,
        schedules: {
          report: {
            name: 'report',
            schedule: '0 0 * * *',
            path: '/api/report',
          },
        },
      });

      expect(await build(client)).toBe(1);
      await expect(client.stderr).toOutput(
        'cannot set `name` on "report". The schedule\'s key is its name.'
      );
    } finally {
      await fs.writeJSON(buildOutputConfigPath, original, { spaces: 2 });
    }
  });

  it('should reject schedules listed as an array in build output', async () => {
    const cwd = fixture('with-schedules-merge');
    const buildOutputConfigPath = join(cwd, 'output', 'config.json');
    const original = await fs.readJSON(buildOutputConfigPath);
    client.cwd = cwd;

    try {
      await fs.writeJSON(buildOutputConfigPath, {
        version: 3,
        schedules: [
          { name: 'report', schedule: '0 0 * * *', path: '/api/report' },
        ],
      });

      expect(await build(client)).toBe(1);
      await expect(client.stderr).toOutput(
        'Schedules in the build output of "@vercel/static-build" for "package.json" must be an object keyed by schedule name.'
      );
    } finally {
      await fs.writeJSON(buildOutputConfigPath, original, { spaces: 2 });
    }
  });

  it('should reject entrypoint schedules in build output', async () => {
    const cwd = fixture('with-schedules-merge');
    const buildOutputConfigPath = join(cwd, 'output', 'config.json');
    const original = await fs.readJSON(buildOutputConfigPath);
    client.cwd = cwd;

    try {
      await fs.writeJSON(buildOutputConfigPath, {
        version: 3,
        schedules: {
          nightly: {
            schedule: '0 0 * * *',
            entrypoint: 'api/nightly.js',
          },
        },
      });

      expect(await build(client)).toBe(1);
      await expect(client.stderr).toOutput(
        'cannot use `entrypoint`. Build Output schedules must target a `function`, `path`, or `topic`.'
      );
    } finally {
      await fs.writeJSON(buildOutputConfigPath, original, { spaces: 2 });
    }
  });

  it('should reject schedules in nested service build output', async () => {
    const cwd = await getWriteableDirectory();
    await fs.ensureDir(join(cwd, '.vercel'));
    await fs.writeJSON(join(cwd, '.vercel', 'project.json'), {
      orgId: '.',
      projectId: '.',
      settings: {
        framework: null,
        installCommand: '',
      },
    });
    await fs.writeJSON(join(cwd, 'vercel.json'), {
      services: {
        web: {
          root: 'web',
          framework: 'vite',
          buildCommand: 'node make-output.mjs',
        },
      },
      rewrites: [{ source: '/(.*)', destination: { service: 'web' } }],
    });
    await fs.ensureDir(join(cwd, 'web'));
    await fs.writeJSON(join(cwd, 'web', 'package.json'), { name: 'web' });
    await fs.writeFile(
      join(cwd, 'web', 'make-output.mjs'),
      [
        `import fs from 'node:fs';`,
        `import path from 'node:path';`,
        `import { fileURLToPath } from 'node:url';`,
        `const dir = path.dirname(fileURLToPath(import.meta.url));`,
        `const out = path.join(dir, '.vercel', 'output');`,
        `fs.mkdirSync(path.join(out, 'static'), { recursive: true });`,
        `fs.writeFileSync(path.join(out, 'static', 'index.html'), 'hello');`,
        `fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify({`,
        `  version: 3,`,
        `  schedules: { 'db.cleanup': { schedule: '0 3 * * *', function: '_vercel/tasks' } },`,
        `}));`,
      ].join('\n')
    );

    client.cwd = cwd;
    expect(await build(client)).toBe(1);
    await expect(client.stderr).toOutput(
      'are not supported for services yet. Define them in vercel.json instead.'
    );
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
      expect(files.sort()).toEqual([
        'builds.json',
        'config.json',
        'diagnostics',
        'static',
      ]);
    } finally {
      delete process.env.STORYBOOK_DISABLE_TELEMETRY;
    }
  });

  it('should error if .npmrc exists containing use-node-version', async () => {
    const cwd = fixture('npmrc-use-node-version');
    client.cwd = cwd;
    client.setArgv('build');
    const exitCodePromise = build(client);
    await expect(client.stderr).toOutput(
      'Error: [BUILD_FAILED] Detected unsupported'
    );
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

  it('should respect `.vercelignore` for Build Output API', async () => {
    const cwd = fixture('static-with-ignore');
    const output = join(cwd, '.vercel/output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toEqual(0);

    const staticFiles = await fs.readdir(join(output, 'static'));
    expect(staticFiles).toEqual(['index.html']);
    expect(fs.existsSync(join(output, 'static', 'foo.html'))).toBe(false);
    expect(fs.existsSync(join(output, 'static', 'build.log'))).toBe(false);
    expect(fs.existsSync(join(output, 'static', 'temp'))).toBe(false);
  });

  it.skipIf(process.platform === 'win32')(
    'should apply routes from `.vercel/routes.json` for backend frameworks',
    async () => {
      const cwd = fixture('express-with-routes-json');
      const output = join(cwd, '.vercel/output');

      try {
        client.cwd = cwd;
        const exitCode = await build(client);
        expect(exitCode).toEqual(0);

        // `config.json` should include routes from `.vercel/routes.json`
        const config = await fs.readJSON(join(output, 'config.json'));
        expect(config).toMatchObject({
          version: 3,
          routes: [
            { handle: 'filesystem' },
            {
              src: expect.stringMatching(/^\^.*users.*\$$/),
              dest: '/users/:id',
              methods: ['GET'],
            },
            {
              src: expect.stringMatching(/^\^.*api.*posts.*\$$/),
              dest: '/api/posts/:postId',
              methods: ['GET'],
            },
            {
              src: '/(.*)',
              dest: '/',
            },
          ],
        });

        // "functions" directory should have the express function
        const functions = await fs.readdir(join(output, 'functions'));
        expect(functions).toContain('index.func');
      } finally {
        delete process.env.VERCEL_EXPERIMENTAL_ROUTES_JSON;
      }
    }
  );

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
      accountId: 'team_dummy',
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

    // Explicit scope resolves the project through the API, then recovers the
    // matching repo link so the build still runs from the selected directory.
    client.config.currentTeam = 'team_dummy';
    client.cwd = join(cwd, 'marketing');
    client.setArgv(
      'build',
      '--project=monorepo-marketing',
      '--scope=team-dummy',
      '--yes'
    );
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

  describe('afterCacheBypass', () => {
    const rules: AfterCacheBypassRule[] = [
      {
        name: 'HTML Limited Bots',
        hasAll: [
          {
            type: 'request.header',
            key: 'user-agent',
            value: {
              re: '.*(?:[\\w-]+-Google|Google-[\\w-]+|googleweblight).*',
            },
          },
          {
            type: 'cache.response.header',
            key: 'x-next-prelude-metadata',
            value: { eq: '0' },
          },
        ],
      },
    ];

    describe.each(['root', 'service'])('%s config', scope => {
      it.each([
        { name: 'rules', afterCacheBypass: rules },
        { name: 'an empty array', afterCacheBypass: [] },
        { name: 'an omitted property', afterCacheBypass: undefined },
      ])('preserves $name', async ({ afterCacheBypass }) => {
        const cwd = await getWriteableDirectory();
        const projectDir = scope === 'root' ? cwd : join(cwd, 'web');
        await fs.outputJSON(join(cwd, '.vercel', 'project.json'), {
          orgId: '.',
          projectId: '.',
          settings: { framework: null, installCommand: '' },
        });
        await fs.outputJSON(join(projectDir, 'package.json'), {
          private: true,
          scripts: { build: 'node build.mjs' },
        });
        await fs.writeJSON(join(projectDir, 'output-config.json'), {
          version: 3,
          afterCacheBypass,
        });
        await fs.writeFile(
          join(projectDir, 'build.mjs'),
          [
            `import fs from 'node:fs';`,
            `const out = '.vercel/output';`,
            `fs.mkdirSync(out + '/static', { recursive: true });`,
            `fs.writeFileSync(out + '/static/index.html', 'ok');`,
            `fs.copyFileSync('output-config.json', out + '/config.json');`,
          ].join('\n')
        );
        if (scope === 'service') {
          await fs.writeJSON(join(cwd, 'vercel.json'), {
            services: {
              web: {
                root: 'web',
                framework: 'vite',
                buildCommand: 'node build.mjs',
              },
            },
          });
        }

        client.cwd = cwd;
        expect(await build(client)).toBe(0);

        const output = join(cwd, '.vercel', 'output');
        const configPath =
          scope === 'root'
            ? join(output, 'config.json')
            : join(output, 'services', 'web', 'config.json');
        const config = await fs.readJSON(configPath);
        expect(config.afterCacheBypass).toEqual(afterCacheBypass);
        if (scope === 'service') {
          const rootConfig = await fs.readJSON(join(output, 'config.json'));
          expect(rootConfig).not.toHaveProperty('afterCacheBypass');
        }
      });
    });
  });

  it('should merge routes, overrides, and afterCacheBypass from multiple Build Output API builders', async () => {
    const cwd = fixture('multi-build-output-config');
    const output = join(cwd, '.vercel/output');

    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toEqual(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config).toMatchObject({
      version: 3,
      routes: expect.arrayContaining([
        expect.objectContaining({ src: '^/first/?$', dest: '/first' }),
        expect.objectContaining({ src: '^/second/?$', dest: '/second' }),
      ]),
      overrides: {
        'static/first.txt': { path: 'static/first.txt' },
        'static/second.txt': { path: 'static/second.txt' },
      },
      afterCacheBypass: ['first', 'second'].map(name => ({
        name,
        hasAll: [{ type: 'request.header', key: `x-bypass-${name}` }],
      })),
    });
  });

  describe('flags-definitions', () => {
    const FLAGS_DATAFILE_URL = 'https://flags.vercel.com/v1/datafile';
    const spyOnFetch = () => vi.spyOn(globalThis, 'fetch');
    let fetchSpy: ReturnType<typeof spyOnFetch>;

    const findDefinitionsDir = (dir: string) =>
      join(dir, 'node_modules', '@vercel', 'flags-definitions');

    const definitionsDirs = ['static', 'with-vercel-flags'].map(name =>
      findDefinitionsDir(fixture(name))
    );

    const getFetchUrl = (
      input: Parameters<typeof globalThis.fetch>[0]
    ): string => {
      if (typeof input === 'string') {
        return input;
      }
      return input instanceof URL ? input.href : input.url;
    };

    const flagsFetchCalls = () =>
      fetchSpy.mock.calls.filter(
        ([input]) => getFetchUrl(input) === FLAGS_DATAFILE_URL
      );

    beforeEach(() => {
      fetchSpy = spyOnFetch();
      fetchSpy.mockImplementation(async input => {
        const url = getFetchUrl(input);
        if (url === FLAGS_DATAFILE_URL) {
          return new Response(JSON.stringify({ flags: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        throw new Error(`Unexpected fetch call: ${url}`);
      });
    });

    afterEach(() => {
      for (const definitionsDir of definitionsDirs) {
        fs.removeSync(definitionsDir);
      }
      fetchSpy.mockRestore();
      vi.resetAllMocks();
      vi.unstubAllEnvs();
    });

    it('embeds definitions with OIDC when project metadata enables Flags without SDK packages', async () => {
      const cwd = await getWriteableDirectory();
      try {
        await fs.outputJSON(join(cwd, '.vercel', 'project.json'), {
          orgId: '.',
          projectId: '.',
          settings: {
            framework: null,
            installCommand: '',
            vercelFlags: { enabledAt: 1700000000000 },
          },
        });
        await fs.writeFile(join(cwd, 'index.html'), 'hello');
        vi.stubEnv('FLAGS', undefined);
        vi.stubEnv(
          'VERCEL_OIDC_TOKEN',
          'faketoken.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJwcm9qZWN0X2lkIjoicHJvamVjdF9pZCJ9.signature'
        );
        client.cwd = cwd;
        client.setArgv('build', '--yes');

        await expect(build(client)).resolves.toBe(0);
        expect(flagsFetchCalls()).toHaveLength(1);
        expect(fs.existsSync(join(findDefinitionsDir(cwd), 'index.js'))).toBe(
          true
        );
      } finally {
        await fs.remove(cwd);
      }
    });

    it('should emit flags-definitions module with SDK key', async () => {
      vi.stubEnv('FLAGS', 'vf_server_test_fake_sdk_key_for_testing');

      client.cwd = fixture('static');
      const definitionsDir = findDefinitionsDir(client.cwd);
      client.setArgv('build', '--yes');

      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      expect(flagsFetchCalls()).toHaveLength(1);
      expect(fs.existsSync(join(definitionsDir, 'index.js'))).toBe(true);
      expect(fs.existsSync(join(definitionsDir, 'index.d.ts'))).toBe(true);
      expect(fs.existsSync(join(definitionsDir, 'package.json'))).toBe(true);
      const pkg = await fs.readJSON(join(definitionsDir, 'package.json'));
      expect(pkg.name).toBe('@vercel/flags-definitions');
      const indexJs = await fs.readFile(
        join(definitionsDir, 'index.js'),
        'utf8'
      );
      expect(indexJs).toContain('export function get(key)');
    });

    it('should not emit flags-definitions module without SDK key and flags dependencies', async () => {
      client.cwd = fixture('static');
      const definitionsDir = findDefinitionsDir(client.cwd);
      client.setArgv('build', '--yes');

      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      expect(flagsFetchCalls()).toHaveLength(0);
      expect(fs.existsSync(join(definitionsDir, 'index.js'))).toBe(false);
    });

    it('should not emit flags-definitions module with SDK key when VERCEL_FLAGS_DISABLE_DEFINITION_EMBEDDING=1', async () => {
      vi.stubEnv('FLAGS', 'vf_server_test_fake_sdk_key_for_testing');
      vi.stubEnv('VERCEL_FLAGS_DISABLE_DEFINITION_EMBEDDING', '1');

      client.cwd = fixture('with-vercel-flags');
      const definitionsDir = findDefinitionsDir(client.cwd);
      client.setArgv('build', '--yes');

      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      expect(flagsFetchCalls()).toHaveLength(0);
      expect(fs.existsSync(join(definitionsDir, 'index.js'))).toBe(false);
    });

    it('should emit flags-definitions module with SDK key when VERCEL_FLAGS_EMBED_DEFINITIONS=force-on', async () => {
      vi.stubEnv('FLAGS', 'vf_server_test_fake_sdk_key_for_testing');
      vi.stubEnv('VERCEL_FLAGS_EMBED_DEFINITIONS', 'force-on');

      client.cwd = fixture('static');
      const definitionsDir = findDefinitionsDir(client.cwd);
      client.setArgv('build', '--yes');

      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      expect(flagsFetchCalls()).toHaveLength(1);
      expect(fs.existsSync(join(definitionsDir, 'index.js'))).toBe(true);
    });

    it('should not emit flags-definitions module with SDK key when VERCEL_FLAGS_EMBED_DEFINITIONS=force-off', async () => {
      vi.stubEnv('FLAGS', 'vf_server_test_fake_sdk_key_for_testing');
      vi.stubEnv('VERCEL_FLAGS_EMBED_DEFINITIONS', 'force-off');

      client.cwd = fixture('static');
      const definitionsDir = findDefinitionsDir(client.cwd);
      client.setArgv('build', '--yes');

      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      expect(flagsFetchCalls()).toHaveLength(0);
      expect(fs.existsSync(join(definitionsDir, 'index.js'))).toBe(false);
    });

    it('should emit flags-definitions module with OIDC when VERCEL_FLAGS_EMBED_DEFINITIONS=force-on', async () => {
      vi.stubEnv(
        'VERCEL_OIDC_TOKEN',
        'faketoken.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJwcm9qZWN0X2lkIjoicHJvamVjdF9pZCJ9.signature'
      );
      vi.stubEnv('VERCEL_FLAGS_EMBED_DEFINITIONS', 'force-on');

      client.cwd = fixture('with-vercel-flags');
      const definitionsDir = findDefinitionsDir(client.cwd);
      client.setArgv('build', '--yes');

      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      expect(flagsFetchCalls()).toHaveLength(1);
      expect(fs.existsSync(join(definitionsDir, 'index.js'))).toBe(true);
    });

    it('should not emit flags-definitions module with OIDC when VERCEL_FLAGS_EMBED_DEFINITIONS=force-off', async () => {
      vi.stubEnv(
        'VERCEL_OIDC_TOKEN',
        'faketoken.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJwcm9qZWN0X2lkIjoicHJvamVjdF9pZCJ9.signature'
      );
      vi.stubEnv('VERCEL_FLAGS_EMBED_DEFINITIONS', 'force-off');

      client.cwd = fixture('with-vercel-flags');
      const definitionsDir = findDefinitionsDir(client.cwd);
      client.setArgv('build', '--yes');

      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      expect(flagsFetchCalls()).toHaveLength(0);
      expect(fs.existsSync(join(definitionsDir, 'index.js'))).toBe(false);
    });

    it('should emit flags-definitions module with OIDC and flags dependencies', async () => {
      vi.stubEnv('FLAGS', undefined);
      vi.stubEnv(
        'VERCEL_OIDC_TOKEN',
        'faketoken.eyJzdWIiOiIxMjM0NTY3ODkwIiwiaWF0IjoxNTE2MjM5MDIyLCJwcm9qZWN0X2lkIjoicHJvamVjdF9pZCJ9.signature'
      );

      client.cwd = fixture('with-vercel-flags');
      const definitionsDir = findDefinitionsDir(client.cwd);
      client.setArgv('build', '--yes');

      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      expect(flagsFetchCalls()).toHaveLength(1);
      expect(fs.existsSync(join(definitionsDir, 'index.js'))).toBe(true);
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

  it.each([
    '0',
    '1',
  ])('should detect framework from the monorepo app containing the output directory with NEXT_ENABLE_ADAPTER=%s', async nextEnableAdapter => {
    process.env.NEXT_ENABLE_ADAPTER = nextEnableAdapter;

    try {
      const cwd = fixture('monorepo-nested-output-framework');
      const output = join(cwd, '.vercel/output');
      client.cwd = cwd;
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const config = await fs.readJSON(join(output, 'config.json'));
      expect(config.framework).toEqual({
        slug: 'nextjs',
        version: '16.3.4',
      });
    } finally {
      delete process.env.NEXT_ENABLE_ADAPTER;
    }
  });

  it('should create symlinks for duplicate references to Lambda / EdgeFunction instances', async () => {
    if (process.platform === 'win32') {
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

  describe('Next.js with root api', () => {
    it('should not add catch-all /api 404 so dynamic App Router routes work in production', async () => {
      const files = ['package.json', 'pages/index.js', 'api/legacy.js'];
      const pkg = {
        scripts: { build: 'next build' },
        devDependencies: { next: '13' },
      };
      const { rewriteRoutes } = await detectBuilders(files, pkg, {
        featHandleMiss: true,
        projectSettings: { framework: 'nextjs' },
      });
      const catchAllApi404 = rewriteRoutes?.find(
        (r: { src?: string; status?: number }) =>
          r.src === '^/api(/.*)?$' && r.status === 404
      );
      expect(catchAllApi404).toBeUndefined();
    });
  });

  describe('--standalone flag', () => {
    it('should convert FileFsRef to FileBlob when --standalone is used', async () => {
      const cwd = fixture('node');
      const output = join(cwd, '.vercel/output');
      client.cwd = cwd;
      client.setArgv('build', '--standalone');
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // Check that functions were created
      const functions = await fs.readdir(join(output, 'functions/api'));
      expect(functions.sort()).toEqual([
        'es6.func',
        'index.func',
        'mjs.func',
        'typescript.func',
      ]);

      // Check that vc-config.json files exist and don't have filePathMap after standalone processing
      for (const funcDir of functions) {
        const vcConfigPath = join(
          output,
          'functions/api',
          funcDir,
          '.vc-config.json'
        );
        const vcConfig = await fs.readJSON(vcConfigPath);

        // After standalone processing, filePathMap should be null (no file references)
        expect(vcConfig.filePathMap).toBeUndefined();

        // Check that the function files are present in the function directory
        const funcFiles = await fs.readdir(
          join(output, 'functions/api', funcDir)
        );
        expect(funcFiles).toContain('.vc-config.json');
        // The actual function files should be inlined as FileBlob, so we should see more than just the config
        expect(funcFiles.length).toBeGreaterThan(1);
      }
    });

    it('should work with static builds and --standalone flag', async () => {
      const cwd = fixture('static');
      const output = join(cwd, '.vercel/output');
      client.cwd = cwd;
      client.setArgv('build', '--standalone');
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      // Static builds should work normally with standalone flag
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
  });

  describe('deploymentId validation', () => {
    const staticFixture = fixture('static');
    const generatedFiles = ['build.mjs', 'package.json', 'vercel.json'];

    afterEach(async () => {
      // Clean up generated files from the static fixture
      await Promise.all(
        generatedFiles.map(file =>
          fs.remove(join(staticFixture, file)).catch(() => {})
        )
      );
    });

    it('should allow deploymentId without dpl_ prefix in config.json', async () => {
      const cwd = fixture('static');

      // Create a build script that creates config.json with valid deploymentId
      // This simulates a builder using Build Output API that creates a valid config.json
      const buildScript = join(cwd, 'build.mjs');
      await fs.writeFile(
        buildScript,
        `import fs from 'fs';
import { join } from 'path';

const outputDir = join(process.cwd(), '.vercel', 'output');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  join(outputDir, 'config.json'),
  JSON.stringify({
    version: 3,
    deploymentId: 'my-deployment-123',
  }, null, 2)
);
`
      );

      // Create package.json with build script
      await fs.writeJSON(join(cwd, 'package.json'), {
        scripts: {
          build: 'node build.mjs',
        },
      });

      // Create vercel.json to use the build script
      await fs.writeJSON(join(cwd, 'vercel.json'), {
        builds: [
          {
            src: 'package.json',
            use: '@vercel/static-build',
          },
        ],
      });

      client.cwd = cwd;
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);
    });

    it('should reject deploymentId with invalid characters (spaces) in config.json', async () => {
      const cwd = fixture('static');
      const output = join(cwd, '.vercel/output');

      const buildScript = join(cwd, 'build.mjs');
      await fs.writeFile(
        buildScript,
        `import fs from 'fs';
import { join } from 'path';

const outputDir = join(process.cwd(), '.vercel', 'output');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  join(outputDir, 'config.json'),
  JSON.stringify({
    version: 3,
    deploymentId: 'my deployment id',
  }, null, 2)
);
`
      );

      await fs.writeJSON(join(cwd, 'package.json'), {
        scripts: {
          build: 'node build.mjs',
        },
      });

      await fs.writeJSON(join(cwd, 'vercel.json'), {
        builds: [
          {
            src: 'package.json',
            use: '@vercel/static-build',
          },
        ],
      });

      client.cwd = cwd;
      const exitCode = await build(client);
      expect(exitCode).toEqual(1);

      await expect(client.stderr).toOutput(
        'contains invalid characters. Only alphanumeric characters'
      );

      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds.error).toMatchObject({
        code: 'INVALID_DEPLOYMENT_ID',
        message: expect.stringContaining('contains invalid characters'),
      });
    });

    it('should reject deploymentId with invalid characters (question mark) in config.json', async () => {
      const cwd = fixture('static');
      const output = join(cwd, '.vercel/output');

      const buildScript = join(cwd, 'build.mjs');
      await fs.writeFile(
        buildScript,
        `import fs from 'fs';
import { join } from 'path';

const outputDir = join(process.cwd(), '.vercel', 'output');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  join(outputDir, 'config.json'),
  JSON.stringify({
    version: 3,
    deploymentId: 'my-deployment?id=123',
  }, null, 2)
);
`
      );

      await fs.writeJSON(join(cwd, 'package.json'), {
        scripts: {
          build: 'node build.mjs',
        },
      });

      await fs.writeJSON(join(cwd, 'vercel.json'), {
        builds: [
          {
            src: 'package.json',
            use: '@vercel/static-build',
          },
        ],
      });

      client.cwd = cwd;
      const exitCode = await build(client);
      expect(exitCode).toEqual(1);

      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds.error).toMatchObject({
        code: 'INVALID_DEPLOYMENT_ID',
        message: expect.stringContaining('contains invalid characters'),
      });
    });

    it('should allow deploymentId with valid characters (base62 + hyphen + underscore) in config.json', async () => {
      const cwd = fixture('static');

      const buildScript = join(cwd, 'build.mjs');
      await fs.writeFile(
        buildScript,
        `import fs from 'fs';
import { join } from 'path';

const outputDir = join(process.cwd(), '.vercel', 'output');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  join(outputDir, 'config.json'),
  JSON.stringify({
    version: 3,
    deploymentId: 'my-deployment_v2-abc123XYZ',
  }, null, 2)
);
`
      );

      await fs.writeJSON(join(cwd, 'package.json'), {
        scripts: {
          build: 'node build.mjs',
        },
      });

      await fs.writeJSON(join(cwd, 'vercel.json'), {
        builds: [
          {
            src: 'package.json',
            use: '@vercel/static-build',
          },
        ],
      });

      client.cwd = cwd;
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);
    });

    it('should reject deploymentId longer than 32 characters in config.json', async () => {
      const cwd = fixture('static');
      const output = join(cwd, '.vercel/output');

      // Create a build script that creates config.json with deploymentId > 32 chars
      const buildScript = join(cwd, 'build.mjs');
      await fs.writeFile(
        buildScript,
        `import fs from 'fs';
import { join } from 'path';

const outputDir = join(process.cwd(), '.vercel', 'output');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  join(outputDir, 'config.json'),
  JSON.stringify({
    version: 3,
    deploymentId: 'this-is-a-very-long-deployment-id-that-exceeds-32-chars',
  }, null, 2)
);
`
      );

      // Create package.json with build script
      await fs.writeJSON(join(cwd, 'package.json'), {
        scripts: {
          build: 'node build.mjs',
        },
      });

      // Create vercel.json to use the build script
      await fs.writeJSON(join(cwd, 'vercel.json'), {
        builds: [
          {
            src: 'package.json',
            use: '@vercel/static-build',
          },
        ],
      });

      client.cwd = cwd;
      const exitCode = await build(client);
      expect(exitCode).toEqual(1);

      await expect(client.stderr).toOutput(
        'must be 32 characters or less. Please choose a shorter deploymentId in your config'
      );

      const builds = await fs.readJSON(join(output, 'builds.json'));
      expect(builds.error).toMatchObject({
        code: 'INVALID_DEPLOYMENT_ID',
        message: expect.stringContaining('must be 32 characters or less'),
      });
    });

    it('should allow deploymentId with exactly 32 characters in config.json', async () => {
      const cwd = fixture('static');

      // Create a build script that creates config.json with exactly 32 character deploymentId
      const buildScript = join(cwd, 'build.mjs');
      await fs.writeFile(
        buildScript,
        `import fs from 'fs';
import { join } from 'path';

const outputDir = join(process.cwd(), '.vercel', 'output');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  join(outputDir, 'config.json'),
  JSON.stringify({
    version: 3,
    deploymentId: '12345678901234567890123456789012',
  }, null, 2)
);
`
      );

      // Create package.json with build script
      await fs.writeJSON(join(cwd, 'package.json'), {
        scripts: {
          build: 'node build.mjs',
        },
      });

      // Create vercel.json to use the build script
      await fs.writeJSON(join(cwd, 'vercel.json'), {
        builds: [
          {
            src: 'package.json',
            use: '@vercel/static-build',
          },
        ],
      });

      client.cwd = cwd;
      const exitCode = await build(client);
      expect(exitCode).toEqual(0);
    });
  });

  describe('non-interactive mode', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('outputs error JSON when project settings missing and --yes not set', async () => {
      const projectSettingsModule = await import(
        '../../src/util/projects/project-settings'
      );
      vi.spyOn(projectSettingsModule, 'readProjectSettings').mockResolvedValue(
        null
      );
      vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        throw new Error('exit');
      }) as () => never);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const cwd = fixture('static');
      client.cwd = cwd;
      client.nonInteractive = true;
      client.setArgv('build');

      const exitCodePromise = build(client);

      await expect(exitCodePromise).resolves.toBe(1);
      expect(logSpy).toHaveBeenCalled();
      const payload = JSON.parse(
        logSpy.mock.calls[logSpy.mock.calls.length - 1][0]
      );
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'project_settings_required',
        message: expect.stringMatching(/project settings|pull/),
        next: expect.any(Array),
      });
      expect(
        payload.next.some((n: { command: string }) =>
          n.command.includes('pull')
        )
      ).toBe(true);
    });

    it.each([
      ['--prod', 'production'],
      ['--environment=staging', 'staging'],
      ['--target=staging', 'staging'],
    ])('preserves project and %s in settings recovery commands', async (targetFlag, target) => {
      const cwd = await getWriteableDirectory();
      useUser();
      useTeams('team_dummy');
      vi.spyOn(linkModule, 'getLinkedProject').mockResolvedValue({
        status: 'linked',
        project: { ...defaultProject, name: 'existing-project' },
        org: { type: 'team', id: 'team_dummy', slug: 'team-dummy' },
      });
      client.cwd = cwd;
      client.nonInteractive = true;
      client.setArgv(
        'build',
        '--project=existing-project',
        targetFlag,
        '--scope=team-dummy'
      );
      vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await expect(build(client)).resolves.toBe(1);

      const payload = JSON.parse(logSpy.mock.calls.at(-1)![0]);
      expect(payload.reason).toBe('project_settings_required');
      expect(payload.next[0].command).toContain('--project=existing-project');
      expect(payload.next[0].command).toContain(`--environment ${target}`);
      expect(payload.next[1].command).toContain('--project=existing-project');
      expect(payload.next[1].command).toContain(`--environment ${target}`);
      for (const next of payload.next) {
        expect(next.command).toContain('--scope=team-dummy');
      }
    });

    it('preserves project and target after a build failure', async () => {
      const dotenv = (await import('dotenv')).default;
      vi.spyOn(dotenv, 'config').mockImplementation(() => {
        throw new Error('build environment unavailable');
      });
      vi.spyOn(linkModule, 'getLinkedProject').mockResolvedValue({
        status: 'linked',
        project: { ...defaultProject, name: 'existing-project' },
        org: { type: 'team', id: 'team_dummy', slug: 'team-dummy' },
      });
      client.cwd = fixture('static');
      client.nonInteractive = true;
      client.setArgv(
        'build',
        '--project',
        'existing-project',
        '--prod',
        '--token',
        'test-secret'
      );

      expect(await build(client)).toBe(1);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.reason).toBe('build_failed');
      expect(
        payload.next.map((next: { command: string }) => next.command)
      ).toEqual([
        'vercel pull --yes --environment production --project existing-project',
        'vercel build --yes --environment production --project existing-project',
      ]);
      expect(JSON.stringify(payload.next)).not.toContain('test-secret');
    });

    it('outputs success JSON when build completes', async () => {
      const cwd = fixture('static');
      const outputDir = join(cwd, '.vercel/output');
      client.cwd = cwd;
      client.nonInteractive = true;
      client.setArgv('build');

      const exitCode = await build(client);
      expect(exitCode).toEqual(0);

      const stdout = client.stdout.getFullOutput();
      const payload = JSON.parse(stdout);
      expect(payload).toMatchObject({
        status: 'ok',
        outputDir,
        target: 'preview',
        message: expect.stringMatching(/completed/),
        next: expect.any(Array),
      });
      expect(
        payload.next.some((n: { command: string }) =>
          n.command.includes('deploy')
        )
      ).toBe(true);
    });
  });

  it('should install a service with its own install root when a source config pre-compilation install ran', async () => {
    // Regression test: `vercel.toml` (a source config) triggers a dependency
    // install at the repo root before config compilation, which sets
    // VERCEL_INSTALL_COMPLETED. That marker must not suppress the install of
    // a service whose install root is a different `package.json` — here the
    // service's build script requires a dependency that only exists after
    // `frontend/` installs.
    const cwd = fixture('services-toml-workspace-install');
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toEqual(0);

    const result = await fs.readFile(
      join(output, 'services', 'web', 'static', 'index.txt'),
      'utf8'
    );
    expect(result.trim()).toEqual('installed');
  });

  it('should allow services to share the same builder source', async () => {
    const cwd = fixture('with-services-shared-source');
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config.services).toHaveLength(2);
    expect(config.services.map((s: any) => s.name).sort()).toEqual([
      'worker-topic1',
      'worker-topic2',
    ]);
  });

  it('should normalize vercel.json services to the V2 build output wire format', async () => {
    const cwd = await getWriteableDirectory();
    const output = join(cwd, '.vercel', 'output');
    await fs.ensureDir(join(cwd, '.vercel'));
    await fs.writeJSON(join(cwd, '.vercel', 'project.json'), {
      orgId: '.',
      projectId: '.',
      settings: {
        framework: null,
        installCommand: '',
      },
    });
    await fs.writeJSON(join(cwd, 'package.json'), {
      private: true,
    });
    await fs.writeJSON(join(cwd, 'vercel.json'), {
      services: {
        ui: {
          root: '.',
          entrypoint: 'ui.js',
          runtime: 'node',
          rewrites: [{ source: '/(.*)', destination: '/$1' }],
        },
        backend: {
          root: '.',
          entrypoint: 'backend.js',
          runtime: 'node',
          rewrites: [{ source: '/backend/(.*)', destination: '/$1' }],
        },
      },
    });
    const server = `
const { createServer } = require('node:http');

createServer((_req, res) => {
  res.statusCode = 200;
  res.end('ok');
}).listen(3000);
`;
    await fs.outputFile(join(cwd, 'ui.js'), server);
    await fs.outputFile(join(cwd, 'backend.js'), server);

    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    // `experimentalServicesV2` services are recorded in the `services` array,
    // each tagged with its `schema` discriminant so consumers can tell V1 from
    // V2 records.
    expect(config.services).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          schema: 'experimentalServicesV2',
          name: 'ui',
          runtime: 'node',
        }),
        expect.objectContaining({
          schema: 'experimentalServicesV2',
          name: 'backend',
          runtime: 'node',
        }),
      ])
    );
    expect(config.experimentalServicesV2).toEqual({
      backend: expect.objectContaining({
        root: '.',
        runtime: 'node',
        rewrites: [{ source: '/backend/(.*)', destination: '/$1' }],
      }),
      ui: expect.objectContaining({
        root: '.',
        runtime: 'node',
        rewrites: [{ source: '/(.*)', destination: '/$1' }],
      }),
    });
    expect(config.routes).toBeUndefined();
    expect(
      await fs.pathExists(
        join(output, 'services/ui/functions/index.func/.vc-config.json')
      )
    ).toBe(true);
    expect(
      await fs.pathExists(
        join(output, 'services/backend/functions/index.func/.vc-config.json')
      )
    ).toBe(true);
    const uiConfig = await fs.readJSON(join(output, 'services/ui/config.json'));
    expect(uiConfig.routes).toEqual(
      expect.arrayContaining([
        { handle: 'filesystem' },
        expect.objectContaining({ dest: '/$1', check: true }),
        expect.objectContaining({ dest: '/index' }),
      ])
    );
    const backendConfig = await fs.readJSON(
      join(output, 'services/backend/config.json')
    );
    expect(backendConfig.routes).toEqual(
      expect.arrayContaining([
        { handle: 'filesystem' },
        expect.objectContaining({ dest: '/$1', check: true }),
        expect.objectContaining({ dest: '/index' }),
      ])
    );
    expect(await fs.pathExists(join(output, 'functions'))).toBe(false);
  });

  it('should build a top-level `proxy` alongside services', async () => {
    const cwd = await getWriteableDirectory();
    const output = join(cwd, '.vercel', 'output');
    await fs.ensureDir(join(cwd, '.vercel'));
    await fs.writeJSON(join(cwd, '.vercel', 'project.json'), {
      orgId: '.',
      projectId: '.',
      settings: {
        framework: null,
        installCommand: '',
      },
    });
    await fs.writeJSON(join(cwd, 'package.json'), {
      private: true,
    });
    await fs.writeJSON(join(cwd, 'vercel.json'), {
      services: {
        ui: { root: '.', entrypoint: 'ui.js', runtime: 'node' },
      },
      rewrites: [{ source: '/(.*)', destination: { service: 'ui' } }],
      proxy: { entrypoint: 'proxy.js' },
    });
    await fs.outputFile(
      join(cwd, 'ui.js'),
      `
const { createServer } = require('node:http');

createServer((_req, res) => {
  res.statusCode = 200;
  res.end('ok');
}).listen(3000);
`
    );
    await fs.outputFile(
      join(cwd, 'proxy.js'),
      `module.exports = function proxy() { return new Response('proxy'); };\n`
    );

    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    // The proxy is a project-level function, not a service.
    expect(await fs.readdir(join(output, 'functions'))).toEqual(['proxy.func']);
    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config.services).toEqual([
      expect.objectContaining({
        schema: 'experimentalServicesV2',
        name: 'ui',
      }),
    ]);
    // The proxy runs before the filesystem phase, so it sees requests ahead of
    // the rewrites that hand traffic to a service.
    expect(config.routes).toEqual([
      expect.objectContaining({ middlewarePath: 'proxy', continue: true }),
      { handle: 'filesystem' },
      expect.objectContaining({
        destination: { service: 'ui', type: 'service' },
      }),
    ]);
  });

  it('should apply per-service `functions` config to the service lambda', async () => {
    const cwd = await getWriteableDirectory();
    const output = join(cwd, '.vercel', 'output');
    await fs.ensureDir(join(cwd, '.vercel'));
    await fs.writeJSON(join(cwd, '.vercel', 'project.json'), {
      orgId: '.',
      projectId: '.',
      settings: {
        framework: null,
        installCommand: '',
      },
    });
    await fs.writeJSON(join(cwd, 'package.json'), {
      private: true,
    });
    await fs.writeJSON(join(cwd, 'vercel.json'), {
      services: {
        worker: {
          root: '.',
          entrypoint: 'index.js',
          runtime: 'node',
          functions: {
            'index.js': {
              maxDuration: 30,
              experimentalTriggers: [{ type: 'queue/v2beta', topic: 'orders' }],
            },
          },
        },
      },
    });
    await fs.outputFile(
      join(cwd, 'index.js'),
      `
const { createServer } = require('node:http');

createServer((_req, res) => {
  res.statusCode = 200;
  res.end('ok');
}).listen(3000);
`
    );

    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const vcConfig = await fs.readJSON(
      join(output, 'services/worker/functions/index.func/.vc-config.json')
    );
    expect(vcConfig.maxDuration).toBe(30);
    // Consumer is scoped by service name so it stays unique across services.
    expect(vcConfig.experimentalTriggers).toEqual([
      {
        type: 'queue/v2beta',
        topic: 'orders',
        consumer: sanitizeConsumerName('worker~index.js'),
      },
    ]);
  });

  it('should build experimentalServices discovered from generated Build Output config', async () => {
    const cwd = await getWriteableDirectory();
    const output = join(cwd, '.vercel', 'output');
    await fs.ensureDir(join(cwd, '.vercel'));
    await fs.writeJSON(join(cwd, '.vercel', 'project.json'), {
      orgId: '.',
      projectId: '.',
      settings: {
        framework: null,
        installCommand: '',
      },
    });
    await fs.writeJSON(join(cwd, 'package.json'), {
      scripts: {
        build: 'node build.mjs',
      },
    });
    await fs.outputFile(
      join(cwd, 'build.mjs'),
      `
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const countPath = join(process.cwd(), 'build-count.txt');
const count = existsSync(countPath) ? Number(readFileSync(countPath, 'utf8')) : 0;
writeFileSync(countPath, String(count + 1));

const outputDir = join(process.cwd(), '.vercel', 'output');
mkdirSync(join(outputDir, 'static'), { recursive: true });
writeFileSync(join(outputDir, 'static', 'index.html'), 'ok');
writeFileSync(
  join(outputDir, 'config.json'),
  JSON.stringify({
    version: 3,
    routes: [{ handle: 'filesystem' }],
    experimentalServices: {
      web: {
        type: 'web',
        root: '.',
        framework: 'vite',
        entrypoint: 'package.json',
        mount: '/'
      },
      processor: {
        type: 'job',
        trigger: 'queue',
        root: '.',
        entrypoint: 'worker.js',
        runtime: 'node',
        topics: ['jobs']
      }
    }
  }, null, 2)
);
`
    );
    await fs.outputFile(
      join(cwd, 'worker.js'),
      `
const { createServer } = require('node:http');

createServer((_req, res) => {
  res.statusCode = 200;
  res.end('ok');
}).listen(3000);
`
    );

    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config.experimentalServices).toEqual({
      processor: expect.objectContaining({
        type: 'job',
        trigger: 'queue',
        entrypoint: 'worker.js',
      }),
      web: expect.objectContaining({
        type: 'web',
        framework: 'vite',
        mount: '/',
      }),
    });
    expect(config.services).toBeUndefined();
    expect(await fs.readFile(join(cwd, 'build-count.txt'), 'utf8')).toBe('1');
    expect(
      await fs.pathExists(
        join(output, 'functions/_svc/processor/index.func/.vc-config.json')
      )
    ).toBe(true);
  });

  it('should preserve phased Build Output routes when no services are generated', async () => {
    const cwd = await getWriteableDirectory();
    const output = join(cwd, '.vercel', 'output');
    const routes = [
      {
        src: '^/(?<path>.+?)(?:/)?$',
        dest: '/$path.segments/$segmentPath.segment.rsc',
        has: [
          {
            type: 'header',
            key: 'next-router-segment-prefetch',
            value: '/(?<segmentPath>.+)',
          },
        ],
        continue: true,
      },
      { handle: 'filesystem' },
      { src: '^/index\\.rsc$', dest: '/', continue: true },
      { handle: 'miss' },
      {
        src: '^/(?<path>.+)\\.segments/.+\\.segment\\.rsc$',
        dest: '/$path.rsc',
        check: true,
      },
    ];
    await fs.ensureDir(join(cwd, '.vercel'));
    await fs.writeJSON(join(cwd, '.vercel', 'project.json'), {
      orgId: '.',
      projectId: '.',
      settings: { framework: null, installCommand: '' },
    });
    await fs.writeJSON(join(cwd, 'package.json'), {
      private: true,
      scripts: { build: 'node build.mjs' },
    });
    await fs.writeFile(
      join(cwd, 'build.mjs'),
      [
        `import fs from 'node:fs';`,
        `import path from 'node:path';`,
        `const out = path.join(process.cwd(), '.vercel', 'output');`,
        `fs.mkdirSync(path.join(out, 'static'), { recursive: true });`,
        `fs.writeFileSync(path.join(out, 'static', 'index.html'), 'ok');`,
        `fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify({`,
        `  version: 3,`,
        `  routes: ${JSON.stringify(routes)},`,
        `}));`,
      ].join('\n')
    );

    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    const routeIndexes = routes.map(expected => {
      const matches = config.routes
        .map((actual: unknown, index: number) =>
          JSON.stringify(actual) === JSON.stringify(expected) ? index : -1
        )
        .filter((index: number) => index !== -1);
      expect(matches).toHaveLength(1);
      return matches[0];
    });
    expect(routeIndexes).toEqual([...routeIndexes].sort((a, b) => a - b));
    expect(config.services).toBeUndefined();
    expect(config.experimentalServicesV2).toBeUndefined();
  });

  it('should keep generated output at root and include nested service crons', async () => {
    const cwd = await getWriteableDirectory();
    const output = join(cwd, '.vercel', 'output');
    await fs.ensureDir(join(cwd, '.vercel'));
    await fs.writeJSON(join(cwd, '.vercel', 'project.json'), {
      orgId: '.',
      projectId: '.',
      settings: {
        framework: null,
        installCommand: '',
      },
    });
    await fs.writeJSON(join(cwd, 'package.json'), {
      private: true,
      scripts: {
        build: 'node build.mjs',
      },
    });
    await fs.writeJSON(join(cwd, 'vercel.json'), {
      rewrites: [{ source: '/docs/(.*)', destination: '/$1' }],
    });
    await fs.outputFile(
      join(cwd, 'build.mjs'),
      `
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const countPath = join(process.cwd(), 'build-count.txt');
const count = existsSync(countPath) ? Number(readFileSync(countPath, 'utf8')) : 0;
writeFileSync(countPath, String(count + 1));

const immutableEnvVars = [
  'VERCEL_IMMUTABLE_STATIC_FILES_ENABLED'
];
writeFileSync(
  join(process.cwd(), 'root-immutable-env.json'),
  JSON.stringify(
    Object.fromEntries(
      immutableEnvVars.map(name => [name, process.env[name] ?? null])
    ),
    null,
    2
  )
);

const outputDir = join(process.cwd(), '.vercel', 'output');
mkdirSync(outputDir, { recursive: true });
const staticDir = join(outputDir, 'static');
mkdirSync(staticDir, { recursive: true });
writeFileSync(join(staticDir, 'index.html'), 'root output');
writeFileSync(
  join(outputDir, 'config.json'),
  JSON.stringify({
    version: 3,
    routes: [
      { src: '/generated/(.*)', dest: '/generated-output/$1' },
      { src: '/backend/(.*)', service: 'backend' },
      { src: '/ui/(.*)', service: 'ui' }
    ],
    experimentalServicesV2: {
      ui: {
        root: '.',
        entrypoint: 'package.json',
        framework: 'vite',
        rewrites: [{ source: '/(.*)', destination: '/$1' }]
      },
      backend: {
        root: 'backend',
        entrypoint: 'package.json',
        framework: 'vite',
        rewrites: [{ source: '/backend/(.*)', destination: '/$1' }]
      }
    }
  }, null, 2)
);
`
    );
    await fs.outputJSON(join(cwd, 'backend', 'package.json'), {
      private: true,
      scripts: {
        build: 'node build.mjs',
      },
    });
    await fs.outputFile(
      join(cwd, 'backend', 'build.mjs'),
      `
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const immutableEnvVars = [
  'VERCEL_IMMUTABLE_STATIC_FILES_ENABLED'
];
const immutableEnvValues = Object.fromEntries(
  immutableEnvVars.map(name => [name, process.env[name] ?? null])
);
writeFileSync(
  join(process.cwd(), 'service-immutable-env.json'),
  JSON.stringify(immutableEnvValues, null, 2)
);
const leakedImmutableEnvVars = Object.entries(immutableEnvValues)
  .filter(([, value]) => value !== null)
  .map(([name]) => name);
if (leakedImmutableEnvVars.length > 0) {
  throw new Error(
    'Immutable env leaked into service build: ' + leakedImmutableEnvVars.join(', ')
  );
}

const outputDir = join(process.cwd(), '.vercel', 'output');
const staticDir = join(outputDir, 'static');
mkdirSync(staticDir, { recursive: true });
writeFileSync(join(staticDir, 'backend.html'), 'backend output');
writeFileSync(
  join(outputDir, 'config.json'),
  JSON.stringify({
    version: 3,
    crons: [{ path: '/backend/cron', schedule: '0 * * * *' }]
  }, null, 2)
);
`
    );

    const immutableEnvVars = ['VERCEL_IMMUTABLE_STATIC_FILES_ENABLED'];
    const originalImmutableEnv = new Map(
      immutableEnvVars.map(name => [name, process.env[name]])
    );

    try {
      for (const name of immutableEnvVars) {
        process.env[name] = '1';
      }

      client.cwd = cwd;
      const exitCode = await build(client);
      expect(exitCode).toBe(0);
      await expect(client.stderr).toOutput(
        'Detected already-built service "ui" from lazily generated `.vercel/output/config.json` (framework: vite, entrypoint: package.json). It will not be treated as a service because its build output already exists at the top level. Configure it in `vercel.json` as a `services` entry to remove this warning.'
      );

      const config = await fs.readJSON(join(output, 'config.json'));
      // Only services actually treated as services are recorded in the
      // `services` array. `ui` was already built at the root and skipped (see
      // the warning asserted above), so it must NOT appear here; only the newly
      // nested `backend` service is recorded, tagged with its `schema`.
      expect(config.services).toEqual([
        expect.objectContaining({
          schema: 'experimentalServicesV2',
          name: 'backend',
        }),
      ]);
      expect(config.services).not.toContainEqual(
        expect.objectContaining({ name: 'ui' })
      );
      expect(config.experimentalServices).toBeUndefined();
      expect(config.experimentalServicesV2).toEqual({
        backend: expect.objectContaining({
          root: 'backend',
          framework: 'vite',
          rewrites: [{ source: '/backend/(.*)', destination: '/$1' }],
        }),
        ui: expect.objectContaining({
          root: '.',
          framework: 'vite',
          rewrites: [{ source: '/(.*)', destination: '/$1' }],
        }),
      });
      expect(config.routes).toEqual(
        expect.arrayContaining([
          { handle: 'filesystem' },
          { src: '/generated/(.*)', dest: '/generated-output/$1' },
          { src: '/backend/(.*)', service: 'backend' },
          { src: '/ui/(.*)', service: 'ui' },
          expect.objectContaining({ dest: '/$1', check: true }),
        ])
      );
      expect(
        config.routes.filter(
          (route: { handle?: string }) => route.handle === 'filesystem'
        )
      ).toHaveLength(1);
      expect(
        config.routes.filter(
          (route: { src?: string }) => route.src === '/generated/(.*)'
        )
      ).toHaveLength(1);
      expect(config.crons).toEqual([
        { path: '/backend/cron', schedule: '0 * * * *' },
      ]);
      expect(await fs.readFile(join(cwd, 'build-count.txt'), 'utf8')).toBe('1');
      expect(await fs.readJSON(join(cwd, 'root-immutable-env.json'))).toEqual(
        Object.fromEntries(immutableEnvVars.map(name => [name, '1']))
      );
      expect(
        await fs.readJSON(join(cwd, 'backend', 'service-immutable-env.json'))
      ).toEqual(Object.fromEntries(immutableEnvVars.map(name => [name, null])));
      expect(await fs.readFile(join(output, 'static/index.html'), 'utf8')).toBe(
        'root output'
      );
      expect(await fs.pathExists(join(output, 'services/ui'))).toBe(false);

      const backendConfig = await fs.readJSON(
        join(output, 'services/backend/config.json')
      );
      expect(backendConfig.routes).toEqual(
        expect.arrayContaining([
          { handle: 'filesystem' },
          expect.objectContaining({ dest: '/$1', check: true }),
        ])
      );
      expect(
        backendConfig.routes.filter(
          (route: { handle?: string }) => route.handle === 'filesystem'
        )
      ).toHaveLength(1);
      expect(backendConfig.crons).toContainEqual({
        path: '/backend/cron',
        schedule: '0 * * * *',
      });
      expect(
        await fs.readFile(
          join(output, 'services/backend/static/backend.html'),
          'utf8'
        )
      ).toBe('backend output');
      expect(await fs.pathExists(join(output, 'functions'))).toBe(false);
    } finally {
      for (const [name, value] of originalImmutableEnv) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    }
  });

  it('should detect generated services from build output config', async () => {
    const cwd = await getWriteableDirectory();
    const output = join(cwd, '.vercel', 'output');
    await fs.ensureDir(join(cwd, '.vercel'));
    await fs.writeJSON(join(cwd, '.vercel', 'project.json'), {
      orgId: '.',
      projectId: '.',
      settings: {
        framework: null,
        installCommand: '',
      },
    });
    await fs.writeJSON(join(cwd, 'package.json'), {
      private: true,
      scripts: {
        build: 'node build.mjs',
      },
    });
    await fs.outputFile(
      join(cwd, 'build.mjs'),
      `
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outputDir = join(process.cwd(), '.vercel', 'output');
mkdirSync(join(outputDir, 'static'), { recursive: true });
writeFileSync(join(outputDir, 'static', 'index.html'), 'root output');
writeFileSync(
  join(outputDir, 'config.json'),
  JSON.stringify({
    version: 3,
    routes: [
      {
        src: '^/(?<path>.+?)(?:/)?$',
        dest: '/$path.segments/$segmentPath.segment.rsc',
        has: [{
          type: 'header',
          key: 'next-router-segment-prefetch',
          value: '/(?<segmentPath>.+)'
        }],
        continue: true
      },
      { src: '^/api/(.*)$', service: 'backend' },
      { handle: 'filesystem' },
      { src: '^/index\\.rsc$', dest: '/', continue: true }
    ],
    services: {
      backend: {
        root: 'backend',
        entrypoint: 'package.json',
        framework: 'vite'
      }
    }
  }, null, 2)
);
`
    );
    await fs.outputJSON(join(cwd, 'backend', 'package.json'), {
      private: true,
      scripts: {
        build: 'node build.mjs',
      },
    });
    await fs.outputFile(
      join(cwd, 'backend', 'build.mjs'),
      `
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outputDir = join(process.cwd(), '.vercel', 'output');
mkdirSync(join(outputDir, 'static'), { recursive: true });
writeFileSync(join(outputDir, 'static', 'backend.html'), 'backend output');
writeFileSync(join(outputDir, 'config.json'), JSON.stringify({ version: 3 }, null, 2));
`
    );

    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config.experimentalServicesV2).toEqual({
      backend: expect.objectContaining({
        root: 'backend',
        framework: 'vite',
      }),
    });
    expect(config.services).toEqual([
      expect.objectContaining({
        schema: 'experimentalServicesV2',
        name: 'backend',
      }),
    ]);
    expect(config.routes).toEqual(
      expect.arrayContaining([{ src: '^/api/(.*)$', service: 'backend' }])
    );
    const segmentPrefetchSrc = '^/(?<path>.+?)(?:/)?$';
    const segmentPrefetchIndexes = config.routes
      .map((route: { src?: string }, index: number) =>
        route.src === segmentPrefetchSrc ? index : -1
      )
      .filter((index: number) => index !== -1);
    const serviceRouteIndexes = config.routes
      .map((route: { src?: string }, index: number) =>
        route.src === '^/api/(.*)$' ? index : -1
      )
      .filter((index: number) => index !== -1);
    const filesystemIndexes = config.routes
      .map((route: { handle?: string }, index: number) =>
        route.handle === 'filesystem' ? index : -1
      )
      .filter((index: number) => index !== -1);
    expect(segmentPrefetchIndexes).toHaveLength(1);
    expect(serviceRouteIndexes).toHaveLength(1);
    expect(filesystemIndexes).toHaveLength(1);
    expect(segmentPrefetchIndexes[0]).toBeLessThan(serviceRouteIndexes[0]);
    expect(serviceRouteIndexes[0]).toBeLessThan(filesystemIndexes[0]);
    expect(await fs.readFile(join(output, 'static/index.html'), 'utf8')).toBe(
      'root output'
    );
    expect(
      await fs.readFile(
        join(output, 'services/backend/static/backend.html'),
        'utf8'
      )
    ).toBe('backend output');
  });

  it('should detect generated stable services routes from default output when using --output', async () => {
    const cwd = await getWriteableDirectory();
    const output = join(cwd, 'custom-output');
    await fs.ensureDir(join(cwd, '.vercel'));
    await fs.writeJSON(join(cwd, '.vercel', 'project.json'), {
      orgId: '.',
      projectId: '.',
      settings: {
        framework: null,
        installCommand: '',
      },
    });
    await fs.writeJSON(join(cwd, 'package.json'), {
      private: true,
      scripts: {
        build: 'node build.mjs',
      },
    });
    await fs.outputFile(
      join(cwd, 'build.mjs'),
      `
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outputDir = join(process.cwd(), '.vercel', 'output');
mkdirSync(join(outputDir, 'static'), { recursive: true });
writeFileSync(join(outputDir, 'static', 'index.html'), 'root output');
writeFileSync(
  join(outputDir, 'config.json'),
  JSON.stringify({
    version: 3,
    routes: [
      {
        src: '^/api/(.*)$',
        destination: {
          type: 'service',
          service: 'backend'
        }
      }
    ],
    services: {
      backend: {
        root: 'backend',
        entrypoint: 'package.json',
        framework: 'vite'
      }
    }
  }, null, 2)
);
`
    );
    await fs.outputJSON(join(cwd, 'backend', 'package.json'), {
      private: true,
      scripts: {
        build: 'node build.mjs',
      },
    });
    await fs.outputFile(
      join(cwd, 'backend', 'build.mjs'),
      `
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outputDir = join(process.cwd(), '.vercel', 'output');
mkdirSync(join(outputDir, 'static'), { recursive: true });
writeFileSync(join(outputDir, 'static', 'backend.html'), 'backend output');
writeFileSync(join(outputDir, 'config.json'), JSON.stringify({ version: 3 }, null, 2));
`
    );

    client.cwd = cwd;
    client.setArgv('build', '--output', output);
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config.experimentalServicesV2).toEqual({
      backend: expect.objectContaining({
        root: 'backend',
        framework: 'vite',
      }),
    });
    expect(config.routes).toEqual(
      expect.arrayContaining([
        {
          src: '^/api/(.*)$',
          destination: {
            type: 'service',
            service: 'backend',
          },
        },
      ])
    );
    expect(
      config.routes.filter(
        (route: { src?: string }) => route.src === '^/api/(.*)$'
      )
    ).toHaveLength(1);
    expect(await fs.readFile(join(output, 'static/index.html'), 'utf8')).toBe(
      'root output'
    );
    expect(
      await fs.readFile(
        join(output, 'services/backend/static/backend.html'),
        'utf8'
      )
    ).toBe('backend output');
  });

  it('should keep generated service routes ahead of framework routes from a separate Build Output config', async () => {
    const cwd = await getWriteableDirectory();
    const output = join(cwd, '.vercel', 'output');
    await fs.ensureDir(join(cwd, '.vercel'));
    await fs.writeJSON(join(cwd, '.vercel', 'project.json'), {
      orgId: '.',
      projectId: '.',
      settings: {
        framework: null,
        installCommand: '',
      },
    });
    await fs.writeJSON(join(cwd, 'vercel.json'), {
      builds: [{ src: 'web/package.json', use: '@vercel/static-build' }],
    });
    await fs.outputJSON(join(cwd, 'web', 'package.json'), {
      private: true,
      scripts: {
        build: 'node build.mjs',
      },
    });
    // The framework writes its own Build Output config (a catch-all, no
    // services) while a separate generated config at the project root
    // supplies the services metadata and the service handoff route.
    await fs.outputFile(
      join(cwd, 'web', 'build.mjs'),
      `
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const frameworkOutputDir = join(process.cwd(), '.vercel', 'output');
mkdirSync(join(frameworkOutputDir, 'static'), { recursive: true });
writeFileSync(join(frameworkOutputDir, 'static', 'index.html'), 'web output');
writeFileSync(
  join(frameworkOutputDir, 'config.json'),
  JSON.stringify({
    version: 3,
    routes: [{ src: '^/(.*)$', dest: '/index.html' }]
  }, null, 2)
);

const generatedOutputDir = resolve(process.cwd(), '..', '.vercel', 'output');
mkdirSync(generatedOutputDir, { recursive: true });
writeFileSync(
  join(generatedOutputDir, 'config.json'),
  JSON.stringify({
    version: 3,
    routes: [{ src: '^/api/(.*)$', service: 'backend' }],
    services: {
      backend: {
        root: 'backend',
        entrypoint: 'package.json',
        framework: 'vite'
      }
    }
  }, null, 2)
);
`
    );
    await fs.outputJSON(join(cwd, 'backend', 'package.json'), {
      private: true,
      scripts: {
        build: 'node build.mjs',
      },
    });
    await fs.outputFile(
      join(cwd, 'backend', 'build.mjs'),
      `
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outputDir = join(process.cwd(), '.vercel', 'output');
mkdirSync(join(outputDir, 'static'), { recursive: true });
writeFileSync(join(outputDir, 'static', 'backend.html'), 'backend output');
writeFileSync(join(outputDir, 'config.json'), JSON.stringify({ version: 3 }, null, 2));
`
    );

    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config.experimentalServicesV2).toEqual({
      backend: expect.objectContaining({
        root: 'backend',
        framework: 'vite',
      }),
    });
    const serviceRouteIndexes = config.routes
      .map((route: { src?: string }, index: number) =>
        route.src === '^/api/(.*)$' ? index : -1
      )
      .filter((index: number) => index !== -1);
    const catchAllIndexes = config.routes
      .map((route: { src?: string }, index: number) =>
        route.src === '^/(.*)$' ? index : -1
      )
      .filter((index: number) => index !== -1);
    expect(serviceRouteIndexes).toHaveLength(1);
    expect(catchAllIndexes).toHaveLength(1);
    expect(serviceRouteIndexes[0]).toBeLessThan(catchAllIndexes[0]);
    expect(await fs.readFile(join(output, 'static/index.html'), 'utf8')).toBe(
      'web output'
    );
    expect(
      await fs.readFile(
        join(output, 'services/backend/static/backend.html'),
        'utf8'
      )
    ).toBe('backend output');
  });

  it('should ignore generated experimentalServices when vercel.json configures experimentalServices', async () => {
    const cwd = await getWriteableDirectory();
    const output = join(cwd, '.vercel', 'output');
    await fs.ensureDir(join(cwd, '.vercel'));
    await fs.writeJSON(join(cwd, '.vercel', 'project.json'), {
      orgId: '.',
      projectId: '.',
      settings: {
        framework: null,
        installCommand: '',
      },
    });
    await fs.writeJSON(join(cwd, 'package.json'), {
      scripts: {
        build: 'node build.mjs',
      },
    });
    await fs.writeJSON(join(cwd, 'vercel.json'), {
      experimentalServices: {
        web: {
          type: 'web',
          root: '.',
          framework: 'vite',
          entrypoint: 'package.json',
          mount: '/',
        },
      },
    });
    await fs.outputFile(
      join(cwd, 'build.mjs'),
      `
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outputDir = join(process.cwd(), '.vercel', 'output');
mkdirSync(join(outputDir, 'static'), { recursive: true });
writeFileSync(join(outputDir, 'static', 'index.html'), 'ok');
writeFileSync(
  join(outputDir, 'config.json'),
  JSON.stringify({
    version: 3,
    experimentalServices: {
      generated: {
        type: 'job',
        trigger: 'queue',
        root: '.',
        entrypoint: 'missing.js',
        runtime: 'node',
        topics: ['jobs']
      }
    }
  }, null, 2)
);
`
    );

    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const config = await fs.readJSON(join(output, 'config.json'));
    expect(config.experimentalServices).toBeUndefined();
    expect(config.services.map((s: any) => s.name)).toEqual(['web']);
    expect(
      await fs.pathExists(
        join(output, 'functions/_svc/generated/index.func/.vc-config.json')
      )
    ).toBe(false);
  });

  it('should not generate catch-all routes for Python cron services', async () => {
    const cwd = fixture('with-services-python-cron-no-catchall');
    const output = join(cwd, '.vercel', 'output');
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    const config = await fs.readJSON(join(output, 'config.json'));

    // Cron routes should only match their specific /_svc/ callback paths
    const cronRoutes = (config.routes as any[]).filter(
      (r: any) =>
        typeof r.dest === 'string' &&
        (r.dest.includes('/_svc/cleanup-minute/') ||
          r.dest.includes('/_svc/cleanup-daily/'))
    );
    for (const route of cronRoutes) {
      expect(route.src).toMatch(/\/_svc\//);
    }
  });

  it('should run preDeployCommand after build succeeds', async () => {
    const cwd = fixture('with-services-pre-deploy-command');
    const sideEffectFile = join(cwd, 'pre-deploy-ran.txt');

    await fs.remove(sideEffectFile);

    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode).toBe(0);

    expect(await fs.pathExists(sideEffectFile)).toBe(true);
    expect(await fs.readFile(sideEffectFile, 'utf8')).toBe('ok');

    await fs.remove(sideEffectFile);
  });

  it('should not write trace spans for non-build commands', async () => {
    const cwd = fixture('static');
    const tracePath = join(cwd, '.vercel/output/diagnostics/cli_traces.json');

    // Remove any leftover trace file from previous test runs
    await fs.remove(tracePath);

    // Run a command that goes through index.ts but doesn't invoke build
    const cliPath = join(__dirname, '../../dist/vc.js');
    execSync(`node ${cliPath} --version`, { cwd, stdio: 'pipe' });

    // No trace file should be written
    expect(await fs.pathExists(tracePath)).toBe(false);
  });

  it('should emit expected trace spans to cli_traces.json', async () => {
    const cwd = fixture('static');
    const outputDir = join(cwd, '.vercel/output');

    // Run the full CLI entry point so index.ts writes cli_traces.json.
    // Framework detection is opt-in, so enable it to assert its spans.
    const cliPath = join(__dirname, '../../dist/vc.js');
    execSync(`node ${cliPath} build`, {
      cwd,
      stdio: 'pipe',
      env: { ...process.env, VERCEL_FRAMEWORK_DETECTION: '1' },
    });

    // Read trace events written to disk
    const tracePath = join(outputDir, 'diagnostics', 'cli_traces.json');
    const events = await fs.readJSON(tracePath);
    expect(events.length).toBeGreaterThan(0);

    // Build a parent-child tree from the trace events
    const idToName = new Map(events.map((e: any) => [e.id, e.name]));
    const spans = events.map((e: any) => ({
      name: e.name as string,
      parent: (e.parentId ? (idToName.get(e.parentId) ?? null) : null) as
        | string
        | null,
      duration: e.duration as number,
    }));

    // Every span should have a numeric duration > 0
    for (const span of spans) {
      expect(typeof span.duration).toBe('number');
      expect(span.duration).toBeGreaterThan(0);
    }

    // Check the span names and hierarchy (ignore timing values)
    const tree = spans.map(
      ({ name, parent }: { name: string; parent: string | null }) => ({
        name,
        parent,
      })
    );
    expect(tree).toEqual(
      expect.arrayContaining([
        { name: 'vc.cli', parent: null },
        { name: 'vc', parent: 'vc.cli' },
        { name: 'vc.cli.command', parent: 'vc.cli' },
        { name: 'vc.getProjectLink', parent: 'vc' },
        { name: 'vc.readProjectSettings', parent: 'vc' },
        { name: 'vc.doBuild', parent: 'vc' },
        { name: 'vc.loadEnv', parent: 'vc' },
        { name: 'vc.compileVercelConfig', parent: 'vc.doBuild' },
        { name: 'vc.readConfigInputs', parent: 'vc.doBuild' },
        { name: 'vc.detectFirstDeploymentFramework', parent: 'vc.doBuild' },
        { name: 'vc.prepareFlagsDefinitions', parent: 'vc.doBuild' },
        { name: 'vc.getFiles', parent: 'vc.doBuild' },
        { name: 'vc.detectAllFrameworks', parent: 'vc.doBuild' },
        { name: 'vc.detectBuilders', parent: 'vc.doBuild' },
        { name: 'vc.importBuilders', parent: 'vc.doBuild' },
        { name: 'vc.populateFilesMap', parent: 'vc.doBuild' },
        { name: 'vc.builder', parent: 'vc.doBuild' },
        { name: 'vc.frameworkCrossCheck', parent: 'vc.doBuild' },
        { name: 'vc.validateBuildOutput', parent: 'vc.doBuild' },
        { name: 'vc.finalizeBuildOutput', parent: 'vc.doBuild' },
        { name: 'vc.postCommand', parent: 'vc.cli' },
      ])
    );
  });

  describe('--project', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('fails fast with a clean error when the project does not exist anywhere', async () => {
      const cwd = await getWriteableDirectory();
      const getLinkedProjectSpy = vi.spyOn(linkModule, 'getLinkedProject');
      useUser();
      useTeams('team_dummy');
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('build', '--project=does-not-exist');
      const exitCodePromise = build(client);

      await expect(client.stderr).toOutput(
        'Project "does-not-exist" was not found'
      );
      const exitCode = await exitCodePromise;
      expect(exitCode, 'exit code for "build"').toEqual(1);
      expect(getLinkedProjectSpy).toHaveBeenCalledWith(client, {
        cwd: await fs.realpath(cwd),
        projectName: 'does-not-exist',
        projectNameIsExplicit: true,
        scopeIsExplicit: false,
      });
      getLinkedProjectSpy.mockRestore();

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:project',
          value: '[REDACTED]',
        },
      ]);
    });

    it('uses the resolved explicit scope instead of a conflicting local link', async () => {
      const cwd = await getWriteableDirectory();
      const scopedProject = {
        ...defaultProject,
        id: 'prj_scoped',
        name: 'scoped-project',
        accountId: 'team_scope',
      };
      let requestedTeamId: unknown;

      useUser();
      useTeams('team_scope');
      client.config.currentTeam = 'team_scope';
      client.scenario.get('/v9/projects/scoped-project', (req, res) => {
        requestedTeamId = req.query.teamId;
        res.json(scopedProject);
      });
      await fs.outputJSON(join(cwd, '.vercel', 'project.json'), {
        orgId: 'team_stale',
        projectId: 'prj_stale',
      });

      client.cwd = cwd;
      client.setArgv('build', '--project=scoped-project', '--scope=team-scope');
      await build(client);

      expect(requestedTeamId).toEqual('team_scope');
    });

    it('tracks --project telemetry as [REDACTED]', async () => {
      const cwd = await getWriteableDirectory();
      useUser();
      useTeams('team_dummy');
      useUnknownProject();

      client.cwd = cwd;
      client.setArgv('build', '--project=my-app');
      await build(client);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:project',
          value: '[REDACTED]',
        },
      ]);
    });
  });
});
