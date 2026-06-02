#!/usr/bin/env node

import childProcess from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')
);

const platformMap = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'win32',
};
const archMap = {
  x64: 'x64',
  arm64: 'arm64',
};

const platform = platformMap[os.platform()] ?? os.platform();
const arch = archMap[os.arch()] ?? os.arch();
const packageName = `@vercel/vc-native-${platform}-${arch}`;
const sourceBinary = platform === 'win32' ? 'vercel.exe' : 'vercel';
const targetBinary = path.join(__dirname, 'bin', 'vercel.exe');

function packageNames() {
  return [packageName];
}

function resolveBinary(name) {
  const packageJsonPath = require.resolve(`${name}/package.json`);
  const binaryPath = path.join(
    path.dirname(packageJsonPath),
    'bin',
    sourceBinary
  );
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Binary not found at ${binaryPath}`);
  }
  return binaryPath;
}

function installPackage(name) {
  const version = packageJson.optionalDependencies?.[name];
  if (!version) return;

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-native-install-'));
  try {
    const result = childProcess.spawnSync(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--no-save',
        '--loglevel=error',
        '--prefix',
        temp,
        `${name}@${version}`,
      ],
      { stdio: 'inherit', windowsHide: true }
    );
    if (result.status !== 0) return;
    const packageDir = path.join(temp, 'node_modules', ...name.split('/'));
    copyBinary(path.join(packageDir, 'bin', sourceBinary), targetBinary);
    return true;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function copyBinary(source, target) {
  if (!fs.existsSync(source)) throw new Error(`Binary not found at ${source}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(target)) fs.unlinkSync(target);
  try {
    fs.linkSync(source, target);
  } catch {
    fs.copyFileSync(source, target);
  }
  fs.chmodSync(target, 0o755);
}

function verifyBinary() {
  const result = childProcess.spawnSync(targetBinary, ['--version'], {
    encoding: 'utf8',
    stdio: 'ignore',
    windowsHide: true,
  });
  return result.status === 0;
}

function main() {
  for (const name of packageNames()) {
    try {
      copyBinary(resolveBinary(name), targetBinary);
      if (verifyBinary()) return;
    } catch {
      if (installPackage(name) && verifyBinary()) return;
    }
  }

  throw new Error(
    `It seems your package manager failed to install the right Vercel CLI package. Try manually installing ${packageNames()
      .map(name => JSON.stringify(name))
      .join(' or ')}.`
  );
}

try {
  main();
} catch (error) {
  // Do not fail package installation. If setup cannot install a native
  // binary, the fallback bin shim will print a user-facing reinstall message.
  console.warn(error.message);
}
