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
import { join, dirname } from 'node:path';
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
 * Returns a sanitized env if found, undefined otherwise.
 */
async function findSystemGo() {
  try {
    const { stdout } = await execa('go', ['version']);
    const versionMatch = stdout.match(/go(\d+)\.(\d+)/);
    if (!versionMatch?.[1] || !versionMatch[2]) return undefined;

    const major = parseInt(versionMatch[1], 10);
    const minor = parseInt(versionMatch[2], 10);
    if (major < 1 || (major === 1 && minor < 23)) return undefined;

    const env = {
      PATH: process.env.PATH || '',
      HOME: process.env.HOME || '',
      TMPDIR: process.env.TMPDIR || '',
    };
    if (process.env.GOROOT) {
      env.GOROOT = process.env.GOROOT;
    }
    return env;
  } catch {
    return undefined;
  }
}

/**
 * Downloads Go to a deterministic temp directory and returns a sanitized
 * env pointing to it. If the directory already contains a Go installation,
 * the download is skipped.
 */
async function downloadGo() {
  const goPlatform = platformMap[process.platform] || process.platform;
  const goArch = archMap[process.arch] || process.arch;
  const destDir = join(tmpdir(), `vercel-ipc-proxy-go-${GO_VERSION}`);
  const goBin = join(destDir, 'bin', 'go');

  if (await pathExists(goBin)) {
    return {
      PATH: `${join(destDir, 'bin')}:${process.env.PATH || ''}`,
      HOME: process.env.HOME || '',
      TMPDIR: process.env.TMPDIR || '',
      GOROOT: destDir,
    };
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

  return {
    PATH: `${join(destDir, 'bin')}:${process.env.PATH || ''}`,
    HOME: process.env.HOME || '',
    TMPDIR: process.env.TMPDIR || '',
    GOROOT: destDir,
  };
}

/**
 * Resolves a Go environment suitable for compiling the IPC proxy.
 * Checks the system PATH first, falls back to downloading Go.
 */
async function resolveGoEnv() {
  const systemGo = await findSystemGo();
  if (systemGo) return systemGo;
  return downloadGo();
}

async function compileProxyBinaries() {
  const bootstrapDir = join(__dirname, 'bootstrap');
  const binDir = join(__dirname, 'bin');
  await mkdirp(binDir);

  const goEnv = await resolveGoEnv();

  for (const { goarch, output } of TARGETS) {
    const outputPath = join(binDir, output);
    console.log(`Compiling IPC proxy: linux/${goarch} -> bin/${output}`);
    await execa(
      'go',
      ['build', '-trimpath', '-ldflags=-s -w', '-o', outputPath, '.'],
      {
        cwd: bootstrapDir,
        env: {
          ...goEnv,
          GOARCH: goarch,
          GOOS: 'linux',
          CGO_ENABLED: '0',
        },
        extendEnv: false,
        stdio: 'inherit',
      }
    );
  }
}

await Promise.all([tsc(), esbuild()]);
await compileProxyBinaries();
