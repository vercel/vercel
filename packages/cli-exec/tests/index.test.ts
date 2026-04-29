import { afterEach, expect, test, vi } from 'vitest';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  clearVercelCliCache,
  execVercelCli,
  findVercelCli,
  VercelCliError,
} from '../src/index';

const directories: string[] = [];

afterEach(() => {
  clearVercelCliCache();
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function createDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'cli-exec-'));
  directories.push(directory);
  return directory;
}

function writeExecutable(
  filePath: string,
  contents: { posix: string; win32: string }
) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(
    filePath,
    process.platform === 'win32' ? contents.win32 : contents.posix
  );

  if (process.platform !== 'win32') {
    chmodSync(filePath, 0o755);
  }
}

const windowsOnlyTest = process.platform === 'win32' ? test : test.skip;

test('finds a local node_modules bin via the prepended PATH', () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const binName = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const binPath = path.join(root, 'node_modules', '.bin', binName);

  mkdirSync(cwd, { recursive: true });
  mkdirSync(path.dirname(binPath), { recursive: true });
  writeFileSync(
    binPath,
    process.platform === 'win32'
      ? '@echo off\r\nnode -e "process.stdout.write(JSON.stringify({args:process.argv.slice(1)}))" %*\r\n'
      : '#!/bin/sh\nnode -e "process.stdout.write(JSON.stringify({args:process.argv.slice(1)}))" "$@"\n'
  );
  if (process.platform !== 'win32') {
    chmodSync(binPath, 0o755);
  }

  expect(findVercelCli({ cwd })).toEqual({
    command: realpathSync(binPath),
    commandArgs: [],
    source: 'local-bin',
  });

  const invocation = findVercelCli({ cwd });

  expect(invocation).toEqual({
    command: realpathSync(binPath),
    commandArgs: [],
    source: 'local-bin',
  });

  return expect(
    execVercelCli(['project', 'token', 'my-project'], { cwd })
  ).resolves.toMatchObject({
    invocation: {
      command: realpathSync(binPath),
      source: 'local-bin',
    },
    stdout: JSON.stringify({ args: ['project', 'token', 'my-project'] }),
  });
});

test('prefers the installed package bin over node_modules/.bin shims', () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const binName = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const shimPath = path.join(root, 'node_modules', '.bin', binName);

  mkdirSync(cwd, { recursive: true });
  mkdirSync(path.dirname(shimPath), { recursive: true });
  writeFileSync(
    shimPath,
    process.platform === 'win32'
      ? '@echo off\r\nnode -e "process.stdout.write("ok")"\r\n'
      : '#!/bin/sh\necho ok\n'
  );
  if (process.platform !== 'win32') {
    chmodSync(shimPath, 0o755);
  }

  const invocation = findVercelCli({ cwd });

  expect(invocation).toEqual({
    command: realpathSync(shimPath),
    commandArgs: [],
    source: 'local-bin',
  });
});

test('falls back to PATH when no local binary exists', () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const globalBinDir = createDirectory();
  const binName = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const binPath = path.join(globalBinDir, binName);

  mkdirSync(cwd, { recursive: true });
  writeExecutable(binPath, {
    win32: '@echo off\r\n',
    posix: '#!/bin/sh\n',
  });
  vi.stubEnv('PATH', globalBinDir);

  expect(findVercelCli({ cwd })).toEqual({
    command: realpathSync(binPath),
    commandArgs: [],
    source: 'path',
  });
});

windowsOnlyTest('falls back to Path when PATH is unset', () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const globalBinDir = createDirectory();
  const binName = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const binPath = path.join(globalBinDir, binName);
  const originalPath = process.env.PATH;
  const originalPathKey = process.env.Path;

  mkdirSync(cwd, { recursive: true });
  writeExecutable(binPath, {
    win32: '@echo off\r\n',
    posix: '#!/bin/sh\n',
  });

  try {
    delete process.env.PATH;
    process.env.Path = globalBinDir;

    expect(findVercelCli({ cwd })).toEqual({
      command: realpathSync(binPath),
      commandArgs: [],
      source: 'path',
    });
  } finally {
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }

    if (originalPathKey === undefined) {
      delete process.env.Path;
    } else {
      process.env.Path = originalPathKey;
    }
  }
});

test('uses the provided PATH for resolution and caching', async () => {
  const cwd = createDirectory();
  const firstBinDir = createDirectory();
  const secondBinDir = createDirectory();
  const binName = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const firstBinPath = path.join(firstBinDir, binName);
  const secondBinPath = path.join(secondBinDir, binName);

  writeFileSync(
    firstBinPath,
    process.platform === 'win32'
      ? '@echo off\r\nnode -e "process.stdout.write(\'first\')"\r\n'
      : '#!/bin/sh\nnode -e "process.stdout.write(\'first\')"\n'
  );
  writeFileSync(
    secondBinPath,
    process.platform === 'win32'
      ? '@echo off\r\nnode -e "process.stdout.write(\'second\')"\r\n'
      : '#!/bin/sh\nnode -e "process.stdout.write(\'second\')"\n'
  );
  if (process.platform !== 'win32') {
    chmodSync(firstBinPath, 0o755);
    chmodSync(secondBinPath, 0o755);
  }

  const firstEnv = { PATH: firstBinDir };
  const secondEnv = { PATH: secondBinDir };

  expect(findVercelCli({ cwd, path: firstEnv.PATH })).toEqual({
    command: realpathSync(firstBinPath),
    commandArgs: [],
    source: 'path',
  });
  expect(findVercelCli({ cwd, path: secondEnv.PATH })).toEqual({
    command: realpathSync(secondBinPath),
    commandArgs: [],
    source: 'path',
  });

  await expect(
    execVercelCli([], { cwd, env: firstEnv })
  ).resolves.toMatchObject({
    stdout: 'first',
    invocation: {
      command: realpathSync(firstBinPath),
      source: 'path',
    },
  });
  await expect(
    execVercelCli([], { cwd, env: secondEnv })
  ).resolves.toMatchObject({
    stdout: 'second',
    invocation: {
      command: realpathSync(secondBinPath),
      source: 'path',
    },
  });
});

test('inherits process PATH when the provided env omits it', async () => {
  const cwd = createDirectory();
  const globalBinDir = createDirectory();
  const binName = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const binPath = path.join(globalBinDir, binName);

  writeExecutable(binPath, {
    win32:
      '@echo off\r\nnode -e "process.stdout.write(process.env.TEST_VALUE || \'\')"\r\n',
    posix:
      '#!/bin/sh\nnode -e "process.stdout.write(process.env.TEST_VALUE || \'\')"\n',
  });
  vi.stubEnv('PATH', globalBinDir);

  await expect(
    execVercelCli([], {
      cwd,
      env: { TEST_VALUE: 'inherited-path' },
    })
  ).resolves.toMatchObject({
    stdout: 'inherited-path',
    invocation: {
      command: realpathSync(binPath),
      source: 'path',
    },
  });
});

windowsOnlyTest('uses the provided Path when env casing differs', async () => {
  const cwd = createDirectory();
  const globalBinDir = createDirectory();
  const binName = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const binPath = path.join(globalBinDir, binName);

  writeExecutable(binPath, {
    win32:
      '@echo off\r\nnode -e "process.stdout.write(process.env.TEST_VALUE || \'\')"\r\n',
    posix:
      '#!/bin/sh\nnode -e "process.stdout.write(process.env.TEST_VALUE || \'\')"\n',
  });
  vi.stubEnv('PATH', '');

  await expect(
    execVercelCli([], {
      cwd,
      env: {
        Path: globalBinDir,
        TEST_VALUE: 'case-insensitive-path',
      },
    })
  ).resolves.toMatchObject({
    stdout: 'case-insensitive-path',
    invocation: {
      command: realpathSync(binPath),
      source: 'path',
    },
  });
});

test('caches the resolved CLI lookup', () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const binName = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const binPath = path.join(root, 'node_modules', '.bin', binName);

  mkdirSync(cwd, { recursive: true });
  mkdirSync(path.dirname(binPath), { recursive: true });
  writeFileSync(
    binPath,
    process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n'
  );
  if (process.platform !== 'win32') {
    chmodSync(binPath, 0o755);
  }

  const first = findVercelCli({ cwd });
  rmSync(path.join(root, 'node_modules'), { recursive: true, force: true });
  const second = findVercelCli({ cwd });

  expect(second).toEqual(first);
});

test('skips directory entries while resolving the CLI', () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const binName = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const blockedBinPath = path.join(
    root,
    'apps',
    'web',
    'node_modules',
    '.bin',
    binName
  );
  const fallbackBinPath = path.join(root, 'node_modules', '.bin', binName);

  mkdirSync(cwd, { recursive: true });
  mkdirSync(blockedBinPath, { recursive: true });
  writeExecutable(fallbackBinPath, {
    win32: '@echo off\r\n',
    posix: '#!/bin/sh\n',
  });

  expect(findVercelCli({ cwd, path: '' })).toEqual({
    command: realpathSync(fallbackBinPath),
    commandArgs: [],
    source: 'local-bin',
  });
});

test('caches negative CLI lookups until the cache is cleared', () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const binName = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const binPath = path.join(root, 'node_modules', '.bin', binName);

  mkdirSync(cwd, { recursive: true });

  expect(findVercelCli({ cwd, path: '' })).toBeNull();

  writeExecutable(binPath, {
    win32: '@echo off\r\n',
    posix: '#!/bin/sh\n',
  });

  expect(findVercelCli({ cwd, path: '' })).toBeNull();

  clearVercelCliCache();

  expect(findVercelCli({ cwd, path: '' })).toEqual({
    command: realpathSync(binPath),
    commandArgs: [],
    source: 'local-bin',
  });
});

test('can execute the locally installed vercel package bin', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const binName = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const binPath = path.join(root, 'node_modules', '.bin', binName);

  mkdirSync(cwd, { recursive: true });
  mkdirSync(path.dirname(binPath), { recursive: true });
  writeFileSync(
    binPath,
    process.platform === 'win32'
      ? '@echo off\r\nnode -e "process.stdout.write(JSON.stringify({args:process.argv.slice(1)}))" %*\r\n'
      : '#!/bin/sh\nnode -e "process.stdout.write(JSON.stringify({args:process.argv.slice(1)}))" "$@"\n'
  );
  if (process.platform !== 'win32') {
    chmodSync(binPath, 0o755);
  }

  const result = await execVercelCli(['project', 'token', 'my-project'], {
    cwd,
  });

  expect(result?.invocation.source).toBe('local-bin');
  expect(JSON.parse(result?.stdout ?? '{}')).toEqual({
    args: ['project', 'token', 'my-project'],
  });
});

test('adds node to PATH when executing a local bin with a sanitized env', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const binName = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const binPath = path.join(root, 'node_modules', '.bin', binName);

  mkdirSync(cwd, { recursive: true });
  writeExecutable(binPath, {
    win32: '@echo off\r\nnode -e "process.stdout.write(\'ok\')"\r\n',
    posix: '#!/bin/sh\nnode -e "process.stdout.write(\'ok\')"\n',
  });

  await expect(
    execVercelCli([], { cwd, env: { PATH: '' } })
  ).resolves.toMatchObject({
    stdout: 'ok',
    invocation: {
      command: realpathSync(binPath),
      source: 'local-bin',
    },
  });
});

test('does not resolve a global CLI next to node when PATH is empty', async () => {
  const cwd = createDirectory();
  const fakeNodeDir = createDirectory();
  const originalExecPath = process.execPath;

  writeExecutable(
    path.join(
      fakeNodeDir,
      process.platform === 'win32' ? 'vercel.cmd' : 'vercel'
    ),
    {
      win32: '@echo off\r\nexit /b 0\r\n',
      posix: '#!/bin/sh\nexit 0\n',
    }
  );

  try {
    Object.defineProperty(process, 'execPath', {
      value: path.join(
        fakeNodeDir,
        process.platform === 'win32' ? 'node.exe' : 'node'
      ),
      configurable: true,
      writable: true,
    });

    expect(findVercelCli({ cwd, path: '' })).toBeNull();

    await expect(
      execVercelCli([], { cwd, env: { PATH: '' } })
    ).rejects.toMatchObject({
      code: 'VERCEL_CLI_NOT_FOUND',
    });
  } finally {
    Object.defineProperty(process, 'execPath', {
      value: originalExecPath,
      configurable: true,
      writable: true,
    });
  }
});

test('resolves relative PATH entries from the provided cwd', () => {
  const cwd = createDirectory();
  const relativeBinDir = path.join(cwd, 'tools');
  const binName = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const binPath = path.join(relativeBinDir, binName);

  writeExecutable(binPath, {
    win32: '@echo off\r\n',
    posix: '#!/bin/sh\n',
  });

  expect(findVercelCli({ cwd, path: path.join('.', 'tools') })).toEqual({
    command: realpathSync(binPath),
    commandArgs: [],
    source: 'path',
  });
});

const posixOnlyTest = process.platform === 'win32' ? test.skip : test;

posixOnlyTest('finds a local bin from a symlinked cwd', async () => {
  const root = createDirectory();
  const linkRoot = createDirectory();
  const realCwd = path.join(root, 'apps', 'web');
  const symlinkedCwd = path.join(linkRoot, 'apps', 'web');
  const binPath = path.join(root, 'node_modules', '.bin', 'vercel');

  mkdirSync(realCwd, { recursive: true });
  mkdirSync(path.dirname(symlinkedCwd), { recursive: true });
  writeExecutable(binPath, {
    win32: '@echo off\r\nnode -e "process.stdout.write(\'ok\')"\r\n',
    posix: '#!/bin/sh\nnode -e "process.stdout.write(\'ok\')"\n',
  });
  symlinkSync(realCwd, symlinkedCwd, 'dir');

  expect(findVercelCli({ cwd: symlinkedCwd, path: '' })).toEqual({
    command: realpathSync(binPath),
    commandArgs: [],
    source: 'local-bin',
  });

  await expect(
    execVercelCli([], { cwd: symlinkedCwd, env: { PATH: '' } })
  ).resolves.toMatchObject({
    stdout: 'ok',
    invocation: {
      command: realpathSync(binPath),
      source: 'local-bin',
    },
  });
});

posixOnlyTest(
  'prefers the real project local bin over a symlink parent bin',
  async () => {
    const root = createDirectory();
    const linkRoot = createDirectory();
    const realCwd = path.join(root, 'apps', 'web');
    const symlinkedCwd = path.join(linkRoot, 'apps', 'web');
    const realBinPath = path.join(root, 'node_modules', '.bin', 'vercel');
    const symlinkBinPath = path.join(
      linkRoot,
      'node_modules',
      '.bin',
      'vercel'
    );

    mkdirSync(realCwd, { recursive: true });
    mkdirSync(path.dirname(symlinkedCwd), { recursive: true });
    writeExecutable(realBinPath, {
      win32: '@echo off\r\nnode -e "process.stdout.write(\'real\')"\r\n',
      posix: '#!/bin/sh\nnode -e "process.stdout.write(\'real\')"\n',
    });
    writeExecutable(symlinkBinPath, {
      win32: '@echo off\r\nnode -e "process.stdout.write(\'fake\')"\r\n',
      posix: '#!/bin/sh\nnode -e "process.stdout.write(\'fake\')"\n',
    });
    symlinkSync(realCwd, symlinkedCwd, 'dir');

    expect(findVercelCli({ cwd: symlinkedCwd, path: '' })).toEqual({
      command: realpathSync(realBinPath),
      commandArgs: [],
      source: 'local-bin',
    });

    await expect(
      execVercelCli([], { cwd: symlinkedCwd, env: { PATH: '' } })
    ).resolves.toMatchObject({
      stdout: 'real',
      invocation: {
        command: realpathSync(realBinPath),
        source: 'local-bin',
      },
    });
  }
);

posixOnlyTest(
  'treats a symlinked local bin as a local node script',
  async () => {
    const root = createDirectory();
    const cwd = path.join(root, 'apps', 'web');
    const binPath = path.join(root, 'node_modules', '.bin', 'vercel');
    const cliPath = path.join(
      root,
      'node_modules',
      'vercel',
      'dist',
      'index.js'
    );

    mkdirSync(cwd, { recursive: true });
    mkdirSync(path.dirname(binPath), { recursive: true });
    mkdirSync(path.dirname(cliPath), { recursive: true });
    writeFileSync(
      cliPath,
      'process.stdout.write(JSON.stringify({args:process.argv.slice(2)}));\n'
    );
    chmodSync(cliPath, 0o755);
    symlinkSync(cliPath, binPath);

    expect(findVercelCli({ cwd })).toEqual({
      command: process.execPath,
      commandArgs: [realpathSync(binPath)],
      source: 'local-bin',
    });

    await expect(
      execVercelCli(['project', 'token', 'my-project'], { cwd })
    ).resolves.toMatchObject({
      stdout: JSON.stringify({ args: ['project', 'token', 'my-project'] }),
      invocation: {
        command: process.execPath,
        commandArgs: [realpathSync(binPath)],
        source: 'local-bin',
      },
    });
  }
);

test('throws a not-found error when no CLI can be resolved', async () => {
  const cwd = createDirectory();
  vi.stubEnv('PATH', '');

  await expect(
    execVercelCli(['project', 'token'], { cwd })
  ).rejects.toMatchObject({
    code: 'VERCEL_CLI_NOT_FOUND',
  });
});

test('throws an invalid-cwd error when cwd does not exist', async () => {
  const cwd = path.join(createDirectory(), 'missing');

  await expect(execVercelCli(['project', 'token'], { cwd })).rejects.toEqual(
    expect.objectContaining<VercelCliError>({
      code: 'VERCEL_CLI_INVALID_CWD',
      message: `Working directory ${JSON.stringify(cwd)} does not exist or is not a directory.`,
    })
  );
});

test('throws an exit-code error when the CLI exits non-zero', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const binName = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const binPath = path.join(root, 'node_modules', '.bin', binName);

  mkdirSync(cwd, { recursive: true });
  mkdirSync(path.dirname(binPath), { recursive: true });
  writeFileSync(
    binPath,
    process.platform === 'win32'
      ? '@echo off\r\nexit /b 7\r\n'
      : '#!/bin/sh\nexit 7\n'
  );
  if (process.platform !== 'win32') {
    chmodSync(binPath, 0o755);
  }

  await expect(execVercelCli(['project', 'token'], { cwd })).rejects.toEqual(
    expect.objectContaining<VercelCliError>({
      code: 'VERCEL_CLI_ERRORED',
      exitCode: 7,
      invocation: {
        command: realpathSync(binPath),
        commandArgs: [],
        source: 'local-bin',
      },
    })
  );
});
