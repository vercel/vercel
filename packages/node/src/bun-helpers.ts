import { chmod, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, SpawnOptions } from 'node:child_process';
import once from '@tootallnate/once';
import { debug, extractZip, VerifiedDownloader } from '@vercel/build-utils';

/**
 * Pinned Bun release. When bumping this version, refresh every entry in
 * {@link BUN_SHA256} with the values from the corresponding
 * `SHASUMS256.txt` on the GitHub release page.
 */
const BUN_VERSION = '1.1.38';

type BunTargetTriple =
  | 'linux-x64'
  | 'linux-x64-baseline'
  | 'linux-aarch64'
  | 'darwin-x64'
  | 'darwin-aarch64'
  | 'windows-x64';

const BUN_SHA256: Record<BunTargetTriple, string> = {
  // The AVX2 build is kept in the map for reference but is not selected by
  // default — the baseline build runs on a broader set of Linux x64 CPUs
  // (including Amazon Linux 2023 / Lambda-class hardware) and is the safer
  // default when we're the ones installing Bun.
  'linux-x64':
    'a61da5357e28d4977fccd4851fed62ff4da3ea33853005c7dd93dac80bc53932',
  'linux-x64-baseline':
    '353e2e6d4086a09eeee984d2ed61736dcd905838ede51b82689fd7b3e95def90',
  'linux-aarch64':
    '3b08fd0b31f745509e1fed9c690c80d1a32ef2b3c8d059583f643f696639bd21',
  'darwin-x64':
    '4e9814c9b2e64f9166ed8fc2a48f905a2195ea599b7ceda7ac821688520428a5',
  'darwin-aarch64':
    'bbc6fb0e7bb99e7e95001ba05105cf09d0b79c06941d9f6ee3d0b34dc1541590',
  'windows-x64':
    '52d6c588237c5a1071839dc20dc96f19ca9f8021b7757fa096d22927b0a44a8b',
};

async function spawnAsync(
  command: string,
  args: string[],
  options: SpawnOptions
): Promise<number> {
  const child = spawn(command, args, options);
  const [exitCode] = await once.spread<[number, string | null]>(child, 'close');
  return exitCode;
}

function detectBunTriple(): BunTargetTriple {
  const { platform, arch } = process;
  if (platform === 'linux') {
    // Prefer the baseline build on Linux x64 for broad CPU compatibility
    // (AVX2 isn't guaranteed on Amazon Linux 2023 / Lambda-class instances).
    if (arch === 'x64') return 'linux-x64-baseline';
    if (arch === 'arm64') return 'linux-aarch64';
  } else if (platform === 'darwin') {
    if (arch === 'x64') return 'darwin-x64';
    if (arch === 'arm64') return 'darwin-aarch64';
  } else if (platform === 'win32') {
    if (arch === 'x64') return 'windows-x64';
  }
  throw new Error(
    `Unsupported host platform for Bun: ${platform}-${arch}. Install Bun manually and ensure \`bun\` is available on PATH.`
  );
}

/**
 * Downloads and installs a pinned Bun release into `~/.bun/bin/bun`.
 * Replaces the upstream `curl https://bun.sh/install | bash` pipeline,
 * which offered no integrity guarantees against CDN / network compromise.
 */
async function downloadBun(): Promise<string> {
  const triple = detectBunTriple();
  const sha256 = BUN_SHA256[triple];
  const isWindows = process.platform === 'win32';
  const bunBinaryName = isWindows ? 'bun.exe' : 'bun';

  const zipName = `bun-${triple}.zip`;
  const url = `https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/${zipName}`;

  const staging = await mkdtemp(join(tmpdir(), 'bun-install-'));
  const zipPath = join(staging, zipName);
  const extractDir = join(staging, 'extracted');

  const installDir = join(homedir(), '.bun', 'bin');
  const finalPath = join(installDir, bunBinaryName);

  try {
    debug(`Downloading Bun ${BUN_VERSION} (${triple})`);
    await new VerifiedDownloader({ sha256 }).downloadTo(url, zipPath);

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
 *   3. Download the pinned Bun release (SHA-256 verified) and extract to
 *      `~/.bun/bin/`.
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
