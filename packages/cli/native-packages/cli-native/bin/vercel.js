#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const packageNameByPlatform = {
  'darwin-arm64': '@vercel/cli-darwin-arm64',
  'darwin-x64': '@vercel/cli-darwin-x64',
  'linux-arm64': '@vercel/cli-linux-arm64',
  'linux-arm64-musl': '@vercel/cli-linux-arm64-musl',
  'linux-x64': '@vercel/cli-linux-x64',
  'linux-x64-musl': '@vercel/cli-linux-x64-musl',
  'win32-arm64': '@vercel/cli-windows-arm64',
  'win32-x64': '@vercel/cli-windows-x64',
};

function getPackageName() {
  const libc = isMusl() ? '-musl' : '';
  return packageNameByPlatform[`${process.platform}-${process.arch}${libc}`];
}

function isMusl() {
  if (process.platform !== 'linux') {
    return false;
  }
  const report = process.report?.getReport?.();
  return !report?.header?.glibcVersionRuntime;
}

function getBinaryPath(packageName) {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const packageDir = dirname(packageJsonPath);
  const binaryName = process.platform === 'win32' ? 'vercel.exe' : 'vercel';
  return join(packageDir, 'bin', binaryName);
}

const require = createRequire(import.meta.url);
const packageName = getPackageName();

if (!packageName) {
  console.error(
    `No Vercel native binary is available for ${process.platform}/${process.arch}. ` +
      'Use `npm i -g vercel` to install the JavaScript CLI.'
  );
  process.exit(1);
}

let binaryPath;
try {
  binaryPath = getBinaryPath(packageName);
} catch {
  console.error(
    `The native package ${packageName} was not installed. ` +
      'Reinstall with optional dependencies enabled, or install the platform package directly.'
  );
  process.exit(1);
}

if (!existsSync(binaryPath)) {
  console.error(`The native Vercel binary was not found at ${binaryPath}.`);
  process.exit(1);
}

const result = spawnSync(binaryPath, process.argv.slice(2), {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.signal) {
  process.kill(process.pid, result.signal);
}

process.exit(result.status ?? 1);
