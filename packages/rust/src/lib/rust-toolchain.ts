import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { debug, VerifiedDownloader } from '@vercel/build-utils';
import execa from 'execa';

/**
 * Pinned rustup-init release. The SHA-256 of each per-platform binary is
 * fetched from the vendor's sidecar file at
 * `https://static.rust-lang.org/rustup/archive/<version>/<platform>/rustup-init.sha256`,
 * so bumping this version does not require updating any hashes in source.
 */
const RUSTUP_INIT_VERSION = '1.27.1';

/**
 * Returns the Rust target platform for the current host, matching the
 * directory names published at `https://static.rust-lang.org/rustup/archive/`.
 */
function detectRustPlatform(): string {
  const { platform, arch } = process;
  if (platform === 'linux') {
    if (arch === 'x64') return 'x86_64-unknown-linux-gnu';
    if (arch === 'arm64') return 'aarch64-unknown-linux-gnu';
  } else if (platform === 'darwin') {
    if (arch === 'x64') return 'x86_64-apple-darwin';
    if (arch === 'arm64') return 'aarch64-apple-darwin';
  } else if (platform === 'win32') {
    if (arch === 'x64') return 'x86_64-pc-windows-msvc';
    if (arch === 'arm64') return 'aarch64-pc-windows-msvc';
  }
  throw new Error(
    `Unsupported host platform for rustup-init: ${platform}-${arch}. Install the Rust toolchain manually and ensure \`rustup\` is available on PATH.`
  );
}

/**
 * Downloads the pinned `rustup-init` binary, verifies it against the SHA-256
 * published by the Rust project as a sidecar file, and executes it to
 * install the stable Rust toolchain. Replaces the former `curl | sh`
 * pipeline which offered no integrity guarantees.
 */
async function downloadRustToolchain(): Promise<void> {
  const rustPlatform = detectRustPlatform();
  const isWindows = process.platform === 'win32';
  const fileName = isWindows ? 'rustup-init.exe' : 'rustup-init';
  const url = `https://static.rust-lang.org/rustup/archive/${RUSTUP_INIT_VERSION}/${rustPlatform}/${fileName}`;
  const sha256Url = `${url}.sha256`;

  const staging = await mkdtemp(join(tmpdir(), 'rustup-init-'));
  const destFile = join(staging, fileName);

  try {
    debug(`Downloading rustup-init ${RUSTUP_INIT_VERSION} (${rustPlatform})`);
    await new VerifiedDownloader({
      sha256Url,
      parseSha256: parseRustupSha256,
    }).downloadTo(url, destFile);
    if (!isWindows) {
      await chmod(destFile, 0o755);
    }

    debug('Running rustup-init to install the stable toolchain');
    await execa(
      destFile,
      ['-y', '--no-modify-path', '--default-toolchain', 'stable'],
      { stdio: 'inherit' }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(
      `Installing Rust toolchain via rustup-init failed: ${message}`
    );
  } finally {
    try {
      await rm(staging, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

/**
 * Parses the rustup-init sidecar SHA-256 file. The upstream format is a
 * single line: `<hex>  rustup-init`. We accept any leading hex token.
 */
function parseRustupSha256(body: string): string | undefined {
  const first = body.trim().split(/\s+/)[0];
  return first || undefined;
}

/**
 * Ensures a usable Rust toolchain is available.
 *
 * The builder only needs `cargo` (+ `rustc`) on PATH, so we accept any
 * image that pre-installs Rust — whether via rustup, distro packages, or a
 * standalone installer. On Vercel's standard build container, rustup and a
 * default toolchain are pre-installed under `/rust/bin`; the probe below
 * finds them and skips the rustup-init download entirely.
 *
 * Fallback order (first match wins):
 *   1. `cargo -V` succeeds → use pre-installed Rust as-is.
 *   2. `rustup -V` succeeds → use pre-installed rustup.
 *   3. Download `rustup-init` (SHA-256 verified against the vendor's
 *      sidecar file) and let it install the stable toolchain.
 */
export const installRustToolchain = async (): Promise<void> => {
  try {
    await execa('cargo', ['-V'], { stdio: 'ignore' });
    debug('Rust: pre-installed cargo detected; skipping rustup-init install');
    return;
  } catch {
    // cargo missing — continue probing for rustup below.
  }
  try {
    await execa('rustup', ['-V'], { stdio: 'ignore' });
    debug('Rust: pre-installed rustup detected; skipping rustup-init install');
    return;
  } catch {
    // rustup missing — fall through to verified download.
  }
  await downloadRustToolchain();
};
