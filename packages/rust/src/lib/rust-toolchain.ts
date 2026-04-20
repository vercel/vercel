import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { debug, VerifiedDownloader } from '@vercel/build-utils';
import execa from 'execa';

/**
 * Pinned rustup-init release. When bumping this version, refresh every
 * SHA-256 entry in {@link RUSTUP_INIT_SHA256} with the values published at
 * `https://static.rust-lang.org/rustup/archive/<version>/<triple>/rustup-init.sha256`.
 */
const RUSTUP_INIT_VERSION = '1.27.1';

/**
 * Host triples supported by this builder. The mapping back to
 * `${process.platform}-${process.arch}` is done in {@link detectHostTriple}.
 */
type RustupHostTriple =
  | 'x86_64-unknown-linux-gnu'
  | 'aarch64-unknown-linux-gnu'
  | 'x86_64-apple-darwin'
  | 'aarch64-apple-darwin'
  | 'x86_64-pc-windows-msvc'
  | 'aarch64-pc-windows-msvc';

const RUSTUP_INIT_SHA256: Record<RustupHostTriple, string> = {
  'x86_64-unknown-linux-gnu':
    '6aeece6993e902708983b209d04c0d1dbb14ebb405ddb87def578d41f920f56d',
  'aarch64-unknown-linux-gnu':
    '1cffbf51e63e634c746f741de50649bbbcbd9dbe1de363c9ecef64e278dba2b2',
  'x86_64-apple-darwin':
    'f547d77c32d50d82b8228899b936bf2b3c72ce0a70fb3b364e7fba8891eba781',
  'aarch64-apple-darwin':
    '760b18611021deee1a859c345d17200e0087d47f68dfe58278c57abe3a0d3dd0',
  'x86_64-pc-windows-msvc':
    '193d6c727e18734edbf7303180657e96e9d5a08432002b4e6c5bbe77c60cb3e8',
  'aarch64-pc-windows-msvc':
    '5f4697ee3ea5d4592bffdbe9dc32d6a8865762821b14fdd1cf870e585083a2f0',
};

function detectHostTriple(): RustupHostTriple {
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
 * Downloads a pinned `rustup-init` binary, verifies it against a hard-coded
 * SHA-256, and executes it to install the stable Rust toolchain. Replaces
 * the former `curl | sh` pipeline which offered no integrity guarantees.
 */
async function downloadRustToolchain(): Promise<void> {
  const triple = detectHostTriple();
  const sha256 = RUSTUP_INIT_SHA256[triple];
  const isWindows = process.platform === 'win32';
  const fileName = isWindows ? 'rustup-init.exe' : 'rustup-init';
  const url = `https://static.rust-lang.org/rustup/archive/${RUSTUP_INIT_VERSION}/${triple}/${fileName}`;

  const staging = await mkdtemp(join(tmpdir(), 'rustup-init-'));
  const destFile = join(staging, fileName);

  try {
    debug(`Downloading rustup-init ${RUSTUP_INIT_VERSION} (${triple})`);
    await new VerifiedDownloader({ sha256 }).downloadTo(url, destFile);
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

export const installRustToolchain = async (): Promise<void> => {
  try {
    await execa('rustup', ['-V'], { stdio: 'ignore' });
    debug('Rust Toolchain is already installed, skipping download');
  } catch (_err) {
    await downloadRustToolchain();
  }
};
