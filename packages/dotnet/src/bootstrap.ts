import { delimiter, join } from 'path';
import execa from 'execa';
import { cloneEnv, debug, getWriteableDirectory } from '@vercel/build-utils';

function isNativeLinuxTarget(architecture: 'x86_64' | 'arm64') {
  return (
    process.platform === 'linux' &&
    ((architecture === 'x86_64' && process.arch === 'x64') ||
      (architecture === 'arm64' && process.arch === 'arm64'))
  );
}

function getRustTargetTriple(architecture: 'x86_64' | 'arm64') {
  return architecture === 'arm64'
    ? 'aarch64-unknown-linux-gnu'
    : 'x86_64-unknown-linux-gnu';
}

async function findPythonCommand(env: NodeJS.ProcessEnv): Promise<string> {
  for (const command of ['python3', 'python']) {
    try {
      await execa(command, ['--version'], { env, stdio: 'ignore' });
      return command;
    } catch {
      // Try the next option.
    }
  }

  throw new Error(
    'Python is required to install cargo-zigbuild for Rust bootstrap cross-compilation.'
  );
}

async function ensureCargoZigbuild(
  env: NodeJS.ProcessEnv
): Promise<NodeJS.ProcessEnv> {
  try {
    await execa('cargo', ['zigbuild', '--version'], {
      env,
      stdio: 'ignore',
    });
    return env;
  } catch {
    // Install it below.
  }

  const python = await findPythonCommand(env);
  const userBase = (
    await execa(python, ['-c', 'import site; print(site.USER_BASE)'], {
      env,
    })
  ).stdout.trim();
  const binDir = join(
    userBase,
    process.platform === 'win32' ? 'Scripts' : 'bin'
  );
  const path = env.PATH || process.env.PATH || '';
  const installEnv = cloneEnv(env, {
    PATH: `${binDir}${delimiter}${path}`,
    PIP_DISABLE_PIP_VERSION_CHECK: '1',
  });

  debug(`Installing cargo-zigbuild into ${binDir}`);
  await execa(python, ['-m', 'pip', 'install', '--user', 'cargo-zigbuild'], {
    env: installEnv,
    stdio: 'inherit',
  });
  await execa('cargo', ['zigbuild', '--version'], {
    env: installEnv,
    stdio: 'ignore',
  });

  return installEnv;
}

export async function buildBootstrap({
  architecture,
  env: envOverrides,
}: {
  architecture: 'x86_64' | 'arm64';
  env?: NodeJS.ProcessEnv;
}): Promise<string> {
  const bootstrapDir = join(__dirname, '..', 'bootstrap');
  const targetDir = await getWriteableDirectory();
  const targetTriple = getRustTargetTriple(architecture);
  let env = cloneEnv(process.env, envOverrides, {
    CARGO_TARGET_DIR: targetDir,
  });

  try {
    await execa('cargo', ['--version'], { env, stdio: 'ignore' });
  } catch {
    throw new Error(
      'Rust toolchain is required to build the .NET bootstrap. Install Rust locally or deploy on Vercel where it is preinstalled.'
    );
  }

  if (isNativeLinuxTarget(architecture)) {
    debug(`Building Rust bootstrap natively for ${architecture}`);
    await execa('cargo', ['build', '--release', '--bin', 'bootstrap'], {
      cwd: bootstrapDir,
      env,
      stdio: 'inherit',
    });
    return join(targetDir, 'release', 'bootstrap');
  }

  debug(`Cross-compiling Rust bootstrap for ${targetTriple}`);
  await execa('rustup', ['target', 'add', targetTriple], {
    env,
    stdio: 'inherit',
  });
  env = await ensureCargoZigbuild(env);
  await execa(
    'cargo',
    ['zigbuild', '--release', '--bin', 'bootstrap', '--target', targetTriple],
    {
      cwd: bootstrapDir,
      env,
      stdio: 'inherit',
    }
  );

  return join(targetDir, targetTriple, 'release', 'bootstrap');
}
