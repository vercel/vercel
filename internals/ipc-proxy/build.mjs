// Standard TS build plus cross-compilation of the proxy Go source into static,
// CGO-free per-arch binaries shipped in `bin/`, so consuming builders never
// need a Go toolchain at deploy time.
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirp, pathExists, remove } from 'fs-extra';
import { extract } from 'tar';
import execa from 'execa';
import { tsc, esbuild } from '../../utils/build.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GO_VERSION = '1.23.12';

const platformMap = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows',
};

const archMap = {
  x64: 'amd64',
  arm64: 'arm64',
};

const TARGETS = [
  { goarch: 'amd64', output: 'proxy-linux-amd64' },
  { goarch: 'arm64', output: 'proxy-linux-arm64' },
];

async function hasSystemGo() {
  try {
    const { stdout } = await execa('go', ['version']);
    const versionMatch = stdout.match(/go(\d+)\.(\d+)/);
    if (!versionMatch?.[1] || !versionMatch[2]) return false;

    const major = parseInt(versionMatch[1], 10);
    const minor = parseInt(versionMatch[2], 10);
    if (major < 1 || (major === 1 && minor < 23)) return false;

    return true;
  } catch {
    return false;
  }
}

// Fallback for environments without Go on PATH. Returns env overrides merged
// onto `process.env`. Unix-only: the `.tar.gz` archive isn't the Windows format.
async function downloadGo() {
  if (process.platform === 'win32') {
    throw new Error(
      'Go >= 1.23 is required to build the IPC proxy but was not found on PATH. ' +
        'Please install Go: https://go.dev/dl/'
    );
  }

  const goPlatform = platformMap[process.platform] || process.platform;
  const goArch = archMap[process.arch] || process.arch;
  const destDir = join(tmpdir(), `vercel-ipc-proxy-go-${GO_VERSION}`);
  const goBin = join(destDir, 'bin', 'go');

  const overrides = () => ({
    PATH: `${join(destDir, 'bin')}${delimiter}${process.env.PATH || ''}`,
    GOROOT: destDir,
  });

  if (await pathExists(goBin)) {
    return overrides();
  }

  const filename = `go${GO_VERSION}.${goPlatform}-${goArch}.tar.gz`;
  const url = `https://dl.google.com/go/${filename}`;

  console.log(`Downloading Go ${GO_VERSION}: ${url}`);

  await remove(destDir);
  await mkdirp(destDir);

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download Go: ${url} (${res.status})`);
  }

  await new Promise((resolve, reject) => {
    const body = Readable.fromWeb(res.body);
    const extractor = extract({ cwd: destDir, strip: 1 });
    body.on('error', reject);
    extractor.on('error', reject);
    extractor.on('finish', resolve);
    body.pipe(extractor);
  });

  return overrides();
}

async function resolveGoEnvOverrides() {
  if (await hasSystemGo()) return {};
  return downloadGo();
}

async function compileProxyBinaries() {
  const bootstrapDir = join(__dirname, 'bootstrap');
  const binDir = join(__dirname, 'bin');
  await mkdirp(binDir);

  const goEnvOverrides = await resolveGoEnvOverrides();

  for (const { goarch, output } of TARGETS) {
    const outputPath = join(binDir, output);
    console.log(`Compiling IPC proxy: linux/${goarch} -> bin/${output}`);
    // Inherit the full env so the Go toolchain can locate its cache/home on
    // every OS; only override the cross-compile settings.
    await execa(
      'go',
      ['build', '-trimpath', '-ldflags=-s -w', '-o', outputPath, '.'],
      {
        cwd: bootstrapDir,
        env: {
          ...process.env,
          ...goEnvOverrides,
          GOARCH: goarch,
          GOOS: 'linux',
          CGO_ENABLED: '0',
        },
        stdio: 'inherit',
      }
    );
  }
}

await Promise.all([tsc(), esbuild()]);
await compileProxyBinaries();
