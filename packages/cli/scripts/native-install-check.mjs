#!/usr/bin/env node
// Install the packed `vercel` from a local registry with each package manager
// and prove the launcher runs the native binary for this host's libc:
//   - the expected @vercel/vc-native-linux-<arch>[-musl] package is installed
//     and visible to the launcher; npm and pnpm install no other variant,
//     Yarn classic (which ignores `libc`) installs at most both Linux ones;
//   - `vercel --version` succeeds, reports the native build, and strace shows
//     the expected package's binary was exec'd and the other variant's never.
// `vercel` has no regular dependencies in the fixture, so the JS CLI cannot
// silently stand in for a missing or unrunnable native binary.
//
// Uses only Node builtins plus `tar`, `strace` and `file`, so it runs on a
// bare Alpine or Ubuntu host. Fixture: prepare-native-install-check.mjs.
//
// Usage:
//   node native-install-check.mjs --packages <dir> --libc <glibc|musl> \
//     [--package-managers npm,pnpm,yarn] [--work <dir>]

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packagesDir = resolve(requiredArg('--packages'));
const registry = loadRegistry(packagesDir);
let registryUrl = '';

// Installs run synchronously, so the registry lives in a child process.
if (process.argv.includes('--serve')) {
  const server = createServer((req, res) => {
    registryUrl = `http://${req.headers.host}/`;
    serve(req, res);
  });
  server.listen(0, '127.0.0.1', () => {
    process.stdout.write(`${server.address().port}\n`);
  });
} else {
  await main();
}

async function main() {
  const libc = requiredArg('--libc');
  const packageManagers = (optionalArg('--package-managers') ?? 'npm,pnpm,yarn')
    .split(',')
    .filter(Boolean);
  const workRoot = resolve(
    optionalArg('--work') ?? join(tmpdir(), 'vc-native-install-check')
  );

  if (libc !== 'glibc' && libc !== 'musl') {
    throw new Error(`--libc must be glibc or musl, got ${libc}`);
  }
  if (process.platform !== 'linux') {
    throw new Error(`install-check runs on Linux, not ${process.platform}`);
  }
  const hostLibc = process.report.getReport().header.glibcVersionRuntime
    ? 'glibc'
    : 'musl';
  if (hostLibc !== libc) {
    throw new Error(`Expected a ${libc} host, but Node reports ${hostLibc}`);
  }

  const base = `@vercel/vc-native-linux-${process.arch}`;
  const vercel = registry.get('vercel');
  if (!vercel) throw new Error(`No vercel tarball in ${packagesDir}`);
  const target = {
    libc,
    version: vercel.version,
    expected: libc === 'musl' ? `${base}-musl` : base,
    other: libc === 'musl' ? base : `${base}-musl`,
    interpreter:
      libc === 'musl'
        ? /interpreter \/lib\/ld-musl-/
        : /interpreter \S*\/ld-linux-/,
  };
  for (const name of [target.expected, target.other]) {
    if (!vercel.manifest.optionalDependencies?.[name]) {
      throw new Error(`vercel@${target.version} does not list ${name}`);
    }
  }

  const server = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), '--packages', packagesDir, '--serve'],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  );
  const port = await new Promise((resolvePort, reject) => {
    server.once('error', reject);
    server.once('exit', code => reject(new Error(`registry exited ${code}`)));
    server.stdout.once('data', chunk => resolvePort(String(chunk).trim()));
  });
  registryUrl = `http://127.0.0.1:${port}/`;

  const failures = [];
  try {
    rmSync(workRoot, { recursive: true, force: true });
    for (const pm of packageManagers) {
      try {
        check(pm, join(workRoot, pm), target);
        console.log(`PASS ${pm}: ${target.expected} selected and executed`);
      } catch (error) {
        failures.push(pm);
        console.error(`FAIL ${pm}: ${error.message}`);
      }
    }
  } finally {
    server.kill();
  }

  if (failures.length > 0) {
    console.error(`install-check failed for: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log(
    `install-check passed on linux-${process.arch} (${libc}) for ${packageManagers.join(', ')}`
  );
}

function check(pm, dir, { libc, version, expected, other, interpreter }) {
  const home = join(dir, 'home');
  const project = join(dir, 'project');
  mkdirSync(home, { recursive: true });
  mkdirSync(project, { recursive: true });
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify({ name: 'install-check', private: true }) + '\n'
  );
  writeFileSync(join(project, '.npmrc'), `registry=${registryUrl}\n`);

  const env = {
    ...process.env,
    HOME: home,
    XDG_CACHE_HOME: join(home, '.cache'),
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
    npm_config_registry: registryUrl,
  };
  delete env.VERCEL_VC_NATIVE;
  const spec = `vercel@${version}`;
  const install = {
    npm: [
      'npm',
      [
        'install',
        '--no-audit',
        '--no-fund',
        '--cache',
        join(dir, 'npm-cache'),
        spec,
      ],
    ],
    pnpm: [
      'pnpm',
      [
        'add',
        '--store-dir',
        join(dir, 'pnpm-store'),
        '--registry',
        registryUrl,
        spec,
      ],
    ],
    yarn: [
      'yarn',
      [
        'add',
        '--non-interactive',
        '--cache-folder',
        join(dir, 'yarn-cache'),
        '--registry',
        registryUrl,
        spec,
      ],
    ],
  }[pm];
  if (!install) throw new Error(`Unsupported package manager ${pm}`);
  run(install[0], install[1], { cwd: project, env });

  const installed = nativePackagesVisibleTo(
    join(project, 'node_modules', 'vercel')
  );
  console.log(`${pm} installed: ${installed.join(', ') || '(none)'}`);
  if (!installed.includes(expected)) {
    throw new Error(`${expected} was not installed`);
  }
  const allowed = pm === 'yarn' ? [expected, other] : [expected];
  const unexpected = installed.filter(name => !allowed.includes(name));
  if (unexpected.length > 0) {
    throw new Error(
      `unexpected native packages installed: ${unexpected.join(', ')}`
    );
  }

  const trace = join(dir, 'execve.log');
  const launcher = join(project, 'node_modules', '.bin', 'vercel');
  const result = spawnSync(
    'strace',
    ['-f', '-qq', '-e', 'trace=execve', '-o', trace, launcher, '--version'],
    {
      cwd: project,
      encoding: 'utf8',
      env: {
        ...env,
        VERCEL_TELEMETRY_DISABLED: '1',
        NO_UPDATE_NOTIFIER: '1',
      },
    }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `vercel --version exited ${result.status}\n${result.stdout}${result.stderr}`
    );
  }
  if (result.stdout.trim() !== version) {
    throw new Error(
      `vercel --version printed ${JSON.stringify(result.stdout)}`
    );
  }
  if (
    !new RegExp(`Vercel CLI ${escapeRegExp(version)} \\(native`).test(
      result.stderr
    )
  ) {
    throw new Error(`vercel --version did not run natively: ${result.stderr}`);
  }

  const execs = readFileSync(trace, 'utf8')
    .split('\n')
    .map(line => /execve\("([^"]+)".*\) = (-?\d+)/.exec(line))
    .filter(Boolean)
    .map(([, path, code]) => ({ path, code: Number(code) }));
  const binarySuffix = name => `/${name}/bin/vercel`;
  const ran = execs.find(
    exec => exec.code === 0 && exec.path.endsWith(binarySuffix(expected))
  );
  if (!ran) {
    throw new Error(
      `${expected}/bin/vercel was never executed:\n${execs.map(e => `${e.path} = ${e.code}`).join('\n')}`
    );
  }
  const wrong = execs.find(exec => exec.path.endsWith(binarySuffix(other)));
  if (wrong) throw new Error(`launcher tried ${wrong.path}`);

  const elf = execFileSync('file', ['-L', ran.path], { encoding: 'utf8' });
  if (!interpreter.test(elf)) {
    throw new Error(`${ran.path} is not a ${libc} binary: ${elf.trim()}`);
  }
  console.log(`${pm} executed: ${ran.path}`);
}

// The launcher walks up from vercel's real location and checks each
// `node_modules/@vercel` it passes (pnpm links optional deps next to it).
function nativePackagesVisibleTo(vercelDir) {
  const names = new Set();
  let dir = realpathSync(vercelDir);
  while (true) {
    const scope = join(dir, 'node_modules', '@vercel');
    if (existsSync(scope)) {
      for (const entry of readdirSync(scope)) {
        if (entry.startsWith('vc-native-')) names.add(`@vercel/${entry}`);
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return [...names].sort();
    dir = parent;
  }
}

function loadRegistry(dir) {
  const packages = new Map();
  for (const file of readdirSync(dir).filter(name => name.endsWith('.tgz'))) {
    const path = join(dir, file);
    const manifest = JSON.parse(
      execFileSync('tar', ['-xzOf', path, 'package/package.json'], {
        encoding: 'utf8',
      })
    );
    const bytes = readFileSync(path);
    packages.set(manifest.name, {
      version: manifest.version,
      manifest,
      file,
      path,
      shasum: createHash('sha1').update(bytes).digest('hex'),
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
    });
  }
  return packages;
}

function serve(req, res) {
  const url = new URL(req.url, registryUrl);
  const tarball = /^\/-\/([^/]+\.tgz)$/.exec(url.pathname);
  if (tarball) {
    const entry = [...registry.values()].find(pkg => pkg.file === tarball[1]);
    if (!entry) return notFound(res);
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.end(readFileSync(entry.path));
    return;
  }
  const entry = registry.get(decodeURIComponent(url.pathname.slice(1)));
  if (!entry) return notFound(res);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify({
      name: entry.manifest.name,
      'dist-tags': { latest: entry.version },
      versions: {
        [entry.version]: {
          ...entry.manifest,
          dist: {
            tarball: `${registryUrl}-/${entry.file}`,
            shasum: entry.shasum,
            integrity: entry.integrity,
          },
        },
      },
    })
  );
}

function notFound(res) {
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end('{"error":"not found"}');
}

function run(command, args, options) {
  const result = spawnSync(command, args, { ...options, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} exited ${result.status}\n${result.stdout}${result.stderr}`
    );
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function requiredArg(name) {
  const value = optionalArg(name);
  if (!value) throw new Error(`Missing required argument ${name}`);
  return value;
}

function optionalArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}
