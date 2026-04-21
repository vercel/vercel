import { existsSync, readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, SpawnOptions, execFileSync } from 'node:child_process';
import once from '@tootallnate/once';
import { debug, extractZip, VerifiedDownloader } from '@vercel/build-utils';

/**
 * Pinned Bun release. The SHA-256 for the per-platform zip is fetched
 * dynamically from the vendor's `SHASUMS256.txt` sidecar on each GitHub
 * release, so bumping this version does not require updating any hashes
 * in source.
 */
const BUN_VERSION = '1.1.38';

async function spawnAsync(
  command: string,
  args: string[],
  options: SpawnOptions
): Promise<number> {
  const child = spawn(command, args, options);
  const [exitCode] = await once.spread<[number, string | null]>(child, 'close');
  return exitCode;
}

/**
 * Returns the Bun release platform tag for the current host, matching the
 * upstream naming convention used in
 * `https://github.com/oven-sh/bun/releases/.../bun-<platform>.zip` and in
 * the `SHASUMS256.txt` sidecar. Mirrors the detection logic in
 * `https://bun.sh/install`:
 *
 *   - musl detection: `/etc/alpine-release` exists → append `-musl`.
 *   - AVX2 detection on x64: `/proc/cpuinfo` (Linux), `sysctl` (macOS).
 *     CPUs without AVX2 → append `-baseline`.
 *   - Windows x64: Node.js cannot introspect CPU features reliably, so we
 *     default to the `-baseline` build for broad compatibility.
 */
function detectBunPlatform(): string {
  const { platform, arch } = process;
  let tag: string;

  if (platform === 'linux') {
    tag = arch === 'arm64' ? 'linux-aarch64' : 'linux-x64';
  } else if (platform === 'darwin') {
    tag = arch === 'arm64' ? 'darwin-aarch64' : 'darwin-x64';
  } else if (platform === 'win32') {
    tag = arch === 'arm64' ? 'windows-aarch64' : 'windows-x64';
  } else {
    throw new Error(
      `Unsupported host platform for Bun: ${platform}-${arch}. Install Bun manually and ensure \`bun\` is available on PATH.`
    );
  }

  // musl detection (matches upstream bun.sh/install)
  if (platform === 'linux' && existsSync('/etc/alpine-release')) {
    tag += '-musl';
  }

  // AVX2 detection — use baseline variant on CPUs without AVX2
  if (tag.startsWith('linux-x64')) {
    try {
      if (!readFileSync('/proc/cpuinfo', 'utf8').includes('avx2')) {
        tag += '-baseline';
      }
    } catch {
      tag += '-baseline';
    }
  } else if (tag === 'darwin-x64') {
    try {
      const features = execFileSync(
        'sysctl',
        ['-n', 'machdep.cpu.leaf7_features'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      if (!features.includes('AVX2')) {
        tag += '-baseline';
      }
    } catch {
      tag += '-baseline';
    }
  } else if (tag === 'windows-x64') {
    // Node.js on Windows exposes no reliable CPU feature probe, and
    // running `wmic` / PowerShell during a build is heavyweight. Default
    // to the baseline variant so older CPUs don't crash at startup.
    tag += '-baseline';
  }

  return tag;
}

/**
 * Parses Bun's `SHASUMS256.txt` sidecar and returns the digest for the
 * given artifact name (e.g. `bun-linux-x64-baseline.zip`). Each line uses
 * the standard shasum format: `<64-hex>  <filename>`.
 */
function makeParseBunSha256(
  zipName: string
): (body: string) => string | undefined {
  return body => {
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = /^([0-9a-f]{64})\s+(.+)$/.exec(trimmed);
      if (match && match[2] === zipName) return match[1];
    }
    return undefined;
  };
}

/**
 * Downloads and installs a pinned Bun release into `~/.bun/bin/bun`.
 * Replaces the upstream `curl https://bun.sh/install | bash` pipeline,
 * which offered no integrity guarantees against CDN / network compromise.
 * The expected SHA-256 is fetched from the release's `SHASUMS256.txt`
 * sidecar at download time rather than being hard-coded.
 */
async function downloadBun(): Promise<string> {
  const platformTag = detectBunPlatform();
  const isWindows = process.platform === 'win32';
  const bunBinaryName = isWindows ? 'bun.exe' : 'bun';

  const zipName = `bun-${platformTag}.zip`;
  const releaseBase = `https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}`;
  const url = `${releaseBase}/${zipName}`;
  const sha256Url = `${releaseBase}/SHASUMS256.txt`;

  const staging = await mkdtemp(join(tmpdir(), 'bun-install-'));
  const zipPath = join(staging, zipName);
  const extractDir = join(staging, 'extracted');

  const installDir = join(homedir(), '.bun', 'bin');
  const finalPath = join(installDir, bunBinaryName);

  try {
    debug(`Downloading Bun ${BUN_VERSION} (${platformTag})`);
    await new VerifiedDownloader({
      sha256Url,
      parseSha256: makeParseBunSha256(zipName),
    }).downloadTo(url, zipPath);

    await mkdir(extractDir, { recursive: true });
    // Bun release zips contain a single top-level directory (e.g.
    // `bun-linux-x64/bun`). Strip it so the binary lands directly in
    // `extractDir`.
    await extractZip(zipPath, extractDir, { strip: 1 });

    await mkdir(installDir, { recursive: true });
    const extractedBinary = join(extractDir, bunBinaryName);
    await rename(extractedBinary, finalPath);
    if (!isWindows) {
      await chmod(finalPath, 0o755);
    }

    return finalPath;
  } finally {
    try {
      await rm(staging, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Get the name of Bun's binary, installing it if necessary.
 *
 * Probe order:
 *   1. `bun --version` on PATH — on Vercel's standard build container, Bun
 *      is pre-installed under `/bun1/bun` which is on PATH, so the probe
 *      succeeds and no download runs.
 *   2. `bun --version` at the default install location (`~/.bun/bin/bun`).
 *   3. Download the pinned Bun release (SHA-256 verified against the
 *      vendor's `SHASUMS256.txt`) and extract to `~/.bun/bin/`.
 *
 * @returns The name of the Bun binary (either 'bun' or 'bun.exe')
 */
export async function getOrCreateBunBinary(): Promise<string> {
  const { platform } = process;
  const bunCommand = platform === 'win32' ? 'bun.exe' : 'bun';
  const installPath = join(homedir(), '.bun', 'bin', bunCommand);

  // If Bun is already available in PATH, return immediately
  try {
    const exitCode = await spawnAsync(bunCommand, ['--version'], {
      stdio: 'ignore',
    });
    if (exitCode === 0) {
      debug('Bun already installed and available in PATH');
      return bunCommand;
    }
  } catch {
    debug('Bun not found in PATH');
  }

  // It might have also just been installed, so check the default install location
  try {
    const exitCode = await spawnAsync(installPath, ['--version'], {
      stdio: 'ignore',
    });
    if (exitCode === 0) {
      debug('Bun already installed in default location');
      return installPath;
    }
  } catch {
    debug('Bun not found in default location');
  }

  console.log('Installing Bun...');

  let finalPath: string;
  try {
    finalPath = await downloadBun();
  } catch (error) {
    throw new Error(`Failed to install Bun: ${error}`);
  }

  try {
    const exitCode = await spawnAsync(finalPath, ['--version'], {
      stdio: 'ignore',
    });
    if (exitCode === 0) {
      debug('Bun was installed successfully');
      return finalPath;
    }
  } catch {
    // Handled below
  }

  throw new Error(
    'Bun installation failed. Please install manually and try again.'
  );
}
