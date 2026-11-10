import { chmod, copyFile, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getNodeExecPath } from '../src/get-node-exec-path';

const originalNodeExecPath = process.env.VERCEL_NODE_EXEC_PATH;
const originalNative = process.env.VERCEL_VC_NATIVE;
const originalPath = process.env.PATH;
const temporaryDirectories: string[] = [];

afterEach(async () => {
  restoreEnv('VERCEL_NODE_EXEC_PATH', originalNodeExecPath);
  restoreEnv('VERCEL_VC_NATIVE', originalNative);
  restoreEnv('PATH', originalPath);
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => rm(directory, { recursive: true, force: true }))
  );
});

describe('getNodeExecPath', () => {
  it('returns process.execPath outside the native CLI', () => {
    delete process.env.VERCEL_NODE_EXEC_PATH;
    delete process.env.VERCEL_VC_NATIVE;
    expect(getNodeExecPath()).toBe(process.execPath);
  });

  it('returns the native CLI Node.js override', () => {
    process.env.VERCEL_NODE_EXEC_PATH = '/absolute/path/to/node';
    process.env.VERCEL_VC_NATIVE = '1';
    expect(getNodeExecPath()).toBe('/absolute/path/to/node');
  });

  it('lazily resolves and caches Node.js from PATH in the native CLI', async () => {
    const directory = await makeNodeDirectory();
    const nodePath = join(
      directory,
      process.platform === 'win32' ? 'node.exe' : 'node'
    );
    delete process.env.VERCEL_NODE_EXEC_PATH;
    process.env.VERCEL_VC_NATIVE = '1';
    process.env.PATH = directory;

    expect(await realpath(getNodeExecPath())).toBe(await realpath(nodePath));
    expect(process.env.VERCEL_NODE_EXEC_PATH).toBe(nodePath);
  });

  it('throws only when a native CLI feature requests Node.js', () => {
    delete process.env.VERCEL_NODE_EXEC_PATH;
    process.env.VERCEL_VC_NATIVE = '1';
    process.env.PATH = '';

    expect(() => getNodeExecPath()).toThrow(
      'Could not find the Node.js executable in PATH.'
    );
  });
});

async function makeNodeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'node-exec-path-'));
  temporaryDirectories.push(directory);
  const nodePath = join(
    directory,
    process.platform === 'win32' ? 'node.exe' : 'node'
  );
  await copyFile(process.execPath, nodePath);
  await chmod(nodePath, 0o755);
  return directory;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
