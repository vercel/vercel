/**
 * Build script for @vercel-internals/ipc-proxy.
 *
 * In addition to the standard TypeScript build (declarations + esbuild),
 * this compiles the language-agnostic IPC proxy Go source into static,
 * CGO-free binaries for each supported Lambda architecture. The binaries
 * are emitted to `bin/` and shipped in the npm tarball, so consuming
 * builders (e.g. @vercel/go, @vercel/rust) never need a Go toolchain at
 * deploy time — they simply copy and ship the prebuilt binary.
 */
import { Readable } from 'node:stream';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirp, pathExists, remove } from 'fs-extra';
import { extract } from 'tar';
import execa from 'execa';
import { tsc, esbuild } from '../../utils/build.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Minimum Go version required to compile the IPC proxy. */
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

/** Target architectures we ship prebuilt proxy binaries for. */
const TARGETS = [
  { goarch: 'amd64', output: 'proxy-linux-amd64' },
  { goarch: 'arm64', output: 'proxy-linux-arm64' },
];

/**
 * Checks if `go` is on the PATH and is >= 1.23.
 *
 * Returns `true` when a suitable system Go is available. We intentionally
 * do not return a curated env here: the build must inherit the real
 * environment (GOCACHE, LOCALAPPDATA, USERPROFILE, HOME, ...) so that the
 * Go toolchain works across Linux, macOS, and Windows runners.
 */
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

/**
 * Downloads Go to a deterministic temp directory and returns env overrides
 * (to be merged on top of `process.env`) pointing to it. If the directory
 * already contains a Go installation, the download is skipped.
 *
 * This is a fallback only — all CI runners (GitHub-hosted) and typical dev
 * machines already have Go installed, so `hasSystemGo()` short-circuits
 * before reaching here. The `.tar.gz` archive is not the Windows
 * distribution format, so this fallback is unsupported on Windows.
 */
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

/**
 * Resolves env overrides for compiling the IPC proxy. Uses system Go when
 * available (no overrides — inherit `process.env`), otherwise downloads Go
 * and points to it.
 */
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
    // Inherit the full environment (so the Go toolchain can locate its
    // cache, home, etc. on every OS) and only override the cross-compile
    // settings. There is no need to sanitize the env here because we are
    // compiling our own proxy source at package-build time, not untrusted
    // user code.
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
