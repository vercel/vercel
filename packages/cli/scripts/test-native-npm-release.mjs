import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { smokeTestBinary, signalProcessTree } from './smoke-test-binary.mjs';

// Run the existing native acceptance suite through the published vercel package
// and its native optional dependency, before promoting the candidate to latest.

const require_ = createRequire(import.meta.url);
const packageRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const prefix = requiredArg('--prefix');
const expectedVersion = requiredArg('--version');
const expectedPlatform = requiredArg('--platform');
const expectedArch = requiredArg('--arch');
const expectedNativePackage = requiredArg('--native-package');
const testRoot = resolve(requiredArg('--test-root'));
const xdgDataHome = join(testRoot, 'xdg-data');
const buildersDir = join(testRoot, 'builders');
const preinstallBuildersDir = join(testRoot, 'preinstalled-builders');
let preinstalledBuilderCount = 0;
let missingNativeDownload = 'not run';
const fixtureDir = join(testRoot, 'fixture');
const servicesFixtureDir = join(testRoot, 'services-fixture');
const cliRoot = await findInstalledPackage(prefix, 'vercel');
const cliEntrypoint = join(cliRoot, 'dist', 'vc.js');
const nativeRoot = await findPackageInCandidates(expectedNativePackage, [
  join(cliRoot, 'node_modules', expectedNativePackage),
  join(cliRoot, '..', expectedNativePackage),
]);
const nativeBinary = join(
  nativeRoot,
  'bin',
  expectedPlatform === 'win32' ? 'vercel.exe' : 'vercel'
);
const cliEnv = { ...process.env };
delete cliEnv.VERCEL_VC_NATIVE;
delete cliEnv.npm_config_prefix;
Object.assign(cliEnv, {
  CI: '1',
  FORCE_COLOR: '0',
  NO_COLOR: '1',
  NO_UPDATE_NOTIFIER: '1',
  VERCEL_BUILDERS_DIR: buildersDir,
  NPM_CONFIG_PREFIX: resolve(prefix),
  VERCEL_CLI_DISABLE_UPDATE_NOTIFIER: '1',
  VERCEL_TELEMETRY_DISABLED: '1',
  NEXT_TELEMETRY_DISABLED: '1',
  XDG_CACHE_HOME: join(testRoot, 'xdg-cache'),
  XDG_CONFIG_HOME: join(testRoot, 'xdg-config'),
  XDG_DATA_HOME: xdgDataHome,
  XDG_STATE_HOME: join(testRoot, 'xdg-state'),
});

await main();

async function main() {
  if (process.platform !== expectedPlatform || process.arch !== expectedArch) {
    throw new Error(
      `Runner is ${process.platform}-${process.arch}; expected ${expectedPlatform}-${expectedArch}.`
    );
  }
  if (cliEnv.VERCEL_TOKEN == null || cliEnv.VERCEL_TOKEN === '') {
    throw new Error(
      'VERCEL_TOKEN is required for native npm release validation.'
    );
  }
  if (cliEnv.VERCEL_TEAM_ID == null || cliEnv.VERCEL_TEAM_ID === '') {
    throw new Error(
      'VERCEL_TEAM_ID is required for native npm release validation.'
    );
  }

  await rm(testRoot, { recursive: true, force: true });
  await mkdir(testRoot, { recursive: true });
  await verifyInstalledPackage();

  const version = await runCli(['--version']);
  assertSucceeded(version, 'vc --version');
  if (version.stdout.trim() !== expectedVersion) {
    throw new Error(
      `vc --version printed ${JSON.stringify(
        version.stdout.trim()
      )}; expected ${expectedVersion}.`
    );
  }
  if (!version.stderr.includes('(native)')) {
    throw new Error('vc --version did not include the native marker.');
  }

  const whoami = await runCli(['whoami', '--scope', cliEnv.VERCEL_TEAM_ID], {
    displayArgs: ['whoami', '--scope', '***'],
  });
  assertSucceeded(whoami, 'vc whoami');
  if (!combinedOutput(whoami).trim()) {
    throw new Error('vc whoami returned no authenticated identity.');
  }

  const smokePassed = await smokeTestBinary({
    displayName: `npm vercel@${expectedVersion}`,
    executable: process.execPath,
    prefixArgs: [cliEntrypoint],
    env: cliEnv,
  });
  if (!smokePassed) {
    throw new Error('The shared binary smoke suite failed.');
  }

  await verifyMissingNativeDownload();
  await verifyBuildersPreinstall();
  await verifyBuilderCache();
  await verifyServicesBuildAndDev();
  await writeSummary();
}

async function verifyInstalledPackage() {
  const cliManifest = JSON.parse(
    await readFile(join(cliRoot, 'package.json'), 'utf8')
  );
  if (
    cliManifest.version !== expectedVersion ||
    cliManifest.optionalDependencies?.[expectedNativePackage] !==
      expectedVersion
  ) {
    throw new Error(
      `Expected vercel@${expectedVersion} with ${expectedNativePackage}@${expectedVersion}.`
    );
  }
  const nativeManifest = JSON.parse(
    await readFile(join(nativeRoot, 'package.json'), 'utf8')
  );
  if (nativeManifest.version !== expectedVersion) {
    throw new Error(
      `Installed ${expectedNativePackage}@${nativeManifest.version}; expected ${expectedVersion}.`
    );
  }
  if (!nativeManifest.os?.includes(expectedPlatform)) {
    throw new Error(
      `${expectedNativePackage} does not support ${expectedPlatform}.`
    );
  }
  if (!nativeManifest.cpu?.includes(expectedArch)) {
    throw new Error(
      `${expectedNativePackage} does not support ${expectedArch}.`
    );
  }
  const binaryStat = await stat(nativeBinary);
  if (!binaryStat.isFile() || binaryStat.size === 0) {
    throw new Error(`Native binary is missing or empty: ${nativeBinary}`);
  }
}

// An install that skips optional dependencies (`--omit=optional`, a lockfile
// created on another platform) has no native package. The launcher downloads
// the binary for its exact version into the CLI cache on first run. Prove it
// against the real registry with the packages this release published.
async function verifyMissingNativeDownload() {
  const omitPrefix = join(testRoot, 'omit-optional-prefix');
  const cacheHome = join(testRoot, 'download-cache');
  const target = expectedNativePackage.replace('@vercel/vc-native-', '');
  console.log(
    `\n$ npm install --global --omit=optional vercel@${expectedVersion}`
  );
  const install = await run(
    'npm',
    [
      'install',
      '--global',
      '--prefix',
      omitPrefix,
      '--omit=optional',
      `vercel@${expectedVersion}`,
    ],
    { cwd: testRoot, env: process.env, timeoutMs: 10 * 60_000 }
  );
  assertSucceeded(install, 'npm install --omit=optional');
  const omitCliRoot = await findInstalledPackage(omitPrefix, 'vercel');
  const launcher = join(omitCliRoot, 'dist', 'vc.js');
  try {
    await stat(join(omitCliRoot, 'dist', 'native-download.js'));
  } catch (error) {
    if (!isENOENT(error)) throw error;
    missingNativeDownload = `skipped (vercel@${expectedVersion} predates it)`;
    console.log(`\nvercel@${expectedVersion} predates the native download.`);
    return;
  }
  for (const candidate of [
    join(omitCliRoot, 'node_modules', expectedNativePackage),
    join(omitCliRoot, '..', expectedNativePackage),
  ]) {
    if (await stat(candidate).catch(() => null)) {
      throw new Error(
        `npm installed ${expectedNativePackage} despite --omit=optional.`
      );
    }
  }

  const env = {
    ...cliEnv,
    NPM_CONFIG_PREFIX: resolve(omitPrefix),
    XDG_CACHE_HOME: cacheHome,
  };
  console.log('\n$ vc telemetry status (no native package installed)');
  const first = await run(process.execPath, [launcher, 'telemetry', 'status'], {
    cwd: testRoot,
    env,
    timeoutMs: 10 * 60_000,
  });
  assertSucceeded(first, 'first run without the native package');
  if (
    !first.stderr.includes(`Downloading the Vercel CLI binary for ${target}…`)
  ) {
    throw new Error('The launcher did not download the native binary.');
  }
  if (first.stderr.includes("Couldn't download")) {
    throw new Error('The launcher could not download the native binary.');
  }
  const binary = join(
    cacheHome,
    'com.vercel.cli',
    'native',
    expectedVersion,
    target,
    'vercel'
  );
  if (!(await stat(binary).catch(() => null))?.isFile()) {
    throw new Error(`The downloaded binary is missing: ${binary}`);
  }

  console.log('\n$ vc --version (downloaded binary)');
  const second = await run(process.execPath, [launcher, '--version'], {
    cwd: testRoot,
    env,
    timeoutMs: 60_000,
  });
  assertSucceeded(second, 'vc --version from the download cache');
  if (second.stdout.trim() !== expectedVersion) {
    throw new Error(
      `vc --version printed ${JSON.stringify(second.stdout.trim())} from the download cache; expected ${expectedVersion}.`
    );
  }
  if (
    !second.stderr.includes('(native)') ||
    second.stderr.includes('Downloading')
  ) {
    throw new Error('vc --version did not run the cached native binary.');
  }
  missingNativeDownload = 'passed';
}

// Install and load every Builder in the embedded graph from the real
// registry. During Release this runs before `vercel` reaches latest, so it
// catches Builders (or their dependencies) that are missing, unpublished, or
// fail to load at the exact versions this CLI pins.
async function verifyBuildersPreinstall() {
  await rm(preinstallBuildersDir, { recursive: true, force: true });
  const preinstall = await runCli(['builders', 'preinstall'], {
    timeoutMs: 15 * 60 * 1000,
    env: { ...cliEnv, VERCEL_BUILDERS_DIR: preinstallBuildersDir },
  });
  assertSucceeded(preinstall, 'vc builders preinstall');
  const match = combinedOutput(preinstall).match(/Preinstalled (\d+) Builders/);
  if (!match || Number(match[1]) === 0) {
    throw new Error('vc builders preinstall did not report any Builders.');
  }
  const snapshot = await snapshotDirectory(preinstallBuildersDir);
  if (!snapshot.some(entry => entry.path.endsWith('.vercel-builder-graph'))) {
    throw new Error(
      'vc builders preinstall did not write a Builder cache completion marker.'
    );
  }
  preinstalledBuilderCount = Number(match[1]);
}

async function verifyBuilderCache() {
  await createBuildFixture();
  await rm(buildersDir, { recursive: true, force: true });

  const cold = await runCli(['build'], {
    cwd: fixtureDir,
    timeoutMs: 10 * 60 * 1000,
  });
  assertSucceeded(cold, 'cold vc build');
  await assertBuildOutput();

  const coldSnapshot = await snapshotDirectory(buildersDir);
  if (coldSnapshot.length === 0) {
    throw new Error(
      'The cold native build did not populate VERCEL_BUILDERS_DIR.'
    );
  }
  const markers = coldSnapshot.filter(
    entry =>
      entry.path.endsWith('/.vercel-builder-graph') ||
      entry.path === '.vercel-builder-graph'
  );
  if (markers.length === 0) {
    throw new Error('The native Builder cache has no completion marker.');
  }

  let foundStaticBuild = false;
  for (const marker of markers) {
    const graphRoot = resolve(buildersDir, marker.path, '..');
    try {
      const manifestPath = require_.resolve(
        '@vercel/static-build/package.json',
        { paths: [graphRoot] }
      );
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (manifest.name === '@vercel/static-build') {
        foundStaticBuild = true;
        break;
      }
    } catch {}
  }
  if (!foundStaticBuild) {
    throw new Error(
      'The Builder cache did not materialize @vercel/static-build.'
    );
  }

  await rm(join(fixtureDir, '.vercel', 'output'), {
    recursive: true,
    force: true,
  });
  const warm = await runCli(['build'], {
    cwd: fixtureDir,
    timeoutMs: 10 * 60 * 1000,
  });
  assertSucceeded(warm, 'warm vc build');
  await assertBuildOutput();

  const warmSnapshot = await snapshotDirectory(buildersDir);
  if (JSON.stringify(warmSnapshot) !== JSON.stringify(coldSnapshot)) {
    throw new Error(
      'The warm native build changed the completed Builder cache; expected reuse without reinstallation.'
    );
  }
}

async function createBuildFixture() {
  await mkdir(join(fixtureDir, '.vercel'), { recursive: true });
  await writeFile(
    join(fixtureDir, '.vercel', 'project.json'),
    `${JSON.stringify({
      orgId: '.',
      projectId: '.',
      settings: { framework: null },
    })}\n`
  );
  await writeFile(
    join(fixtureDir, 'package.json'),
    `${JSON.stringify({
      private: true,
      scripts: { build: 'node build.mjs' },
    })}\n`
  );
  await writeFile(
    join(fixtureDir, 'build.mjs'),
    "import { mkdir, writeFile } from 'node:fs/promises';\nawait mkdir('public', { recursive: true });\nawait writeFile('public/index.txt', 'native builder ok\\n');\n"
  );
}

async function assertBuildOutput() {
  const output = await readFile(
    join(fixtureDir, '.vercel', 'output', 'static', 'index.txt'),
    'utf8'
  );
  if (output !== 'native builder ok\n') {
    throw new Error('vc build produced unexpected static output.');
  }
  const config = JSON.parse(
    await readFile(join(fixtureDir, '.vercel', 'output', 'config.json'), 'utf8')
  );
  if (config.version !== 3) {
    throw new Error('vc build did not produce Build Output API version 3.');
  }
}

async function verifyServicesBuildAndDev() {
  await createServicesFixture();

  const build = await runCli(['build'], {
    cwd: servicesFixtureDir,
    timeoutMs: 15 * 60 * 1000,
  });
  assertSucceeded(build, 'multi-service vc build');

  const compiledConfig = JSON.parse(
    await readFile(join(servicesFixtureDir, '.vercel', 'vercel.json'), 'utf8')
  );
  if (
    JSON.stringify(Object.keys(compiledConfig.services ?? {}).sort()) !==
    JSON.stringify(['go', 'python', 'web'])
  ) {
    throw new Error('vercel.ts did not compile all three services.');
  }

  const nodeExecution = JSON.parse(
    await readFile(join(servicesFixtureDir, 'web', 'node-exec.json'), 'utf8')
  );
  const expectedNodeName = process.platform === 'win32' ? 'node.exe' : 'node';
  if (
    nodeExecution.releaseName !== 'node' ||
    basename(nodeExecution.execPath).toLowerCase() !== expectedNodeName
  ) {
    throw new Error(
      `The direct Node build command ran through ${nodeExecution.execPath} instead of host Node.`
    );
  }

  const rootOutputConfig = JSON.parse(
    await readFile(
      join(servicesFixtureDir, '.vercel', 'output', 'config.json'),
      'utf8'
    )
  );
  if (rootOutputConfig.version !== 3) {
    throw new Error(
      'The multi-service build did not produce Build Output API version 3.'
    );
  }
  for (const service of ['web', 'python', 'go']) {
    const serviceConfig = JSON.parse(
      await readFile(
        join(
          servicesFixtureDir,
          '.vercel',
          'output',
          'services',
          service,
          'config.json'
        ),
        'utf8'
      )
    );
    if (serviceConfig.version !== 3) {
      throw new Error(
        `Service ${service} did not produce Build Output API version 3.`
      );
    }
  }

  const esbuildSnapshot = await snapshotDirectory(
    join(testRoot, 'xdg-cache', 'vercel', 'native', 'esbuild')
  );
  if (
    !esbuildSnapshot.some(entry => /(^|\/)esbuild(?:\.exe)?$/.test(entry.path))
  ) {
    throw new Error(
      'Compiling vercel.ts did not materialize embedded esbuild.'
    );
  }

  await assertBuildersMaterialized([
    '@vercel/next',
    '@vercel/python',
    '@vercel/go',
  ]);
  await verifyServicesDev();
}

async function createServicesFixture() {
  await rm(servicesFixtureDir, { recursive: true, force: true });
  await writeFixtureFile(
    '.vercel/project.json',
    `${JSON.stringify({
      orgId: '.',
      projectId: '.',
      settings: { framework: null },
    })}\n`
  );
  await writeFixtureFile(
    'package.json',
    `${JSON.stringify({ name: 'native-services-acceptance', private: true })}\n`
  );
  await writeFixtureFile(
    'vercel.ts',
    `export default {
  rewrites: [
    { source: '/api/python/(.*)', destination: { service: 'python' } },
    { source: '/api/go/(.*)', destination: { service: 'go' } },
    { source: '/(.*)', destination: { service: 'web' } },
  ],
  services: {
    web: {
      root: 'web',
      framework: 'nextjs',
      buildCommand: 'node record-node.mjs && node node_modules/next/dist/bin/next build',
    },
    python: {
      root: 'python',
      framework: 'fastapi',
      runtime: 'python',
      entrypoint: 'server.py',
    },
    go: {
      root: 'go',
      framework: 'go',
      runtime: 'go',
      entrypoint: 'main.go',
    },
  },
};
`
  );
  await writeFixtureFile(
    'web/package.json',
    `${JSON.stringify({
      name: 'native-services-web',
      private: true,
      scripts: { build: 'next build', dev: 'next dev' },
      dependencies: {
        next: '14.2.31',
        react: '18.3.1',
        'react-dom': '18.3.1',
      },
    })}\n`
  );
  await writeFixtureFile(
    'web/record-node.mjs',
    `import { writeFile } from 'node:fs/promises';
await writeFile('node-exec.json', JSON.stringify({
  execPath: process.execPath,
  argv0: process.argv0,
  releaseName: process.release.name,
}));
`
  );
  await writeFixtureFile(
    'web/app/layout.js',
    `export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
`
  );
  await writeFixtureFile(
    'web/app/page.js',
    `export default function Page() {
  return <main>next-service-ok</main>;
}
`
  );
  await writeFixtureFile(
    'python/pyproject.toml',
    `[project]
name = "native-services-python"
version = "0.0.0"
requires-python = ">=3.12"
dependencies = ["fastapi==0.133.0"]
`
  );
  await writeFixtureFile(
    'python/server.py',
    `from fastapi import FastAPI

app = FastAPI()

@app.get("/{path:path}")
def route(path: str):
    return {"service": "python", "path": "/" + path}
`
  );
  await writeFixtureFile(
    'go/go.mod',
    'module native-services-go\n\ngo 1.23\n\ntoolchain go1.23.12\n'
  );
  await writeFixtureFile(
    'go/main.go',
    `package main

import (
  "encoding/json"
  "net/http"
  "os"
)

func main() {
  http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    _ = json.NewEncoder(w).Encode(map[string]string{
      "service": "go",
      "path": r.URL.Path,
    })
  })
  port := os.Getenv("PORT")
  if port == "" { port = "3000" }
  if err := http.ListenAndServe(":"+port, nil); err != nil { panic(err) }
}
`
  );
}

async function writeFixtureFile(relativePath, contents) {
  const path = join(servicesFixtureDir, relativePath);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, contents);
}

async function assertBuildersMaterialized(builderNames) {
  const cacheEntries = await snapshotDirectory(buildersDir);
  const graphRoots = cacheEntries
    .filter(entry => entry.path.endsWith('/.vercel-builder-graph'))
    .map(entry => resolve(buildersDir, entry.path, '..'));

  for (const builderName of builderNames) {
    let found = false;
    for (const graphRoot of graphRoots) {
      try {
        const manifestPath = require_.resolve(`${builderName}/package.json`, {
          paths: [graphRoot],
        });
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        if (manifest.name === builderName) {
          found = true;
          break;
        }
      } catch {}
    }
    if (!found) {
      throw new Error(
        `The native Builder cache did not materialize ${builderName}.`
      );
    }
  }
}

async function verifyServicesDev() {
  const port = await getAvailablePort();
  const args = ['dev', '--local', '--listen', `127.0.0.1:${port}`];
  console.log(`\n$ vc dev --local --listen 127.0.0.1:${port}`);
  // Spawn (not run()) so the long-lived process can be stopped explicitly.
  const child = spawn(process.execPath, [cliEntrypoint, ...args], {
    detached: process.platform !== 'win32',
    cwd: servicesFixtureDir,
    env: cliEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  let closed = false;
  let spawnError;
  const onData = chunk => {
    const text = chunk.toString();
    output = `${output}${text}`.slice(-200_000);
    process.stdout.write(chunk);
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('error', error => {
    spawnError = error;
  });
  child.on('close', () => {
    closed = true;
  });

  const request = path =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      signal: AbortSignal.timeout(5000),
    });
  const processFailed = () => closed || Boolean(spawnError);
  const diagnostics = () =>
    `${spawnError ? `${spawnError.message}\n` : ''}${output}`;

  try {
    await Promise.all([
      waitForService(
        () => request('/'),
        async response =>
          response.status === 200 &&
          (await response.text()).includes('next-service-ok'),
        processFailed,
        diagnostics
      ),
      waitForService(
        () => request('/api/python/health'),
        async response => {
          if (response.status !== 200) return false;
          const body = await response.json();
          return body.service === 'python' && body.path.includes('health');
        },
        processFailed,
        diagnostics
      ),
      waitForService(
        () => request('/api/go/health'),
        async response => {
          if (response.status !== 200) return false;
          const body = await response.json();
          return body.service === 'go' && body.path.includes('health');
        },
        processFailed,
        diagnostics
      ),
    ]);
  } finally {
    await stopChild(child);
  }
}

async function waitForService(request, accepts, processFailed, diagnostics) {
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    if (processFailed()) {
      throw new Error(
        `vc dev exited before all services were ready:\n${diagnostics()}`
      );
    }
    try {
      const response = await request();
      if (await accepts(response)) return;
    } catch {}
    await new Promise(resolvePromise => setTimeout(resolvePromise, 2000));
  }
  throw new Error(`Timed out waiting for vc dev services:\n${diagnostics()}`);
}

async function getAvailablePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise(resolvePromise => server.close(resolvePromise));
  if (!port) throw new Error('Could not reserve a port for vc dev.');
  return port;
}

async function stopChild(child) {
  if (
    child.stdout.closed &&
    child.stderr.closed &&
    (child.exitCode !== null || child.signalCode !== null)
  )
    return;
  let closed = false;
  const done = new Promise(resolvePromise =>
    child.once('close', () => {
      closed = true;
      resolvePromise();
    })
  );
  signalProcessTree(child, 'SIGTERM');
  await Promise.race([
    done,
    new Promise(resolvePromise => setTimeout(resolvePromise, 15_000)),
  ]);
  if (!closed) {
    signalProcessTree(child, 'SIGKILL');
    await done;
  }
}

export async function snapshotDirectory(root) {
  const entries = [];
  await visit(root, '');
  return entries.sort((left, right) => left.path.localeCompare(right.path));

  async function visit(directory, relativeDirectory) {
    let children;
    try {
      children = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (isENOENT(error)) return;
      throw error;
    }

    for (const entry of children) {
      // VLT may finish deleting stale package trees after the build process exits.
      // They are not part of the completed graph and can disappear while walking.
      if (entry.name.includes('.VLT.DELETE.')) continue;

      const absolutePath = join(directory, entry.name);
      const relativePath = join(relativeDirectory, entry.name).replaceAll(
        '\\',
        '/'
      );
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
        continue;
      }
      try {
        const metadata = await stat(absolutePath);
        entries.push({
          path: relativePath,
          size: metadata.size,
          mtimeMs: metadata.mtimeMs,
        });
      } catch (error) {
        if (!isENOENT(error)) throw error;
      }
    }
  }
}

function isENOENT(error) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function findInstalledPackage(installPrefix, name) {
  const packageParts = name.split('/');
  const candidates = [
    // Windows global prefix layout.
    join(installPrefix, 'node_modules', ...packageParts),
    // POSIX global prefix layout.
    join(installPrefix, 'lib', 'node_modules', ...packageParts),
  ];
  return findPackageInCandidates(name, candidates);
}

async function findPackageInCandidates(name, candidates) {
  for (const candidate of candidates) {
    try {
      if ((await stat(join(candidate, 'package.json'))).isFile()) {
        return candidate;
      }
    } catch {}
  }
  throw new Error(
    `Could not find npm-installed package ${name} in ${candidates.join(', ')}.`
  );
}

function runCli(
  args,
  {
    cwd = packageRoot,
    timeoutMs = 60_000,
    displayArgs = args,
    env = cliEnv,
  } = {}
) {
  console.log(`\n$ vc ${displayArgs.join(' ')}`);
  return run(process.execPath, [cliEntrypoint, ...args], {
    cwd,
    env,
    timeoutMs,
  });
}

function run(command, args, { cwd, env, timeoutMs }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      detached: process.platform !== 'win32',
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    const timer = setTimeout(() => {
      signalProcessTree(child, 'SIGKILL');
    }, timeoutMs);
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, stdout, stderr });
    });
  });
}

function assertSucceeded(result, label) {
  if (result.signal || result.code !== 0) {
    throw new Error(
      `${label} failed with ${result.signal ? `signal ${result.signal}` : `exit code ${result.code}`}.`
    );
  }
}

function combinedOutput(result) {
  return `${result.stdout}\n${result.stderr}`;
}

async function writeSummary() {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const nativeDigest = createHash('sha256')
    .update(await readFile(nativeBinary))
    .digest('hex');
  const lines = [
    `### ${expectedPlatform}-${expectedArch}`,
    '',
    `- CLI package: \`vercel@${expectedVersion}\``,
    `- Native optional dependency: \`${expectedNativePackage}@${expectedVersion}\``,
    `- Native SHA-256: \`${nativeDigest}\``,
    '- Version and native marker: passed',
    '- Authenticated command: passed',
    '- Shared smoke suite: passed',
    `- Native download without optional dependencies: ${missingNativeDownload}`,
    `- Preinstall all Builders: passed (${preinstalledBuilderCount})`,
    '- Cold Builder installation: passed',
    '- Warm Builder cache reuse: passed',
    '- TypeScript services config and embedded esbuild: passed',
    '- Next.js, Python, and Go service builds: passed',
    '- Next.js, Python, and Go local development: passed',
    '- Direct host Node build command: passed',
    '',
  ];
  await writeFile(summaryPath, `${lines.join('\n')}\n`, { flag: 'a' });
}

function requiredArg(name) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`Missing required argument ${name}.`);
  return value;
}
