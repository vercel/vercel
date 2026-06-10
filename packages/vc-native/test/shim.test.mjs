import { chmod, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
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
  test('postinstall copies the platform package binary into the wrapper bin', async () => {
    const packageName = packageNames[process.platform]?.[process.arch];
    if (!packageName) {
      return;
    }

    const root = mkdtempSync(join(tmpdir(), 'vc-native-shim-'));
    const wrapperDir = join(root, 'node_modules', '@vercel', 'vc-native');
    const platformDir = join(root, 'node_modules', ...packageName.split('/'));
    const binaryName = process.platform === 'win32' ? 'vercel.exe' : 'vercel';

    await mkdir(join(wrapperDir, 'bin'), { recursive: true });
    await mkdir(join(platformDir, 'bin'), { recursive: true });
    await copyFile(
      join(packageRoot, 'postinstall.mjs'),
      join(wrapperDir, 'postinstall.mjs')
    );
    await writeFile(
      join(wrapperDir, 'package.json'),
      JSON.stringify({
        optionalDependencies: {
          [packageName]: '0.0.0-test',
        },
      })
    );
    await writeFile(
      join(platformDir, 'package.json'),
      JSON.stringify({ name: packageName })
    );

    const binaryPath = join(platformDir, 'bin', binaryName);
    if (process.platform === 'win32') {
      await copyFile(process.execPath, binaryPath);
    } else {
      await writeFile(
        binaryPath,
        '#!/usr/bin/env node\nif (process.argv[2] === "--version") console.log("0.0.0-test"); else console.log("native shim ok:" + process.argv.slice(2).join(","));\n'
      );
    }
    await chmod(binaryPath, 0o755);

    await execFileAsync(process.execPath, [
      join(wrapperDir, 'postinstall.mjs'),
    ]);

    const installed = join(wrapperDir, 'bin', 'vercel.exe');
    const { stdout } = await execFileAsync(installed, [
      process.platform === 'win32' ? '--version' : 'arg-one',
      ...(process.platform === 'win32' ? [] : ['arg-two']),
    ]);

    if (process.platform === 'win32') {
      expect(stdout.trim()).toBe(process.version);
    } else {
      const installedSource = await readFile(installed, 'utf8');
      expect(installedSource).toContain('native shim ok');
      expect(stdout.trim()).toBe('native shim ok:arg-one,arg-two');
    }
  });

  test('bin launcher falls back to the platform package binary when postinstall did not run', async () => {
    const packageName = packageNames[process.platform]?.[process.arch];
    if (!packageName || process.platform === 'win32') {
      return;
    }

    const root = mkdtempSync(join(tmpdir(), 'vc-native-launcher-'));
    const wrapperDir = join(root, 'node_modules', '@vercel', 'vc-native');
    const platformDir = join(root, 'node_modules', ...packageName.split('/'));

    await mkdir(join(wrapperDir, 'bin'), { recursive: true });
    await mkdir(join(platformDir, 'bin'), { recursive: true });
    await copyFile(
      join(packageRoot, 'bin', 'vercel'),
      join(wrapperDir, 'bin', 'vercel.exe')
    );
    await writeFile(
      join(platformDir, 'package.json'),
      JSON.stringify({ name: packageName })
    );

    const binaryPath = join(platformDir, 'bin', 'vercel');
    await writeFile(
      binaryPath,
      '#!/usr/bin/env node\nconsole.log("native launcher ok:" + process.argv.slice(2).join(","));\nprocess.exit(7);\n'
    );
    await chmod(binaryPath, 0o755);

    const launcher = join(wrapperDir, 'bin', 'vercel.exe');
    await chmod(launcher, 0o755);
    const result = await execFileAsync(process.execPath, [
      launcher,
      'arg-one',
      'arg-two',
    ]).catch(error => error);

    expect(result.stdout.trim()).toBe('native launcher ok:arg-one,arg-two');
    expect(result.code).toBe(7);
  });

  test('bin launcher reports a missing platform package', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const root = mkdtempSync(join(tmpdir(), 'vc-native-launcher-missing-'));
    const wrapperDir = join(root, 'node_modules', '@vercel', 'vc-native');
    await mkdir(join(wrapperDir, 'bin'), { recursive: true });
    await copyFile(
      join(packageRoot, 'bin', 'vercel'),
      join(wrapperDir, 'bin', 'vercel.exe')
    );

    const result = await execFileAsync(process.execPath, [
      join(wrapperDir, 'bin', 'vercel.exe'),
    ]).catch(error => error);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      'The native Vercel CLI binary was not installed'
    );
  });
});
