import { homedir } from 'os';
import { join } from 'path';
import { spawn, type SpawnOptions } from 'child_process';
import debug from '../debug';

function spawnAsync(
  command: string,
  args: string[],
  options: SpawnOptions
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.once('error', reject);
    child.once('close', resolve);
  });
}

/**
 * Returns the Bun binary, installing it with the official installer when it is
 * not already available in PATH or Bun's default installation directory.
 */
export async function getOrCreateBunBinary(): Promise<string> {
  const bunCommand = process.platform === 'win32' ? 'bun.exe' : 'bun';
  const installPath = join(homedir(), '.bun', 'bin', bunCommand);

  try {
    if (
      (await spawnAsync(bunCommand, ['--version'], { stdio: 'ignore' })) === 0
    ) {
      debug('Bun already installed and available in PATH');
      return bunCommand;
    }
  } catch {
    debug('Bun not found in PATH');
  }

  try {
    if (
      (await spawnAsync(installPath, ['--version'], { stdio: 'ignore' })) === 0
    ) {
      debug('Bun already installed in default location');
      return installPath;
    }
  } catch {
    debug('Bun not found in default location');
  }

  console.log('Installing Bun...');

  try {
    const exitCode =
      process.platform === 'win32'
        ? await spawnAsync(
            'powershell',
            ['-c', 'irm bun.sh/install.ps1 | iex'],
            { stdio: 'inherit' }
          )
        : await spawnAsync(
            'bash',
            ['-c', 'curl -fsSL https://bun.sh/install | bash'],
            { stdio: 'inherit' }
          );

    if (exitCode !== 0) {
      throw new Error(`Installation script exited with code ${exitCode}`);
    }
  } catch (error) {
    throw new Error(`Failed to install Bun: ${error}`);
  }

  try {
    if (
      (await spawnAsync(installPath, ['--version'], { stdio: 'ignore' })) === 0
    ) {
      debug('Bun was installed successfully');
      return installPath;
    }
  } catch {
    // Handled below.
  }

  throw new Error(
    'Bun installation failed. Please install manually and try again.'
  );
}
