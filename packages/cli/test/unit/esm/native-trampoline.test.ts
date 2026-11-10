import { afterEach, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  existsSync,
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

/**
 * Exercise the built shim in a production-like install: vercel and the native
 * package are siblings in node_modules. Link the real cli-config package so
 * config tests exercise its paths export, not the shim's import-error fallback.
 * Only tests that leave the version fast path need the rest of the built CLI.
 */
const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = join(here, '..', '..', '..');
const distDir = join(cliRoot, 'dist');
const binName = process.platform === 'win32' ? 'vercel.exe' : 'vercel';
const cliVersion = JSON.parse(
  readFileSync(join(cliRoot, 'package.json'), 'utf8')
).version as string;
const nativeBody = '#!/bin/sh\necho NATIVE_RAN\nexit 7\n';
const hostIsMusl =
  process.platform === 'linux' &&
  !(
    process.report?.getReport() as unknown as {
      header: { glibcVersionRuntime?: string };
    }
  ).header.glibcVersionRuntime;
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function writeConfig(
  configDir: string,
  config: Record<string, unknown> | string
) {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, 'config.json'),
    typeof config === 'string' ? config : JSON.stringify(config, null, 2)
  );
}

function buildInstall(
  opts: {
    body?: string;
    executable?: boolean;
    config?: Record<string, unknown> | string;
    fullCLI?: boolean;
  } = {}
) {
  const root = mkdtempSync(join(tmpdir(), 'vc-install-'));
  tempDirs.push(root);
  const nm = join(root, 'node_modules');
  const vercelDist = join(nm, 'vercel', 'dist');
  mkdirSync(vercelDist, { recursive: true });
  copyFileSync(
    join(cliRoot, 'package.json'),
    join(nm, 'vercel', 'package.json')
  );
  for (const name of ['vc.js', 'version.mjs']) {
    copyFileSync(join(distDir, name), join(vercelDist, name));
  }
  mkdirSync(join(nm, '@vercel'), { recursive: true });
  symlinkSync(
    join(cliRoot, 'node_modules', '@vercel', 'cli-config'),
    join(nm, '@vercel', 'cli-config'),
    'junction'
  );
  if (opts.fullCLI) {
    // Keep vc.js physically in the temporary install for native resolution.
    // Other built modules resolve their dependencies from their real paths,
    // avoiding a copy of the entire dist/dependency tree for each subprocess.
    for (const entry of readdirSync(distDir, { withFileTypes: true })) {
      if (entry.name === 'vc.js' || entry.name === 'version.mjs') continue;
      symlinkSync(
        join(distDir, entry.name),
        join(vercelDist, entry.name),
        entry.isDirectory() ? 'junction' : 'file'
      );
    }
  }

  if (opts.body) {
    const pkgName = `@vercel/vc-native-${process.platform}-${process.arch}`;
    const pkgDir = join(nm, pkgName);
    mkdirSync(join(pkgDir, 'bin'), { recursive: true });
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: pkgName, version: cliVersion })
    );
    const binPath = join(pkgDir, 'bin', binName);
    writeFileSync(binPath, opts.body);
    chmodSync(binPath, opts.executable === false ? 0o644 : 0o755);
  }

  const env = cleanEnv(root);
  const configDir = join(env.XDG_DATA_HOME, 'com.vercel.cli');
  if (opts.config !== undefined) writeConfig(configDir, opts.config);
  const vcJs = join(vercelDist, 'vc.js');
  return {
    root,
    configDir,
    run(
      args = ['--version'],
      overrides: Record<string, string> = {},
      nodeArgsFirst = false
    ) {
      // With nodeArgsFirst, leading `--require <file>` args go to Node.
      const argv = nodeArgsFirst
        ? [...args.slice(0, 2), vcJs, ...args.slice(2)]
        : [vcJs, ...args];
      return spawnSync(process.execPath, argv, {
        cwd: root,
        encoding: 'utf8',
        env: { ...env, ...overrides },
      });
    },
    // For tests that serve requests from this process while the CLI runs.
    runAsync(
      args: string[],
      overrides: Record<string, string> = {}
    ): Promise<{ status: number | null; stdout: string; stderr: string }> {
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [vcJs, ...args], {
          cwd: root,
          env: { ...env, ...overrides },
        });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8').on('data', data => (stdout += data));
        child.stderr.setEncoding('utf8').on('data', data => (stderr += data));
        child.on('error', reject);
        child.on('close', status => resolve({ status, stdout, stderr }));
      });
    },
  };
}

function cleanEnv(root: string): Record<string, string> {
  // Allowlist OS essentials: never inherit native preferences, NODE_PATH,
  // NODE_OPTIONS, Vitest/agent flags, credentials, or the user's config paths.
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (/^(SYSTEMROOT|WINDIR|COMSPEC|PATHEXT)$/i.test(key) && value != null) {
      env[key] = value;
    }
  }
  return {
    ...env,
    // Never install an upgrade or probe tools on the user's PATH.
    PATH: join(root, 'bin'),
    HOME: join(root, 'home'),
    USERPROFILE: join(root, 'home'),
    APPDATA: join(root, 'appdata'),
    LOCALAPPDATA: join(root, 'localappdata'),
    XDG_DATA_HOME: join(root, 'data'),
    XDG_DATA_DIRS: join(root, 'system-data'),
    XDG_CONFIG_HOME: join(root, 'config'),
    XDG_CONFIG_DIRS: join(root, 'system-config'),
    XDG_CACHE_HOME: join(root, 'cache'),
    XDG_STATE_HOME: join(root, 'state'),
    // Simulated win32 runs take Node's temp dir from TEMP.
    TEMP: join(root, 'tmp'),
    NO_UPDATE_NOTIFIER: '1',
    VERCEL_TELEMETRY_DISABLED: '1',
    NO_COLOR: '1',
    // Never download a native binary from the real registry.
    __VERCEL_NATIVE_DOWNLOAD: '0',
  };
}

function expectJS(result: ReturnType<ReturnType<typeof buildInstall>['run']>) {
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout.trim()).toBe(cliVersion);
  expect(result.stderr).not.toContain('(native)');
  expect(result.stderr).not.toContain('GLIBC_2.38');
}

describe('dist/vc.js argument errors during initialization', () => {
  it.each([
    '--team',
    '--global-config',
    '--token',
    '-Q',
  ])('reports a missing %s value as JSON without a stack trace', flag => {
    const install = buildInstall({ fullCLI: true });
    const result = install.run(['ci', 'ls', '--non-interactive', flag]);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'error',
      reason: 'invalid_arguments',
      message: expect.stringContaining(flag),
    });
    expect(result.stderr).not.toContain('ArgError:');
    expect(result.stderr).not.toContain('flagsSpecification');
    expect(result.stderr).not.toContain('at arg');
  });

  it('respects an explicit non-interactive opt-out', () => {
    const install = buildInstall({ fullCLI: true });
    const result = install.run([
      'ci',
      'ls',
      '--non-interactive',
      '--non-interactive=false',
      '--team',
    ]);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('✗ option requires argument: --team');
    expect(result.stderr).not.toContain('ArgError:');
  });
});

describe.runIf(process.platform === 'linux')(
  'dist/vc.js deprecated architectures',
  () => {
    const deprecation = 'will be removed from the vercel package';

    function runAs(
      install: ReturnType<typeof buildInstall>,
      props: Record<string, string>,
      args: string[] = ['--version'],
      env: Record<string, string> = {}
    ) {
      const preload = join(install.root, 'arch.cjs');
      writeFileSync(
        preload,
        Object.entries(props)
          .map(
            ([key, value]) =>
              `Object.defineProperty(process, '${key}', { value: '${value}' });`
          )
          .join('\n')
      );
      return install.run(['--require', preload, ...args], env, true);
    }

    it('warns once per day on linux-ia32', () => {
      const install = buildInstall({ config: {} });
      const first = runAs(install, { arch: 'ia32' });
      expect(first.stderr).toContain(`Support for linux-ia32 ${deprecation}`);
      expect(first.stderr).not.toContain('@vercel/cli-support');
      expect(first.stderr).not.toContain('64-bit Node.js');
      expect(runAs(install, { arch: 'ia32' }).stderr).not.toContain(
        deprecation
      );

      const stamp = join(install.configDir, '.arch-deprecation-warned');
      const dayAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
      utimesSync(stamp, dayAgo, dayAgo);
      expect(runAs(install, { arch: 'ia32' }).stderr).toContain(deprecation);
    });

    it('stays quiet on win32-ia32', () => {
      const install = buildInstall({ config: {} });
      const result = runAs(install, { platform: 'win32', arch: 'ia32' });
      expect(result.stderr).not.toContain(deprecation);
    });

    it.each([
      [['--non-interactive', 'whoami'], {}],
      [['ls', '--json'], {}],
      [['ls', '--format', 'json'], {}],
      [['ls', '--format=json'], {}],
      [['--version'], { VERCEL_VC_NATIVE: '1' }],
    ])('stays quiet for %j %j', (args, env) => {
      const install = buildInstall({ config: {} });
      expect(runAs(install, { arch: 'ia32' }, args, env).stderr).not.toContain(
        deprecation
      );
    });

    it('stays quiet on 64-bit architectures', () => {
      const install = buildInstall({ config: {} });
      expect(install.run().stderr).not.toContain(deprecation);
    });
  }
);

function addPackage(
  install: ReturnType<typeof buildInstall>,
  name: string,
  files: Record<string, string>
) {
  const pkgDir = join(install.root, 'node_modules', name);
  for (const [file, body] of Object.entries(files)) {
    mkdirSync(dirname(join(pkgDir, file)), { recursive: true });
    writeFileSync(join(pkgDir, file), body);
    if (file.startsWith('bin/')) chmodSync(join(pkgDir, file), 0o755);
  }
  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name, version: cliVersion })
  );
}

function runOn(
  install: ReturnType<typeof buildInstall>,
  props: Record<string, string>,
  args: string[],
  env: Record<string, string> = {}
) {
  const preload = join(install.root, 'platform.cjs');
  writeFileSync(
    preload,
    Object.entries(props)
      .map(
        ([key, value]) =>
          `Object.defineProperty(process, '${key}', { value: '${value}' });`
      )
      .join('\n')
  );
  return install.run(['--require', preload, ...args], env, true);
}

// VERCEL_TELEMETRY_DEBUG prints the events it would send instead of sending.
const telemetryArgs = ['telemetry', 'status'];
const telemetryEnv = { VERCEL_TELEMETRY_DEBUG: '1' };

// Debug mode also prints lines without a key, such as `{"commandTrace": ...}`.
function launchEvents(stderr: string) {
  return stderr
    .split('\n')
    .filter(line => line.startsWith('> {'))
    .map(line => JSON.parse(line.slice(2)) as { key?: string; value?: string })
    .filter(event => event.key?.startsWith('launcher'))
    .map(event => `${event.key}:${event.value}`);
}

const hostTarget = `${process.platform}-${process.arch}${hostIsMusl ? '-musl' : ''}`;
const hostHasNative = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-arm64-musl',
  'linux-x64',
  'linux-x64-musl',
].includes(hostTarget);

describe.runIf(hostHasNative)('dist/vc.js on a native platform', () => {
  it('runs the native binary without any opt-in', () => {
    const install = buildInstall({ body: nativeBody });
    const result = install.run(['whoami']);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(7);
    expect(result.stdout.trim()).toBe('NATIVE_RAN');
  });

  it.each([
    '0',
    'false',
  ])('runs Node.js when VERCEL_CLI_USE_NATIVE_BINARY=%s', value => {
    const install = buildInstall({ body: nativeBody });
    expectJS(
      install.run(['--version'], { VERCEL_CLI_USE_NATIVE_BINARY: value })
    );
  });

  it('reports an opt-out as a dist fallback', () => {
    const install = buildInstall({ body: nativeBody, fullCLI: true });
    const result = install.run(telemetryArgs, {
      ...telemetryEnv,
      VERCEL_CLI_USE_NATIVE_BINARY: '0',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain('NATIVE_RAN');
    expect(result.stderr).not.toContain('could not start');
    expect(launchEvents(result.stderr)).toEqual([
      'launcher:dist',
      `launcher_target:${hostTarget}`,
      'launcher_fallback:opt_out',
    ]);
  });

  it('respects a persisted useNativeBinary: false', () => {
    const install = buildInstall({
      body: nativeBody,
      config: { useNativeBinary: false },
    });
    expectJS(install.run());
  });

  it('respects useNativeBinary: false in --global-config', () => {
    const install = buildInstall({ body: nativeBody, fullCLI: true });
    const configDir = join(install.root, 'custom-config');
    writeConfig(configDir, { useNativeBinary: false });
    const result = install.run(
      ['--global-config', configDir, ...telemetryArgs],
      telemetryEnv
    );
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain('NATIVE_RAN');
    expect(launchEvents(result.stderr)).toContain('launcher_fallback:opt_out');
  });

  it('lets VERCEL_CLI_USE_NATIVE_BINARY=1 override a persisted opt-out', () => {
    const install = buildInstall({
      body: nativeBody,
      config: { useNativeBinary: false },
    });
    const result = install.run(['--version'], {
      VERCEL_CLI_USE_NATIVE_BINARY: '1',
    });
    expect(result.status).toBe(7);
    expect(result.stdout.trim()).toBe('NATIVE_RAN');
  });

  it('ignores the legacy nativeBinaryAutoOptIn setting', () => {
    const install = buildInstall({
      body: nativeBody,
      config: { nativeBinaryAutoOptIn: false },
    });
    const result = install.run();
    expect(result.status).toBe(7);
    expect(result.stdout.trim()).toBe('NATIVE_RAN');
  });

  it('runs the native binary when the config is malformed', () => {
    const install = buildInstall({ body: nativeBody, config: '{not json' });
    const result = install.run();
    expect(result.status).toBe(7);
    expect(result.stdout.trim()).toBe('NATIVE_RAN');
  });

  it('reports the native binary by the marker pkg.js sets', () => {
    const install = buildInstall({ fullCLI: true });
    const preload = join(install.root, 'native-marker.cjs');
    writeFileSync(
      preload,
      "globalThis[Symbol.for('vercel.cli.launch')] = { runtime: 'native' };\n"
    );
    const result = install.run(
      ['--require', preload, ...telemetryArgs],
      { ...telemetryEnv, VERCEL_VC_NATIVE: '1' },
      true
    );
    expect(result.status, result.stderr).toBe(0);
    expect(launchEvents(result.stderr)).toEqual(['launcher:native']);
  });

  it('reports a child process that inherited VERCEL_VC_NATIVE as dist', () => {
    const install = buildInstall({ body: nativeBody, fullCLI: true });
    const result = install.run(telemetryArgs, {
      ...telemetryEnv,
      VERCEL_VC_NATIVE: '1',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain('NATIVE_RAN');
    expect(launchEvents(result.stderr)).toEqual([
      'launcher:dist',
      `launcher_target:${hostTarget}`,
      'launcher_fallback:inherited_native_env',
    ]);
  });

  it('passes its vercel entrypoint to the native runtime for upgrades', () => {
    const install = buildInstall({
      body: '#!/bin/sh\nprintf "%s\\n" "$VERCEL_CLI_PACKAGE_ENTRYPOINT" "$VERCEL_CLI_PACKAGE_EXECUTABLE"\n',
    });
    const result = install.run(['upgrade', '--dry-run'], {
      VERCEL_CLI_PACKAGE_ENTRYPOINT: join(install.root, 'stale', 'vc.js'),
      VERCEL_CLI_PACKAGE_EXECUTABLE: join(install.root, 'stale', 'vercel'),
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const root = realpathSync(install.root);
    expect(result.stdout.trim().split('\n')).toEqual([
      join(root, 'node_modules', 'vercel', 'dist', 'vc.js'),
      join(
        root,
        'node_modules',
        `@vercel/vc-native-${process.platform}-${process.arch}`,
        'bin',
        binName
      ),
    ]);
    expect(result.stderr).toBe('');
  });

  it('does not trampoline again when VERCEL_VC_NATIVE=1 (loop guard)', () => {
    const install = buildInstall({ body: nativeBody });
    const result = install.run(['--version'], { VERCEL_VC_NATIVE: '1' });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(cliVersion);
    expect(result.stderr).toContain('(native)');
  });

  it('does not fall back to Node.js after the binary exits', () => {
    const install = buildInstall({
      body: '#!/bin/sh\necho "version GLIBC_2.38 not found (required by native)" >&2\nexit 127\n',
    });
    const result = install.run();
    expect(result.status).toBe(127);
    expect(result.stderr).toContain('GLIBC_2.38');
    expect(result.stdout).toBe('');
  });

  it('falls back to Node.js when the binary cannot start, and reports it', () => {
    const install = buildInstall({
      body: nativeBody,
      executable: false,
      fullCLI: true,
    });
    const notice =
      '! The native Vercel CLI binary could not start (EACCES), so Node.js is running this command.';
    const version = install.run();
    expect(version.status).toBe(0);
    expect(version.stdout.trim()).toBe(cliVersion);
    expect(version.stderr).toContain(notice);

    const result = install.run(telemetryArgs, telemetryEnv);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain('NATIVE_RAN');
    expect(launchEvents(result.stderr)).toEqual([
      'launcher:dist',
      `launcher_target:${hostTarget}`,
      'launcher_fallback:EACCES',
    ]);
  });

  it('falls back to Node.js when the native package is missing, and reports it', () => {
    const install = buildInstall({ fullCLI: true });
    const result = install.run(telemetryArgs, telemetryEnv);
    expect(result.status, result.stderr).toBe(0);
    expect(launchEvents(result.stderr)).toEqual([
      'launcher:dist',
      `launcher_target:${hostTarget}`,
      'launcher_fallback:target_missing',
    ]);
  });

  it('ignores a native package exposed via NODE_PATH', () => {
    const install = buildInstall();
    const other = buildInstall({ body: nativeBody });
    expectJS(
      install.run(['--version'], {
        NODE_PATH: join(other.root, 'node_modules'),
      })
    );
  });

  it('names the native package when neither it nor the JS CLI is installed', () => {
    const install = buildInstall();
    const result = install.run(['whoami']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `Error: @vercel/vc-native-${hostTarget} is not installed.`
    );
  });

  it.runIf(process.platform === 'linux' && !hostIsMusl)(
    'runs the glibc package on glibc hosts when the musl variant is also installed',
    () => {
      const install = buildInstall({ body: nativeBody });
      addPackage(install, `@vercel/vc-native-linux-${process.arch}-musl`, {
        'bin/vercel': '#!/bin/sh\necho MUSL_RAN\nexit 8\n',
      });
      const result = install.run();
      expect(result.stdout.trim()).toBe('NATIVE_RAN');
      expect(result.status).toBe(7);
    }
  );
});

describe.runIf(process.platform !== 'win32')(
  'dist/vc.js on a platform without a native binary',
  () => {
    const win32 = { platform: 'win32', arch: 'x64' };

    it('ignores a win32 native package and runs @vercel/cli-support', () => {
      const install = buildInstall();
      addPackage(install, '@vercel/vc-native-win32-x64', {
        'bin/vercel.exe': nativeBody,
      });
      addPackage(install, '@vercel/cli-support', {
        'dist/index.js': "console.log('CLI_SUPPORT_RAN');\n",
      });
      const result = runOn(install, win32, ['whoami']);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout.trim()).toBe('CLI_SUPPORT_RAN');
    });

    it('reports @vercel/cli-support when it is the installed package', () => {
      const install = buildInstall({ fullCLI: true });
      const pkgPath = join(
        install.root,
        'node_modules',
        'vercel',
        'package.json'
      );
      writeFileSync(
        pkgPath,
        JSON.stringify({
          ...JSON.parse(readFileSync(pkgPath, 'utf8')),
          name: '@vercel/cli-support',
        })
      );
      const result = runOn(install, win32, telemetryArgs, telemetryEnv);
      expect(result.status, result.stderr).toBe(0);
      expect(launchEvents(result.stderr)).toEqual(['launcher:cli-support']);
    });

    it.each([
      win32,
      { platform: 'freebsd', arch: 'x64' },
      { platform: 'linux', arch: 'ia32' },
    ])('falls back to Node.js without @vercel/cli-support on $platform-$arch, and reports it', props => {
      const install = buildInstall({ fullCLI: true });
      const result = runOn(install, props, telemetryArgs, telemetryEnv);
      expect(result.status, result.stderr).toBe(0);
      expect(launchEvents(result.stderr)).toEqual([
        'launcher:dist',
        'launcher_target:cli-support',
        'launcher_fallback:target_missing',
      ]);
    });

    it('names @vercel/cli-support when neither it nor the JS CLI is installed', () => {
      const install = buildInstall();
      const result = runOn(install, win32, ['whoami']);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'Error: @vercel/cli-support is not installed.'
      );
    });
  }
);

describe.runIf(hostHasNative)(
  'dist/vc.js downloads a missing native binary',
  () => {
    const servers: Server[] = [];
    afterEach(() => {
      for (const server of servers.splice(0)) server.close();
    });

    // Starts like a real binary for the launcher's `--version` check.
    const downloadedBody =
      '#!/bin/sh\nif [ "$1" = "--version" ]; then echo 1.0.0; exit 0; fi\necho "NATIVE_RAN $__VERCEL_CLI_NATIVE_SOURCE"\nexit 7\n';
    const packageName = `@vercel/vc-native-${hostTarget}`;

    async function startRegistry(
      opts: { body?: string; integrity?: string; metadataStatus?: number } = {}
    ) {
      const pkgRoot = mkdtempSync(join(tmpdir(), 'vc-native-pkg-'));
      tempDirs.push(pkgRoot);
      const binPath = join(pkgRoot, 'package', 'bin', 'vercel');
      mkdirSync(dirname(binPath), { recursive: true });
      writeFileSync(binPath, opts.body ?? downloadedBody);
      chmodSync(binPath, 0o755);
      writeFileSync(
        join(pkgRoot, 'package', 'package.json'),
        JSON.stringify({ name: packageName, version: cliVersion })
      );
      const tarballPath = join(pkgRoot, 'native.tgz');
      const packed = spawnSync(
        'tar',
        ['-czf', tarballPath, '-C', pkgRoot, 'package'],
        // Keep macOS from adding AppleDouble entries.
        { env: { ...process.env, COPYFILE_DISABLE: '1' } }
      );
      expect(packed.status, String(packed.stderr)).toBe(0);
      const tarball = new Uint8Array(readFileSync(tarballPath));
      const integrity =
        opts.integrity ??
        `sha512-${createHash('sha512').update(tarball).digest('base64')}`;

      const hits: string[] = [];
      let url = '';
      const server = createServer((req, res) => {
        hits.push(req.url ?? '');
        if (req.url === `/${packageName.replace('/', '%2f')}/${cliVersion}`) {
          res.statusCode = opts.metadataStatus ?? 200;
          res.setHeader('content-type', 'application/json');
          res.end(
            JSON.stringify({
              name: packageName,
              version: cliVersion,
              dist: { tarball: `${url}/native.tgz`, integrity },
            })
          );
        } else if (req.url === '/native.tgz') {
          res.end(tarball);
        } else {
          res.statusCode = 404;
          res.end();
        }
      });
      servers.push(server);
      await new Promise<void>(resolve =>
        server.listen(0, '127.0.0.1', () => resolve())
      );
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      return {
        hits,
        env: {
          __VERCEL_NATIVE_DOWNLOAD: '',
          __VERCEL_NATIVE_DOWNLOAD_REGISTRY: url,
        },
      };
    }

    // The XDG cache directory, or the macOS default under the test's HOME.
    function cachedBinary(root: string) {
      const relative = ['com.vercel.cli', 'native', cliVersion, hostTarget];
      return [
        join(root, 'cache', ...relative),
        join(root, 'home', 'Library', 'Caches', ...relative),
      ]
        .map(dir => join(dir, 'vercel'))
        .find(existsSync);
    }

    it('downloads it once, checks it, and runs it from the cache', async () => {
      const registry = await startRegistry();
      const install = buildInstall({ fullCLI: true });

      const first = await install.runAsync(['whoami'], registry.env);
      expect(first.status, first.stderr).toBe(7);
      expect(first.stdout.trim()).toBe('NATIVE_RAN download');
      expect(first.stderr).toContain(
        `Downloading the Vercel CLI binary for ${hostTarget}…`
      );
      expect(registry.hits).toHaveLength(2);
      const binary = cachedBinary(install.root);
      expect(binary).toBeDefined();
      // Temporary files are gone, and nothing was written into node_modules.
      expect(readdirSync(dirname(binary!))).toEqual(['vercel']);
      expect(existsSync(join(install.root, 'node_modules', packageName))).toBe(
        false
      );

      const second = await install.runAsync(['whoami'], registry.env);
      expect(second.status).toBe(7);
      expect(second.stdout.trim()).toBe('NATIVE_RAN cache');
      expect(second.stderr).toBe('');
      expect(registry.hits).toHaveLength(2);
    });

    it('keeps stderr quiet with --json', async () => {
      const registry = await startRegistry();
      const install = buildInstall({ fullCLI: true });
      const result = await install.runAsync(['whoami', '--json'], registry.env);
      expect(result.status).toBe(7);
      expect(result.stdout.trim()).toBe('NATIVE_RAN download');
      expect(result.stderr).toBe('');
    });

    it.each([
      [
        'the checksum does not match',
        { integrity: `sha512-${Buffer.alloc(64).toString('base64')}` },
        'checksum mismatch',
      ],
      [
        'the binary cannot start',
        { body: '#!/bin/sh\nexit 1\n' },
        "the binary didn't start",
      ],
      ['the registry has no such version', { metadataStatus: 404 }, 'HTTP 404'],
    ])('falls back to Node.js when %s, and waits a day to try again', async (_, opts, detail) => {
      const registry = await startRegistry(opts);
      const install = buildInstall({ fullCLI: true });
      const env = { ...registry.env, ...telemetryEnv };

      const first = await install.runAsync(telemetryArgs, env);
      expect(first.status, first.stderr).toBe(0);
      expect(first.stderr).toContain(
        `! Couldn't download the Vercel CLI binary (${detail}), so Node.js is running this command. The CLI tries again in 24 hours.`
      );
      expect(launchEvents(first.stderr)).toEqual([
        'launcher:dist',
        `launcher_target:${hostTarget}`,
        'launcher_fallback:download_failed',
      ]);
      expect(cachedBinary(install.root)).toBeUndefined();

      const hits = registry.hits.length;
      const second = await install.runAsync(telemetryArgs, env);
      expect(second.status, second.stderr).toBe(0);
      expect(second.stderr).not.toContain("Couldn't download");
      expect(launchEvents(second.stderr)).toContain(
        'launcher_fallback:download_failed'
      );
      expect(registry.hits).toHaveLength(hits);
    });

    it('falls back quietly when the cache cannot be written', async () => {
      const registry = await startRegistry();
      const install = buildInstall({ fullCLI: true });
      // A file where the cache directory should go makes mkdir fail.
      const notADirectory = join(install.root, 'cache-file');
      writeFileSync(notADirectory, '');
      const env = {
        ...registry.env,
        ...telemetryEnv,
        XDG_CACHE_HOME: notADirectory,
      };
      for (let run = 0; run < 2; run++) {
        const result = await install.runAsync(telemetryArgs, env);
        expect(result.status, result.stderr).toBe(0);
        expect(result.stderr).not.toContain('Downloading');
        expect(result.stderr).not.toContain("Couldn't download");
        expect(launchEvents(result.stderr)).toEqual([
          'launcher:dist',
          `launcher_target:${hostTarget}`,
          'launcher_fallback:target_missing',
        ]);
      }
      expect(registry.hits).toEqual([]);
    });

    it('removes temporary files left by a killed download', async () => {
      const registry = await startRegistry();
      const install = buildInstall({ fullCLI: true });
      const cacheDir = join(
        install.root,
        'cache',
        'com.vercel.cli',
        'native',
        cliVersion,
        hostTarget
      );
      mkdirSync(join(cacheDir, '.extract-old', 'package'), { recursive: true });
      writeFileSync(join(cacheDir, '.download-old.tgz'), 'partial');
      writeFileSync(join(cacheDir, '.download-running.tgz'), 'partial');
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      utimesSync(join(cacheDir, '.extract-old'), hourAgo, hourAgo);
      utimesSync(join(cacheDir, '.download-old.tgz'), hourAgo, hourAgo);

      const result = await install.runAsync(['whoami'], registry.env);
      expect(result.status, result.stderr).toBe(7);
      // A recent file may belong to a download that is still running.
      expect(readdirSync(cacheDir).sort()).toEqual([
        '.download-running.tgz',
        'vercel',
      ]);
    });

    it('downloads for --version like any other command', async () => {
      const registry = await startRegistry();
      const install = buildInstall({ fullCLI: true });
      const result = await install.runAsync(['--version'], registry.env);
      expect(result.status, result.stderr).toBe(0);
      // The test binary answers --version with 1.0.0.
      expect(result.stdout.trim()).toBe('1.0.0');
      expect(result.stderr).toContain('Downloading the Vercel CLI binary');
      expect(registry.hits).toHaveLength(2);
    });

    it('never downloads for a repository checkout', async () => {
      const registry = await startRegistry();
      const root = mkdtempSync(join(tmpdir(), 'vc-checkout-'));
      tempDirs.push(root);
      const result = await new Promise<{
        status: number | null;
        stderr: string;
      }>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [join(distDir, 'vc.js'), ...telemetryArgs],
          {
            cwd: root,
            env: { ...cleanEnv(root), ...registry.env, ...telemetryEnv },
          }
        );
        let stderr = '';
        child.stderr.setEncoding('utf8').on('data', data => (stderr += data));
        child.on('error', reject);
        child.on('close', status => resolve({ status, stderr }));
      });
      expect(result.status, result.stderr).toBe(0);
      expect(launchEvents(result.stderr)).toEqual([
        'launcher:dist',
        `launcher_target:${hostTarget}`,
        'launcher_fallback:target_missing',
      ]);
      expect(registry.hits).toEqual([]);
    });

    it('does not download for an opted-out user', async () => {
      const registry = await startRegistry();
      const install = buildInstall({ fullCLI: true });
      const result = await install.runAsync(telemetryArgs, {
        ...registry.env,
        ...telemetryEnv,
        VERCEL_CLI_USE_NATIVE_BINARY: '0',
      });
      expect(result.status, result.stderr).toBe(0);
      expect(launchEvents(result.stderr)).toEqual([
        'launcher:dist',
        `launcher_target:${hostTarget}`,
        'launcher_fallback:opt_out',
      ]);
      expect(registry.hits).toEqual([]);
    });

    it('never downloads for @vercel/cli-support', async () => {
      const registry = await startRegistry();
      const install = buildInstall({ fullCLI: true });
      const pkgPath = join(
        install.root,
        'node_modules',
        'vercel',
        'package.json'
      );
      writeFileSync(
        pkgPath,
        JSON.stringify({
          ...JSON.parse(readFileSync(pkgPath, 'utf8')),
          name: '@vercel/cli-support',
        })
      );
      const result = await install.runAsync(telemetryArgs, {
        ...registry.env,
        ...telemetryEnv,
      });
      expect(result.status, result.stderr).toBe(0);
      expect(launchEvents(result.stderr)).toEqual(['launcher:cli-support']);
      expect(registry.hits).toEqual([]);
    });
  }
);
