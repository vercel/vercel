import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { createGzip } from 'node:zlib';
import semver from 'semver';
import tar from 'tar-fs';
import which from 'which';
import { describe, expect, it } from 'vitest';
import { getUpgradePackageManager } from '../../../src/util/upgrade-package-managers';

const exec = promisify(execFile);
const packageName = 'vercel';
// Cold npm installs can exceed 15 seconds on Windows CI, even with a loopback
// registry. Keep subprocesses bounded while allowing startup and shutdown time.
const commandTimeout = 30_000;

function parseManagerVersionOutput(stdout: string): string | undefined {
  for (const line of [stdout.trim(), ...stdout.trim().split('\n').reverse()]) {
    try {
      const value = JSON.parse(line);
      const parsed =
        Array.isArray(value) && value.length === 1 ? value[0] : value;
      const version =
        typeof parsed === 'string'
          ? parsed
          : typeof parsed?.data === 'string'
            ? parsed.data
            : undefined;
      if (version && semver.valid(version)) return version;
    } catch {
      if (semver.valid(line.trim())) return line.trim();
    }
  }
  return undefined;
}

// The installed CLI is the packed PR artifact. These minimal replacement
// packages are served only after bootstrap to control upgrade versions and age.
async function packageTarball(root: string, version: string) {
  const directory = join(root, `fixture-${version}`);
  await mkdir(join(directory, 'package'), { recursive: true });
  const manifest = {
    name: packageName,
    version,
    bin: { [packageName]: 'cli.js' },
  };
  await writeFile(
    join(directory, 'package/package.json'),
    JSON.stringify(manifest)
  );
  await writeFile(
    join(directory, 'package/cli.js'),
    `#!/usr/bin/env node\nprocess.stdout.write('${version}\\n');\n`,
    { mode: 0o755 }
  );
  const gzip = createGzip();
  const archive = tar.pack(directory);
  archive.on('error', error => gzip.destroy(error));
  archive.pipe(gzip);
  const chunks: Uint8Array[] = [];
  for await (const chunk of gzip) chunks.push(Uint8Array.from(chunk));
  return { manifest, tarball: Uint8Array.from(Buffer.concat(chunks)) };
}

// pnpm scenarios set store-dir through setPnpmConfig instead, because pnpm 11
// ignores it here.
function globalConfig(root: string, pnpmHome: string, registry: string) {
  return `registry=${registry}\naudit=false\nfund=false\nupdate-notifier=false\nfetch-retries=0\nfetch-timeout=30000\nprefer-offline=true\nglobal-dir=${join(root, 'pnpm-global')}\nglobal-bin-dir=${pnpmHome}\n`;
}

// pnpm 10 reads npm_config_* settings. pnpm 11 reads only pnpm_config_* and
// ignores the sandbox npmrc for store, cache, and fetch settings. Set both so
// either version gets the same configuration. npm warns about unknown
// npm_config_* keys, so only pnpm scenarios use this.
function pnpmConfig(key: string, value: string) {
  return {
    [`npm_config_${key}`]: value,
    [`pnpm_config_${key}`]: value,
  };
}

async function sandbox(root: string, registry: string) {
  const home = join(root, 'home');
  const cwd = join(root, 'project');
  const prefix = join(root, 'prefix');
  const launcherBin = join(prefix, 'bin');
  const pnpmHome = join(root, 'pnpm');
  const pnpmBin = join(pnpmHome, 'bin');
  const temporary = join(root, 'tmp');
  const userconfig = join(home, '.npmrc');
  const globalconfig = join(root, 'global.npmrc');
  await Promise.all(
    [home, cwd, launcherBin, pnpmHome, pnpmBin, temporary].map(path =>
      mkdir(path, { recursive: true })
    )
  );
  const projectManifest = JSON.stringify({
    name: 'upgrade-test-project',
    version: '1.0.0',
    private: true,
  });
  await Promise.all([
    writeFile(join(cwd, 'package.json'), projectManifest),
    writeFile(join(temporary, 'package.json'), projectManifest),
  ]);
  await writeFile(userconfig, '');
  await writeFile(globalconfig, globalConfig(root, pnpmHome, registry));
  const env: NodeJS.ProcessEnv = {
    // Deliberately do not inherit npm_config_*, tokens, proxies, NODE_OPTIONS,
    // user cache paths, or package-manager settings from the test runner.
    PATH: [
      launcherBin,
      dirname(process.execPath),
      pnpmHome,
      pnpmBin,
      process.env.PATH,
    ].join(delimiter),
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(root, 'config'),
    XDG_CACHE_HOME: join(root, 'cache'),
    XDG_DATA_HOME: join(root, 'data'),
    XDG_STATE_HOME: join(root, 'state'),
    APPDATA: join(root, 'appdata'),
    LOCALAPPDATA: join(root, 'localappdata'),
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
    CI: '1',
    NO_COLOR: '1',
    NO_UPDATE_NOTIFIER: '1',
    npm_config_update_notifier: 'false',
    npm_config_userconfig: userconfig,
    npm_config_globalconfig: globalconfig,
    npm_config_prefix: prefix,
    PNPM_HOME: pnpmHome,
    COREPACK_HOME: join(root, 'corepack'),
    COREPACK_ENABLE_NETWORK: '0',
    COREPACK_ENABLE_PROJECT_SPEC: '0',
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
  };
  return { cwd, env, prefix, globalconfig, temporary };
}

async function resolveExecutable(
  manager: 'npm' | 'pnpm' | 'yarn' | 'bun',
  path: string
) {
  const resolved = await realpath(path);
  if (/\.(c?js)$/i.test(resolved)) {
    return { command: process.execPath, prefix: [resolved] };
  }
  if (manager !== 'bun') {
    // npm.cmd, pnpm.cmd, and vlt.cmd cannot be passed to execFile. Resolve the package
    // beside the shim instead, verifying its identity and declared JS bin. Do
    // not fall back to a different installation or execute a wrapper in a shell.
    const directory = dirname(resolved);
    for (const packageDirectory of [
      join(directory, 'node_modules', manager),
      join(directory, '..', manager),
      join(directory, '..', 'lib', 'node_modules', manager),
    ]) {
      try {
        const manifest = JSON.parse(
          await readFile(join(packageDirectory, 'package.json'), 'utf8')
        );
        const bin = manifest.bin?.[manager];
        if (
          manifest.name !== manager ||
          typeof bin !== 'string' ||
          !/\.(c?js)$/i.test(bin)
        ) {
          continue;
        }
        const entry = await realpath(join(packageDirectory, bin));
        if ((await stat(entry)).isFile()) {
          return { command: process.execPath, prefix: [entry] };
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
  if (/\.(cmd|bat|ps1)$/i.test(resolved)) {
    throw new Error(
      `Cannot run ${manager} wrapper without a verified JS entrypoint: ${resolved}. Set VERCEL_TEST_${manager.toUpperCase()}_PATH to a JS entrypoint or native executable.`
    );
  }
  return { command: resolved, prefix: [] };
}

async function writeManagerLauncher(
  path: string,
  binary: { command: string; prefix: string[] }
) {
  await writeFile(
    path,
    `#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const result = spawnSync(${JSON.stringify(binary.command)}, [...${JSON.stringify(binary.prefix)}, ...process.argv.slice(2)], {
  env: process.env,
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.signal) process.kill(process.pid, result.signal);
process.exit(result.status ?? 1);
`,
    { mode: 0o755 }
  );
}

async function executable(manager: 'npm' | 'pnpm' | 'yarn' | 'bun') {
  const configuredPath =
    process.env[`VERCEL_TEST_${manager.toUpperCase()}_PATH`];
  if (configuredPath) {
    return resolveExecutable(manager, configuredPath);
  }
  // `pnpm test` supplies the running pnpm entrypoint. Use it only when the
  // versioned matrix did not inject a different pnpm binary.
  const pnpmEntry = process.env.npm_execpath;
  if (manager === 'pnpm' && pnpmEntry && /pnpm\.(c?js)$/.test(pnpmEntry)) {
    return { command: process.execPath, prefix: [pnpmEntry] };
  }
  const path = await which(
    manager === 'bun' && process.platform === 'win32' ? 'bun.exe' : manager,
    { nothrow: true }
  );
  if (!path) return undefined;
  return resolveExecutable(manager, path);
}

describe('package-manager subprocess entrypoints', () => {
  for (const manager of ['npm', 'pnpm'] as const) {
    it(`resolves ${manager}.cmd to its verified JS entrypoint`, async () => {
      const root = await realpath(
        await mkdtemp(join(tmpdir(), 'vercel-upgrade-bin-'))
      );
      try {
        const wrapper = join(root, `${manager}.cmd`);
        const packageDirectory = join(root, 'node_modules', manager);
        const entry = join(packageDirectory, 'bin', `${manager}.cjs`);
        await mkdir(dirname(entry), { recursive: true });
        await writeFile(wrapper, '@echo off\r\nexit /b 1\r\n');
        await writeFile(entry, "process.stdout.write('entrypoint');\n");
        const manifest = join(packageDirectory, 'package.json');
        await writeFile(
          manifest,
          JSON.stringify({
            name: manager,
            bin: { [manager]: `bin/${manager}.cjs` },
          })
        );
        const binary = await resolveExecutable(manager, wrapper);
        expect(binary).toEqual({ command: process.execPath, prefix: [entry] });
        const { stdout } = await exec(binary.command, binary.prefix, {
          timeout: commandTimeout,
        });
        expect(stdout).toBe('entrypoint');

        await rm(entry);
        await expect(resolveExecutable(manager, wrapper)).rejects.toThrow(
          'without a verified JS entrypoint'
        );
        await writeFile(entry, '');
        await writeFile(
          manifest,
          JSON.stringify({
            name: 'not-the-requested-manager',
            bin: { [manager]: `bin/${manager}.cjs` },
          })
        );
        await expect(resolveExecutable(manager, wrapper)).rejects.toThrow(
          'without a verified JS entrypoint'
        );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }

  it('launches the pinned manager without production environment hooks', async () => {
    const root = await mkdtemp(join(tmpdir(), 'vc-manager-launcher-'));
    try {
      const target = join(root, 'target.cjs');
      const launcher = join(root, 'npm');
      await writeFile(
        target,
        'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n'
      );
      await writeManagerLauncher(launcher, {
        command: process.execPath,
        prefix: [target, 'fixed argument'],
      });

      const { stdout } = await exec(
        process.execPath,
        [launcher, 'dynamic argument'],
        { env: process.env }
      );
      expect(JSON.parse(stdout)).toEqual([
        'fixed argument',
        'dynamic argument',
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('runs native binaries directly', async () => {
    expect(await resolveExecutable('bun', process.execPath)).toEqual({
      command: await realpath(process.execPath),
      prefix: [],
    });
  });
});

describe('non-release-age package manager arguments', () => {
  it.each([
    {
      manager: 'yarn' as const,
      metadata: ['info', 'vercel', 'version', '--json'],
      install: ['global', 'add', 'vercel@latest'],
    },
    {
      manager: 'bun' as const,
      metadata: ['info', 'vercel@latest', 'version', '--json', '--global'],
      install: ['add', '-g', 'vercel@latest'],
    },
  ])('defines $manager metadata and global install arguments', config => {
    const adapter = getUpgradePackageManager(config.manager);
    expect(adapter.metadataArgs('vercel@latest')).toEqual(config.metadata);
    expect(adapter.installArgs('vercel@latest')).toEqual(config.install);
    expect(adapter.releaseAgeBypassArgs).toEqual([]);
  });
});

const selectedManager = process.env.VERCEL_TEST_UPGRADE_MANAGER;
const selectedReleaseAge = process.env.VERCEL_TEST_UPGRADE_RELEASE_AGE;

// The real installer matrix is intentionally isolated in dedicated CI jobs. Running
// every package manager in the generic unit shards makes unrelated CI slower and
// turns host tool availability into a source of flakes.
describe.skipIf(!selectedManager)(
  'upgrade package managers against an isolated registry',
  () => {
    const scenarios = [
      { manager: 'npm', releaseAge: false },
      { manager: 'pnpm', releaseAge: false },
      { manager: 'npm', releaseAge: true },
      { manager: 'pnpm', releaseAge: true },
    ] as const;
    for (const { manager, releaseAge } of scenarios.filter(
      scenario =>
        (!selectedManager || scenario.manager === selectedManager) &&
        (selectedReleaseAge === undefined ||
          String(scenario.releaseAge) === selectedReleaseAge)
    )) {
      for (const global of [true]) {
        it.sequential(
          `${manager}: real ${releaseAge ? 'release-age behavior, allowed release, and bypass' : 'metadata and upgrade'} (${global ? 'global' : 'local'})`,
          { timeout: commandTimeout * 8, retry: 0 },
          async () => {
            const binary = await executable(manager);
            if (!binary)
              throw new Error(`${manager} must be installed for this test`);
            const { stdout: versionStdout } = await exec(
              binary.command,
              [...binary.prefix, '--version'],
              { cwd: tmpdir(), timeout: commandTimeout }
            );
            const managerVersion = semver.coerce(versionStdout.trim());
            if (!managerVersion) {
              throw new Error(
                `Could not parse ${manager} version: ${versionStdout.trim()}`
              );
            }
            const enforcesReleaseAge =
              releaseAge &&
              (manager === 'pnpm' ||
                (manager === 'npm' && semver.gte(managerVersion, '11.13.0')));
            const usesPnpm11StrictReleaseAge =
              releaseAge &&
              manager === 'pnpm' &&
              semver.gte(managerVersion, '11.0.0');
            // Canonicalize macOS /var -> /private/var before pnpm persists paths.
            const root = await realpath(
              await mkdtemp(join(tmpdir(), 'vercel-upgrade-pm-'))
            );
            const requests: string[] = [];
            const server = createServer();
            try {
              const packages = new Map(
                await Promise.all(
                  ['998.0.0', '999.0.0'].map(
                    async version =>
                      [version, await packageTarball(root, version)] as const
                  )
                )
              );
              server.listen(0, '127.0.0.1');
              await once(server, 'listening');
              const address = server.address();
              if (!address || typeof address === 'string') {
                throw new Error('Expected a loopback TCP listener');
              }
              const origin = `http://127.0.0.1:${address.port}`;
              // Do not publish after pnpm has computed its resolution cutoff:
              // even an age override of zero rejects a timestamp in its future.
              const now = Date.now();
              const publishedAt = new Date(now - 60_000).toISOString();
              const day = 24 * 60 * 60 * 1000;
              const releaseTimes: Record<string, string> = {
                '998.0.0': new Date(now - 14 * day).toISOString(),
                '999.0.0': publishedAt,
              };
              server.on('request', (request, response) => {
                const path = new URL(request.url || '/', origin).pathname;
                requests.push(path);
                const [, registry, name, filename] = path.split('/');
                if (
                  request.method !== 'GET' ||
                  !['global', 'project'].includes(registry) ||
                  name !== packageName
                ) {
                  response.writeHead(404).end();
                  return;
                }
                if (filename) {
                  const fixture = packages.get(filename.replace(/\.tgz$/, ''));
                  if (!fixture) {
                    response.writeHead(404).end();
                    return;
                  }
                  response.writeHead(200, {
                    'content-type': 'application/octet-stream',
                  });
                  response.end(fixture.tarball);
                  return;
                }
                // Release-age cases need an eligible upgrade below latest. The
                // other cases use distinct tags to test registry precedence.
                const latest =
                  releaseAge || registry === 'project' ? '999.0.0' : '998.0.0';
                const versions = Object.fromEntries(
                  [...packages].map(([version, fixture]) => [
                    version,
                    {
                      ...fixture.manifest,
                      dist: {
                        tarball: `${origin}/${registry}/${packageName}/${version}.tgz`,
                        shasum: createHash('sha1')
                          .update(fixture.tarball)
                          .digest('hex'),
                        integrity: `sha512-${createHash('sha512').update(fixture.tarball).digest('base64')}`,
                      },
                    },
                  ])
                );
                response.writeHead(200, { 'content-type': 'application/json' });
                response.end(
                  JSON.stringify({
                    name: packageName,
                    'dist-tags': { latest },
                    versions,
                    time: Object.fromEntries(
                      [...packages.keys()].map(version => [
                        version,
                        releaseAge ? releaseTimes[version] : publishedAt,
                      ])
                    ),
                  })
                );
              });
              const cliTarball = process.env.VERCEL_TEST_CLI_TARBALL;
              if (!cliTarball) {
                throw new Error('VERCEL_TEST_CLI_TARBALL is required');
              }
              const isolated = await sandbox(
                root,
                'https://registry.npmjs.org/'
              );
              isolated.env.VERCEL_TELEMETRY_DISABLED = '1';
              if (manager === 'npm' && semver.gte(managerVersion, '12.0.0')) {
                // Preview packages intentionally pin workspace dependencies to
                // tarballs on the same commit-specific Vercel deployment.
                isolated.env.npm_config_allow_remote = 'all';
              }
              // The shared bootstrap cache is only for the preview dependency
              // graph. A scenario-local upgrade cache prevents recycled
              // loopback ports from reusing another scenario's package metadata.
              const bootstrapCache =
                process.env.VERCEL_TEST_CLI_BOOTSTRAP_CACHE ||
                join(root, `${manager}-cache`);
              const upgradeCache = join(root, `upgrade-${manager}-cache`);
              const cacheConfig = (directory: string) =>
                manager === 'npm'
                  ? { npm_config_cache: directory }
                  : pnpmConfig('cache_dir', directory);
              Object.assign(isolated.env, cacheConfig(upgradeCache));
              const pnpmStoreDir =
                process.env.VERCEL_TEST_CLI_BOOTSTRAP_STORE ||
                join(root, 'store');
              if (manager === 'pnpm') {
                // Keep one store for the whole scenario. pnpm records the store
                // location for the global dir, so switching it after the
                // global install risks store-location errors.
                Object.assign(
                  isolated.env,
                  pnpmConfig('store_dir', pnpmStoreDir),
                  pnpmConfig('fetch_retries', '0'),
                  pnpmConfig('fetch_timeout', '30000')
                );
              }
              await writeManagerLauncher(
                join(isolated.prefix, 'bin', manager),
                binary
              );
              const adapter = getUpgradePackageManager(manager);
              const run = (
                args: string[],
                cwd = isolated.cwd,
                env = isolated.env
              ) =>
                exec(binary.command, [...binary.prefix, ...args], {
                  cwd,
                  env,
                  timeout: commandTimeout * 2,
                  killSignal: 'SIGKILL',
                  maxBuffer: 1024 * 1024,
                  encoding: 'utf8',
                }).catch(error => {
                  throw new Error(
                    `${manager} ${args.join(' ')} failed (exit ${error.code}):\n${error.stdout || ''}\n${error.stderr || ''}`
                  );
                });
              const installedPackageDir = async () => {
                if (!adapter.globalDetection.packageDir) {
                  throw new Error(
                    `${manager} does not expose a global package root`
                  );
                }
                const detectionArgs = adapter.globalDetection.args;
                const { stdout } = await run(
                  typeof detectionArgs === 'function'
                    ? detectionArgs(packageName)
                    : detectionArgs
                );
                const packageDir = adapter.globalDetection.packageDir(
                  stdout.trim(),
                  packageName
                );
                if (!packageDir) {
                  throw new Error(
                    `${manager} did not report the installed global package path`
                  );
                }
                return packageDir;
              };
              const installedVersion = async () =>
                JSON.parse(
                  await readFile(
                    join(await installedPackageDir(), 'package.json'),
                    'utf8'
                  )
                ).version;

              if (manager === 'pnpm') {
                // Catch pnpm silently ignoring the configured store again.
                const { stdout } = await run(['config', 'get', 'store-dir']);
                expect(stdout.trim()).toBe(pnpmStoreDir);
              }

              // The commit-specific preview intentionally pins workspace
              // dependencies to deployment tarballs. pnpm 11 blocks those URL
              // subdependencies by default, so opt in only for this artifact.
              if (manager === 'pnpm' && semver.gte(managerVersion, '11.0.0')) {
                await run([
                  'config',
                  'set',
                  'blockExoticSubdeps',
                  'false',
                  '--global',
                ]);
              }
              // Install the runnable preview CLI from the public registry and
              // shared bootstrap cache without changing the scenario env used
              // by upgrade checks. The sandbox npmrc already sets
              // prefer-offline, but pnpm 11 ignores it, so pass it explicitly.
              const installPreview = (cwd: string, extraArgs: string[] = []) =>
                run(
                  [
                    ...adapter.installArgs(cliTarball),
                    ...extraArgs,
                    '--registry=https://registry.npmjs.org/',
                    '--prefer-offline',
                  ],
                  cwd,
                  {
                    ...isolated.env,
                    ...cacheConfig(bootstrapCache),
                    npm_config_registry: 'https://registry.npmjs.org/',
                  }
                );
              await installPreview(isolated.cwd);
              // All subsequent metadata and upgrade requests use loopback only.
              const initialVersion = await installedVersion();
              expect(initialVersion).toMatch(/^\d+\.\d+\.\d+/);

              await writeFile(
                isolated.globalconfig,
                globalConfig(root, isolated.env.PNPM_HOME!, `${origin}/global/`)
              );
              await writeFile(
                join(isolated.cwd, '.npmrc'),
                `registry=${origin}/project/\n`
              );
              if (manager === 'pnpm') {
                await run([
                  'config',
                  'set',
                  'registry',
                  `${origin}/global/`,
                  '--global',
                ]);
              }
              if (releaseAge && !usesPnpm11StrictReleaseAge) {
                if (manager === 'npm') {
                  await writeFile(
                    isolated.globalconfig,
                    'min-release-age=7\n',
                    { flag: 'a' }
                  );
                } else {
                  isolated.env.npm_config_minimum_release_age = '10080';
                }
              }
              if (usesPnpm11StrictReleaseAge) {
                await run([
                  'config',
                  'set',
                  'minimumReleaseAge',
                  '1440',
                  '--global',
                ]);
                await run([
                  'config',
                  'set',
                  'minimumReleaseAgeStrict',
                  'true',
                  '--global',
                ]);
              }

              const runCli = async (args: string[]) => {
                const cliPath = join(await installedPackageDir(), 'dist/vc.js');
                return exec(process.execPath, [cliPath, ...args], {
                  cwd: isolated.temporary,
                  env: isolated.env,
                  timeout: commandTimeout * 2,
                  killSignal: 'SIGKILL',
                  maxBuffer: 1024 * 1024,
                  encoding: 'utf8',
                }).catch(error => {
                  error.message += `\ncode: ${error.code}, signal: ${error.signal}, killed: ${error.killed}\nstdout:\n${error.stdout || ''}\nstderr:\n${error.stderr || ''}`;
                  throw error;
                });
              };

              const preview = await runCli(['upgrade', '--json']);
              const previewJson = JSON.parse(preview.stdout);
              expect(previewJson.installationType).toBe('global');
              expect(previewJson.upgradeCommand).toContain(
                adapter.installArgs(`${packageName}@latest`).join(' ')
              );

              requests.length = 0;
              const { stdout: metadataStdout } = await run(
                [
                  ...adapter.metadataArgs(`${packageName}@latest`),
                  ...adapter.releaseAgeBypassArgs,
                ],
                isolated.temporary
              );
              const targetVersion = releaseAge ? '999.0.0' : '998.0.0';
              expect(
                parseManagerVersionOutput(metadataStdout),
                metadataStdout
              ).toBe(targetVersion);
              if (manager === 'npm') {
                const metadata = JSON.parse(metadataStdout);
                if (semver.gte(managerVersion, '12.0.0')) {
                  expect(metadata).toEqual([targetVersion]);
                } else {
                  expect(metadata).toBe(targetVersion);
                }
              }

              if (releaseAge && enforcesReleaseAge) {
                const failure = await runCli(['upgrade']).then(
                  () => undefined,
                  error => error
                );
                expect(failure).toBeDefined();
                expect(
                  `${failure.stdout || ''}\n${failure.stderr || ''}`
                ).toMatch(/minimum release-age/i);
                expect(await installedVersion()).toBe(initialVersion);
                await runCli(['upgrade', 'latest']);
                expect(await installedVersion()).toBe('998.0.0');
                // The controlled replacement package is intentionally minimal.
                // Restore the runnable preview CLI before the final upgrade.
                await installPreview(
                  isolated.temporary,
                  adapter.releaseAgeBypassArgs
                );
                await runCli(['upgrade', '--bypass-min-release-age']);
                expect(await installedVersion()).toBe('999.0.0');
              } else {
                await runCli(['upgrade', releaseAge ? '999.0.0' : '998.0.0']);
                expect(await installedVersion()).toBe(targetVersion);
              }

              expect(requests).toContain(`/global/${packageName}`);
              expect(requests.every(path => path.startsWith('/global/'))).toBe(
                true
              );
            } finally {
              server.closeAllConnections();
              if (server.listening) {
                await new Promise<void>((resolve, reject) =>
                  server.close(error => (error ? reject(error) : resolve()))
                );
              }
              await rm(root, { recursive: true, force: true });
            }
          }
        );
      }
    }
  }
);
