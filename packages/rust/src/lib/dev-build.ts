import path from 'node:path';
import execa from 'execa';
import { debug } from '@vercel/build-utils';
import { assertEnv, getExecutableName } from './utils';
import { findBinaryName, findCargoWorkspace, getCargoMetadata } from './cargo';

type RustEnv = Record<'RUSTFLAGS' | 'PATH', string>;

export async function buildExecutableForDev(
  workPath: string,
  entrypoint: string
): Promise<string> {
  debug(`Building executable for development: ${entrypoint}`);

  const HOME =
    process.platform === 'win32' ? assertEnv('USERPROFILE') : assertEnv('HOME');
  const PATH = assertEnv('PATH');

  const rustEnv: RustEnv = {
    PATH: `${path.join(HOME, '.cargo/bin')}${path.delimiter}${PATH}`,
    RUSTFLAGS: [process.env.RUSTFLAGS].filter(Boolean).join(' '),
  };

  const entryPath = path.join(workPath, entrypoint);
  const cargoWorkspace = await findCargoWorkspace({
    env: rustEnv,
    cwd: path.dirname(entryPath),
  });

  const binaryName = findBinaryName(cargoWorkspace, entryPath);

  debug(`Building binary "${binaryName}" in debug mode for dev server`);

  try {
    await execa(
      'cargo',
      [
        'build',
        '--bin',
        binaryName,
        '--message-format=json-diagnostic-rendered-ansi',
      ],
      {
        cwd: workPath,
        env: rustEnv,
        stdio: 'pipe',
      }
    );
  } catch (err) {
    debug(`Cargo build failed for ${binaryName}`);
    throw new Error(`Failed to build Rust binary for development: ${err}`);
  }

  // Get the target directory and construct the path to the built executable
  const { target_directory: targetDirectory } = await getCargoMetadata({
    cwd: workPath,
    env: rustEnv,
  });

  const executablePath = path.join(
    targetDirectory,
    'debug',
    getExecutableName(binaryName)
  );

  debug(`Built executable at: ${executablePath}`);
  return executablePath;
}
