import { join } from 'path';
import { existsSync } from 'fs';
import { mkdir } from 'fs/promises';
import execa from 'execa';
import which from 'which';
import os from 'os';
import { debug } from '@vercel/build-utils';

/**
 * Find an existing mise binary on the system.
 * Checks PATH first, then common install locations.
 */
export function findMiseBinary(): string | null {
  const found = which.sync('mise', { nothrow: true }) as string | null;
  if (found) return found;

  const candidates: string[] = [];
  if (process.platform !== 'win32') {
    candidates.push(join(os.homedir(), '.local', 'bin', 'mise'));
    candidates.push('/usr/local/bin/mise');
  }

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  return null;
}

/**
 * Find an existing mise binary or install it using the official install script.
 * This follows the same "find or install" pattern as the Python builder's
 * `getUvBinaryOrInstall`.
 */
export async function getMiseBinaryOrInstall(): Promise<string> {
  const existing = findMiseBinary();
  if (existing) {
    debug(`Found mise at "${existing}"`);
    return existing;
  }

  // Install mise using the official install script.
  // This installs the standalone binary to ~/.local/bin/mise.
  // See: https://mise.jdx.dev/getting-started.html
  console.log('Installing mise...');

  const destDir = join(os.homedir(), '.local', 'bin');
  await mkdir(destDir, { recursive: true });

  try {
    await execa(
      'sh',
      ['-c', 'curl -fsSL https://mise.jdx.dev/install.sh | sh'],
      {
        env: { ...process.env, MISE_QUIET: '1' },
        stdio: 'pipe',
      }
    );
  } catch (err) {
    throw new Error(
      `Failed to install mise: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const installed = findMiseBinary();
  if (!installed) {
    throw new Error('Unable to find mise binary after installation');
  }

  console.log(`Installed mise at "${installed}"`);
  return installed;
}

/**
 * Install a specific Ruby version using mise and return the paths to the
 * ruby and gem binaries.
 *
 * @param misePath - Absolute path to the mise binary
 * @param version  - Ruby version to install (e.g. "3.4", "3.4.1")
 */
export async function installRubyViaMise(
  misePath: string,
  version: string
): Promise<{ rubyPath: string; gemPath: string; installDir: string }> {
  console.log(`Installing Ruby ${version} via mise...`);

  try {
    await execa(misePath, ['install', `ruby@${version}`], {
      env: {
        ...process.env,
        MISE_YES: '1',
      },
      stdio: 'pipe',
    });
  } catch (err) {
    throw new Error(
      `Failed to install Ruby ${version} via mise: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  // Get the installation directory
  let installDir: string;
  try {
    const { stdout } = await execa(misePath, ['where', `ruby@${version}`], {
      env: { ...process.env, MISE_YES: '1' },
    });
    installDir = stdout.trim();
  } catch (err) {
    throw new Error(
      `Failed to locate Ruby ${version} after mise install: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const rubyPath = join(installDir, 'bin', 'ruby');
  const gemPath = join(installDir, 'bin', 'gem');

  if (!existsSync(rubyPath)) {
    throw new Error(
      `Ruby binary not found at "${rubyPath}" after mise install`
    );
  }

  console.log(`Using Ruby ${version} from "${installDir}"`);
  return { rubyPath, gemPath, installDir };
}
