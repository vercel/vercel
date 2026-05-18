import { mkdtemp, mkdir, writeFile, chmod, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, test } from 'vitest';

const execFileAsync = promisify(execFile);
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const packageNames = {
  darwin: {
    arm64: '@vercel/vc-native-darwin-arm64',
    x64: '@vercel/vc-native-darwin-x64',
  },
  linux: {
    arm64: '@vercel/vc-native-linux-arm64',
    x64: '@vercel/vc-native-linux-x64',
  },
  win32: {
    x64: '@vercel/vc-native-win32-x64',
  },
};

describe('@vercel/vc-native shim', () => {
  test('executes the platform package binary', async () => {
    const packageName = packageNames[process.platform]?.[process.arch];
    if (!packageName) {
      return;
    }

    const root = await mkdtemp(join(tmpdir(), 'vc-native-shim-'));
    const wrapperDir = join(root, 'node_modules', '@vercel', 'vc-native');
    const platformDir = join(root, 'node_modules', ...packageName.split('/'));
    const binaryName = process.platform === 'win32' ? 'vercel.exe' : 'vercel';

    await mkdir(join(wrapperDir, 'bin'), { recursive: true });
    await mkdir(join(platformDir, 'bin'), { recursive: true });
    await copyFile(
      join(packageRoot, 'bin', 'vercel'),
      join(wrapperDir, 'bin', 'vercel')
    );
    await chmod(join(wrapperDir, 'bin', 'vercel'), 0o755);
    const binaryPath = join(platformDir, 'bin', binaryName);

    if (process.platform === 'win32') {
      await copyFile(process.execPath, binaryPath);
    } else {
      await writeFile(
        binaryPath,
        '#!/usr/bin/env node\nconsole.log("native shim ok:" + process.argv.slice(2).join(","));\n'
      );
    }
    await chmod(binaryPath, 0o755);

    const args =
      process.platform === 'win32' ? ['--version'] : ['arg-one', 'arg-two'];
    const { stdout } = await execFileAsync(process.execPath, [
      join(wrapperDir, 'bin', 'vercel'),
      ...args,
    ]);

    expect(stdout.trim()).toBe(
      process.platform === 'win32'
        ? process.version
        : 'native shim ok:arg-one,arg-two'
    );
  });
});
