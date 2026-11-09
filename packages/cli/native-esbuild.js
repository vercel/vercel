import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

export const loadEsbuildSymbol = Symbol.for('vercel.cli.loadEsbuild');

function getEmbeddedExecutable(packageRootUrl, platform, arch) {
  // Resolve from the esbuild version we load: its matching executable may be
  // nested, while a different version's executable is hoisted to the root.
  const esbuildEntry = createRequire(packageRootUrl).resolve('esbuild');
  const executable = platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild';
  return createRequire(esbuildEntry).resolve(
    `@esbuild/${platform}-${arch}/${executable}`
  );
}

function materializeExecutable(sourcePath, cacheRoot) {
  const contents = readFileSync(sourcePath);
  const digest = createHash('sha256').update(contents).digest('hex');
  const targetPath = join(cacheRoot, digest, basename(sourcePath));

  try {
    const existing = readFileSync(targetPath);
    if (createHash('sha256').update(existing).digest('hex') === digest) {
      return targetPath;
    }
  } catch {
    // Missing or unreadable cache entries are replaced below.
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.${process.pid}.${Math.random()
    .toString(16)
    .slice(2)}.tmp`;
  try {
    writeFileSync(temporaryPath, contents, { mode: 0o755 });
    chmodSync(temporaryPath, 0o755);
    try {
      renameSync(temporaryPath, targetPath);
    } catch (error) {
      // Another process may have populated the same content-addressed path.
      try {
        const existing = readFileSync(targetPath);
        if (createHash('sha256').update(existing).digest('hex') !== digest) {
          throw error;
        }
      } catch {
        throw error;
      }
    }
  } finally {
    rmSync(temporaryPath, { force: true });
  }

  return targetPath;
}

export function installNativeEsbuildLoader({
  packageRootUrl = import.meta.url,
  cacheRoot = join(
    process.env.XDG_CACHE_HOME || join(homedir(), '.cache'),
    'vercel',
    'native',
    'esbuild'
  ),
  platform = process.platform,
  arch = process.arch,
  loadEsbuild = () => createRequire(packageRootUrl)('esbuild'),
} = {}) {
  Reflect.set(globalThis, loadEsbuildSymbol, () => {
    const previousBinaryPath = process.env.ESBUILD_BINARY_PATH;
    if (!previousBinaryPath) {
      process.env.ESBUILD_BINARY_PATH = materializeExecutable(
        getEmbeddedExecutable(packageRootUrl, platform, arch),
        cacheRoot
      );
    }
    try {
      return loadEsbuild();
    } finally {
      if (previousBinaryPath === undefined) {
        delete process.env.ESBUILD_BINARY_PATH;
      } else {
        process.env.ESBUILD_BINARY_PATH = previousBinaryPath;
      }
    }
  });
}
