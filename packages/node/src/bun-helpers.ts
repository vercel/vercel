import { debug } from '@vercel/build-utils';
import { spawn, SpawnOptions } from 'child_process';
import once from '@tootallnate/once';
import { homedir } from 'os';
import { join } from 'path';

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
 * Get the name of Bun's binary, installing it if necessary. We check if
 * Bun is available in the system PATH. If not, we install it using the
 * official installer scripts.
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

  // If might have also just been installed, so check the default install location
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

  try {
    let exitCode: number;
    if (platform === 'win32') {
      // https://bun.com/docs/installation#windows
      exitCode = await spawnAsync(
        'powershell',
        ['-c', 'irm bun.sh/install.ps1 | iex'],
        { stdio: 'inherit' }
      );
    } else {
      // https://bun.com/docs/installation#macos-and-linux
      exitCode = await spawnAsync(
        'bash',
        ['-c', 'curl -fsSL https://bun.sh/install | bash'],
        { stdio: 'inherit' }
      );
    }

    if (exitCode !== 0) {
      throw new Error(`Installation script exited with code ${exitCode}`);
    }
  } catch (error) {
    throw new Error(`Failed to install Bun: ${error}`);
  }

  try {
    const exitCode = await spawnAsync(installPath, ['--version'], {
      stdio: 'ignore',
    });
    if (exitCode === 0) {
      debug('Bun was installed successfully');
      return installPath;
    }
  } catch {
    // Handled below
  }

  throw new Error(
    'Bun installation failed. Please install manually and try again.'
  );
}
