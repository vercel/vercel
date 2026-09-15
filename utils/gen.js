#!/usr/bin/env node

/**
 * This script records the host identity used by platform-sensitive tasks.
 */
const { execFileSync } = require('child_process');
const { writeFileSync } = require('fs');
const { join } = require('path');

const { versions, platform, arch, env } = process;
const root = join(__dirname, '..');

function getOutput(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function getGoIdentity() {
  const named = platform === 'win32' ? 'go.exe' : 'go';
  const candidates = [];

  if (env.GO_BIN) candidates.push(env.GO_BIN);
  if (env.GOROOT) {
    candidates.push(join(env.GOROOT, 'bin', named));
    if (platform === 'win32') {
      candidates.push(join(env.GOROOT.replace(/^C:\\/i, 'D:\\'), 'bin', named));
    }
  }
  candidates.push('go');

  for (const candidate of new Set(candidates)) {
    const output = getOutput(candidate, [
      'env',
      '-json',
      'GOVERSION',
      'GOAMD64',
      'GOARM64',
      'GOEXPERIMENT',
      'GOFLAGS',
      'GOTOOLCHAIN',
    ]);
    if (!output) continue;

    try {
      const identity = JSON.parse(output);
      const match = identity.GOVERSION?.match(/go(\d+)\.(\d+)/);
      const major = Number(match?.[1]);
      const minor = Number(match?.[2]);
      if (major > 1 || (major === 1 && minor >= 23)) {
        return identity;
      }
    } catch {
      // Try the next candidate when a wrapper emits non-JSON output.
    }
  }

  return 'downloaded-from-build-config';
}

const platformIdentity = {
  // Bump only when an output-affecting cache input cannot be recorded below.
  cacheVersion: 1,
  node: versions.node,
  platform,
  arch,
  runnerImage:
    env.ImageOS && env.ImageVersion
      ? `${env.ImageOS}-${env.ImageVersion}`
      : 'local',
};
const nativeIdentity = {
  ...platformIdentity,
  go: getGoIdentity(),
};

for (const [name, identity] of [
  ['turbo-platform-cache-key.json', platformIdentity],
  ['turbo-native-cache-key.json', nativeIdentity],
]) {
  const value = JSON.stringify(identity);
  console.log(`Generating ${name}: ${value}`);
  writeFileSync(join(root, name), value);
}
