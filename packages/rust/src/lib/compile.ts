import path from 'node:path';
import execa from 'execa';
import { debug } from '@vercel/build-utils';
import { assertEnv, getExecutableName } from './utils';

export type RustEnv = Record<'RUSTFLAGS' | 'PATH', string>;

export function createRustEnv(): RustEnv {
  const HOME =
    process.platform === 'win32' ? assertEnv('USERPROFILE') : assertEnv('HOME');
  const PATH = assertEnv('PATH');

  return {
    PATH: `${path.join(HOME, '.cargo/bin')}${path.delimiter}${PATH}`,
    RUSTFLAGS: [process.env.RUSTFLAGS].filter(Boolean).join(' '),
  };
}

export interface CompileCargoBinaryOptions {
  workPath: string;
  rustEnv: RustEnv;
  binaryName: string;
  /** Owning package, required to disambiguate bin names across a workspace. */
  packageName?: string;
  /** Use `cargo zigbuild` to target Linux from the local machine. */
  crossCompilation: boolean;
  targetTriple: string;
  release: boolean;
  verbose: boolean;
}

export async function compileCargoBinary({
  workPath,
  rustEnv,
  binaryName,
  packageName,
  crossCompilation,
  targetTriple,
  release,
  verbose,
}: CompileCargoBinaryOptions): Promise<void> {
  const args = crossCompilation
    ? ['zigbuild', '--target', targetTriple]
    : ['build'];

  if (packageName) {
    args.push('-p', packageName);
  }
  args.push('--bin', binaryName);

  args.push(verbose ? '--verbose' : '--quiet');
  if (release) {
    args.push('--release');
  }

  debug(`Running \`cargo ${args.join(' ')}\``);

  try {
    await execa('cargo', args, { cwd: workPath, env: rustEnv });
  } catch (err) {
    debug(`Running \`cargo build\` for \`${binaryName}\` failed`);
    throw err;
  }
}

export interface CompiledBinaryPathOptions {
  /** `target_directory` reported by `cargo metadata`. */
  targetDirectory: string;
  crossCompilation: boolean;
  targetTriple: string;
  /** `build.target` from `.cargo/config.toml`, if any. */
  buildTarget?: string;
  variant: 'debug' | 'release';
  binaryName: string;
}

export function resolveCompiledBinaryPath({
  targetDirectory,
  crossCompilation,
  targetTriple,
  buildTarget = '',
  variant,
  binaryName,
}: CompiledBinaryPathOptions): string {
  let dir = targetDirectory;

  if (crossCompilation) {
    dir = path.join(dir, targetTriple);
  }
  dir = path.join(dir, buildTarget);

  return path.join(dir, variant, getExecutableName(binaryName));
}

export function getTargetTriple(architecture: string): string {
  return architecture === 'arm64'
    ? 'aarch64-unknown-linux-gnu'
    : 'x86_64-unknown-linux-gnu';
}

export async function getRustHostTargetTriple(
  rustEnv: RustEnv
): Promise<string | undefined> {
  try {
    const { stdout } = await execa('rustc', ['-vV'], { env: rustEnv });
    return /^host:\s+(.+)$/m.exec(stdout)?.[1];
  } catch (err) {
    debug(`Failed to determine the Rust host target: ${err}`);
    return undefined;
  }
}
