import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(packageRoot, 'native', 'biometric', 'main.swift');
const output = join(packageRoot, 'dist-native', 'biometric-helper');
const cacheDir = join(packageRoot, 'dist-native', 'cache');

if (platform() !== 'darwin') {
  throw new Error('The biometric helper can only be built on macOS.');
}

await fs.mkdir(dirname(output), { recursive: true });
await fs.mkdir(cacheDir, { recursive: true });

await run('swiftc', [
  source,
  '-module-cache-path',
  join(cacheDir, 'swift-module-cache'),
  '-Xcc',
  '-fmodules-cache-path=' + join(cacheDir, 'clang-module-cache'),
  '-Osize',
  '-framework',
  'Foundation',
  '-framework',
  'Security',
  '-framework',
  'LocalAuthentication',
  '-framework',
  'CryptoKit',
  '-o',
  output,
]);

await run('codesign', [
  '-f',
  '--sign',
  '-',
  '--entitlements',
  join(packageRoot, 'entitlements.plist'),
  output,
]);

console.log(`Built biometric helper: ${output}`);

async function run(command, args) {
  console.log(`$ ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    cwd: packageRoot,
    env: {
      ...process.env,
      CLANG_MODULE_CACHE_PATH: join(cacheDir, 'clang-module-cache'),
    },
    stdio: 'inherit',
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited with signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    throw new Error(`${command} exited with code ${exitCode}`);
  }
}
