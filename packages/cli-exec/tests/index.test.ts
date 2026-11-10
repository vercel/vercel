import { afterEach, expect, test, vi } from 'vitest';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import {
  clearVercelCliLookupCache,
  execVercelCli,
  findVercelCli,
  VercelCliError,
} from '../src/index';

const directories: string[] = [];

afterEach(() => {
  clearVercelCliLookupCache();
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

async function expectedRealPath(filePath: string): Promise<string> {
  try {
    return await realpath(filePath);
  } catch {
    return path.resolve(filePath);
  }
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

function getVercelBinName(): string {
  return process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
}

function writeProjectRoot(root: string) {
  mkdirSync(root, { recursive: true });
  mkdirSync(path.join(root, '.git'), { recursive: true });
}

function writePackageJson(root: string) {
  mkdirSync(root, { recursive: true });
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ private: true })
  );
}

function writeLocalVercelPackage(
  root: string,
  contents = 'process.stdout.write(JSON.stringify({args:process.argv.slice(2)}));\n',
  options: { writeProjectRoot?: boolean } = {}
): { binPath: string; cliPath: string } {
  const binPath = path.join(root, 'node_modules', '.bin', getVercelBinName());
  const packageDirectory = path.join(root, 'node_modules', 'vercel');
  const cliPath = path.join(packageDirectory, 'dist', 'vc.js');

  if (options.writeProjectRoot !== false) {
    writeProjectRoot(root);
  }
  mkdirSync(path.dirname(binPath), { recursive: true });
  mkdirSync(path.dirname(cliPath), { recursive: true });
  writeFileSync(
    path.join(packageDirectory, 'package.json'),
    JSON.stringify({ name: 'vercel', bin: { vercel: './dist/vc.js' } })
  );
  writeFileSync(cliPath, contents);

  if (process.platform === 'win32') {
    writeFileSync(binPath, '@echo off\r\n');
  } else {
    chmodSync(cliPath, 0o755);
    symlinkSync(cliPath, binPath);
  }

  return { binPath, cliPath };
}

const windowsOnlyTest = process.platform === 'win32' ? test : test.skip;
const posixOnlyTest = process.platform === 'win32' ? test.skip : test;

test('finds a local node_modules bin via the prepended PATH', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const { cliPath } = writeLocalVercelPackage(root);

  mkdirSync(cwd, { recursive: true });

  expect(await findVercelCli({ cwd })).toEqual({
    command: process.execPath,
    commandArgs: [await expectedRealPath(cliPath)],
    source: 'local-bin',
  });

  const invocation = await findVercelCli({ cwd });

  expect(invocation).toEqual({
    command: process.execPath,
    commandArgs: [await expectedRealPath(cliPath)],
    source: 'local-bin',
  });

  return expect(
    execVercelCli(['project', 'token', 'my-project'], { cwd })
  ).resolves.toMatchObject({
    invocation: {
      command: process.execPath,
      commandArgs: [await expectedRealPath(cliPath)],
      source: 'local-bin',
    },
    stdout: JSON.stringify({ args: ['project', 'token', 'my-project'] }),
  });
});

test('prefers the installed package bin over node_modules/.bin shims', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const { binPath: shimPath, cliPath } = writeLocalVercelPackage(
    root,
    "process.stdout.write('official');\n"
  );

  mkdirSync(cwd, { recursive: true });
  rmSync(shimPath, { force: true });
  writeFileSync(
    shimPath,
    process.platform === 'win32'
      ? '@echo off\r\nnode -e "process.stdout.write(\'shim\')"\r\n'
      : '#!/bin/sh\necho shim\n'
  );
  if (process.platform !== 'win32') {
    chmodSync(shimPath, 0o755);
  }

  const invocation = await findVercelCli({ cwd });

  expect(invocation).toEqual({
    command: process.execPath,
    commandArgs: [await expectedRealPath(cliPath)],
    source: 'local-bin',
  });
});

test('skips a local vercel bin that is not from the vercel package', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const globalBinDir = createDirectory();
  const localBinPath = path.join(
    root,
    'node_modules',
    '.bin',
    getVercelBinName()
  );
  const globalBinPath = path.join(globalBinDir, getVercelBinName());

  mkdirSync(cwd, { recursive: true });
  writeExecutable(localBinPath, {
    win32: '@echo off\r\nnode -e "process.stdout.write(\'local\')"\r\n',
    posix: '#!/bin/sh\necho local\n',
  });
  writeExecutable(globalBinPath, {
    win32: '@echo off\r\nnode -e "process.stdout.write(\'global\')"\r\n',
    posix: '#!/bin/sh\necho global\n',
  });

  expect(await findVercelCli({ cwd, path: globalBinDir })).toEqual({
    command: await expectedRealPath(globalBinPath),
    commandArgs: [],
    source: 'path',
  });
});

test('does not walk past the nearest project root marker', async () => {
  const parent = createDirectory();
  const project = path.join(parent, 'project');
  const cwd = path.join(project, 'apps', 'web');
  const { cliPath: parentCliPath } = writeLocalVercelPackage(
    parent,
    "process.stdout.write('parent');\n"
  );

  writeProjectRoot(project);
  mkdirSync(cwd, { recursive: true });

  expect(await findVercelCli({ cwd, path: '' })).toBeNull();

  const { cliPath: projectCliPath } = writeLocalVercelPackage(
    project,
    "process.stdout.write('project');\n"
  );

  clearVercelCliLookupCache();

  expect(await findVercelCli({ cwd, path: '' })).toEqual({
    command: process.execPath,
    commandArgs: [await expectedRealPath(projectCliPath)],
    source: 'local-bin',
  });
  expect(parentCliPath).not.toBe(projectCliPath);
});

test('keeps walking up when no project root marker is found', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const { cliPath } = writeLocalVercelPackage(
    root,
    "process.stdout.write('root');\n"
  );

  rmSync(path.join(root, '.git'), { recursive: true, force: true });
  mkdirSync(cwd, { recursive: true });

  expect(await findVercelCli({ cwd, path: '' })).toEqual({
    command: process.execPath,
    commandArgs: [await expectedRealPath(cliPath)],
    source: 'local-bin',
  });
});

test('does walk past package.json files inside a project', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const { cliPath } = writeLocalVercelPackage(
    root,
    "process.stdout.write('root');\n"
  );

  writePackageJson(path.join(root, 'apps'));
  writePackageJson(cwd);

  expect(await findVercelCli({ cwd, path: '' })).toEqual({
    command: process.execPath,
    commandArgs: [await expectedRealPath(cliPath)],
    source: 'local-bin',
  });
});

test('does not use an out-of-bound node_modules bin listed in PATH', async () => {
  const parent = createDirectory();
  const project = path.join(parent, 'project');
  const cwd = path.join(project, 'apps', 'web');
  const globalBinDir = createDirectory();
  const parentBinDirectory = path.join(parent, 'node_modules', '.bin');
  const { cliPath: parentCliPath } = writeLocalVercelPackage(
    parent,
    "process.stdout.write('parent');\n"
  );
  const globalBinPath = path.join(globalBinDir, getVercelBinName());

  writeProjectRoot(project);
  mkdirSync(cwd, { recursive: true });
  writeExecutable(globalBinPath, {
    win32: '@echo off\r\nnode -e "process.stdout.write(\'global\')"\r\n',
    posix: '#!/bin/sh\necho global\n',
  });

  expect(
    await findVercelCli({
      cwd,
      path: [parentBinDirectory, globalBinDir].join(path.delimiter),
    })
  ).toEqual({
    command: await expectedRealPath(globalBinPath),
    commandArgs: [],
    source: 'path',
  });

  await expect(
    execVercelCli([], { cwd, env: { PATH: parentBinDirectory } })
  ).rejects.toMatchObject({
    code: 'VERCEL_CLI_NOT_FOUND',
    message: expect.stringContaining(
      'local bin is outside project lookup boundary'
    ),
  });
  expect(parentCliPath).toBeTruthy();
});

posixOnlyTest(
  'skips world-writable ancestor node_modules directories',
  async () => {
    const root = createDirectory();
    const cwd = path.join(root, 'apps', 'web');
    const globalBinDir = createDirectory();
    const { cliPath } = writeLocalVercelPackage(
      root,
      "process.stdout.write('local');\n"
    );
    const globalBinPath = path.join(globalBinDir, getVercelBinName());

    mkdirSync(cwd, { recursive: true });
    writeExecutable(globalBinPath, {
      win32: '@echo off\r\nnode -e "process.stdout.write(\'global\')"\r\n',
      posix: '#!/bin/sh\necho global\n',
    });
    chmodSync(path.join(root, 'node_modules'), 0o777);

    try {
      expect(await findVercelCli({ cwd, path: globalBinDir })).toEqual({
        command: await expectedRealPath(globalBinPath),
        commandArgs: [],
        source: 'path',
      });
    } finally {
      chmodSync(path.join(root, 'node_modules'), 0o755);
    }

    expect(cliPath).toBeTruthy();
  }
);

posixOnlyTest(
  'skips group-writable ancestor node_modules directories',
  async () => {
    const root = createDirectory();
    const cwd = path.join(root, 'apps', 'web');
    const globalBinDir = createDirectory();
    const { cliPath } = writeLocalVercelPackage(
      root,
      "process.stdout.write('local');\n"
    );
    const globalBinPath = path.join(globalBinDir, getVercelBinName());

    mkdirSync(cwd, { recursive: true });
    writeExecutable(globalBinPath, {
      win32: '@echo off\r\nnode -e "process.stdout.write(\'global\')"\r\n',
      posix: '#!/bin/sh\necho global\n',
    });
    chmodSync(path.join(root, 'node_modules'), 0o775);

    try {
      expect(await findVercelCli({ cwd, path: globalBinDir })).toEqual({
        command: await expectedRealPath(globalBinPath),
        commandArgs: [],
        source: 'path',
      });
    } finally {
      chmodSync(path.join(root, 'node_modules'), 0o755);
    }

    expect(cliPath).toBeTruthy();
  }
);

posixOnlyTest(
  'skips local bins when the node_modules parent directory is unsafe',
  async () => {
    const root = createDirectory();
    const cwd = path.join(root, 'apps', 'web');
    const globalBinDir = createDirectory();
    const { cliPath } = writeLocalVercelPackage(
      root,
      "process.stdout.write('local');\n"
    );
    const globalBinPath = path.join(globalBinDir, getVercelBinName());

    mkdirSync(cwd, { recursive: true });
    writeExecutable(globalBinPath, {
      win32: '@echo off\r\nnode -e "process.stdout.write(\'global\')"\r\n',
      posix: '#!/bin/sh\necho global\n',
    });
    chmodSync(root, 0o777);

    try {
      expect(await findVercelCli({ cwd, path: globalBinDir })).toEqual({
        command: await expectedRealPath(globalBinPath),
        commandArgs: [],
        source: 'path',
      });

      await expect(
        execVercelCli([], { cwd, env: { PATH: '' } })
      ).rejects.toMatchObject({
        code: 'VERCEL_CLI_NOT_FOUND',
        message: expect.stringContaining('world-writable'),
      });
    } finally {
      chmodSync(root, 0o700);
    }

    expect(cliPath).toBeTruthy();
  }
);

posixOnlyTest(
  'skips nested local bins when an intermediate parent directory is unsafe',
  async () => {
    const root = createDirectory();
    const workspace = path.join(root, 'packages', 'web');
    const cwd = path.join(workspace, 'src');
    const globalBinDir = createDirectory();
    const { cliPath } = writeLocalVercelPackage(
      workspace,
      "process.stdout.write('local');\n",
      { writeProjectRoot: false }
    );
    const globalBinPath = path.join(globalBinDir, getVercelBinName());

    writeProjectRoot(root);
    mkdirSync(cwd, { recursive: true });
    writeExecutable(globalBinPath, {
      win32: '@echo off\r\nnode -e "process.stdout.write(\'global\')"\r\n',
      posix: '#!/bin/sh\necho global\n',
    });
    chmodSync(path.join(root, 'packages'), 0o777);

    try {
      expect(await findVercelCli({ cwd, path: globalBinDir })).toEqual({
        command: await expectedRealPath(globalBinPath),
        commandArgs: [],
        source: 'path',
      });

      await expect(
        execVercelCli([], { cwd, env: { PATH: '' } })
      ).rejects.toMatchObject({
        code: 'VERCEL_CLI_NOT_FOUND',
        message: expect.stringContaining('packages'),
      });
    } finally {
      chmodSync(path.join(root, 'packages'), 0o755);
    }

    expect(cliPath).toBeTruthy();
  }
);

posixOnlyTest(
  'skips nested local bins without a project marker when an intermediate parent directory is unsafe',
  async () => {
    const root = createDirectory();
    const cwd = path.join(root, 'packages', 'web', 'src');
    const globalBinDir = createDirectory();
    const { cliPath } = writeLocalVercelPackage(
      root,
      "process.stdout.write('local');\n",
      { writeProjectRoot: false }
    );
    const globalBinPath = path.join(globalBinDir, getVercelBinName());

    mkdirSync(cwd, { recursive: true });
    writeExecutable(globalBinPath, {
      win32: '@echo off\r\nnode -e "process.stdout.write(\'global\')"\r\n',
      posix: '#!/bin/sh\necho global\n',
    });
    chmodSync(path.join(root, 'packages'), 0o777);

    try {
      expect(await findVercelCli({ cwd, path: globalBinDir })).toEqual({
        command: await expectedRealPath(globalBinPath),
        commandArgs: [],
        source: 'path',
      });

      await expect(
        execVercelCli([], { cwd, env: { PATH: '' } })
      ).rejects.toMatchObject({
        code: 'VERCEL_CLI_NOT_FOUND',
        message: expect.stringContaining('packages'),
      });
    } finally {
      chmodSync(path.join(root, 'packages'), 0o755);
    }

    expect(cliPath).toBeTruthy();
  }
);

posixOnlyTest(
  'does not prepend unsafe local bin directories to the child PATH',
  async () => {
    const root = createDirectory();
    const cwd = path.join(root, 'apps', 'web');
    const globalBinDir = createDirectory();
    const { cliPath } = writeLocalVercelPackage(
      root,
      "process.stdout.write(process.env.PATH || '');\n"
    );
    const globalBinPath = path.join(globalBinDir, getVercelBinName());
    const localBinDirectory = path.join(root, 'node_modules', '.bin');

    mkdirSync(cwd, { recursive: true });
    writeExecutable(globalBinPath, {
      win32:
        '@echo off\r\nnode -e "process.stdout.write(process.env.PATH || process.env.Path || \'\')"\r\n',
      posix:
        '#!/bin/sh\nnode -e "process.stdout.write(process.env.PATH || \'\')"\n',
    });
    chmodSync(localBinDirectory, 0o777);

    try {
      const result = await execVercelCli([], {
        cwd,
        env: { PATH: globalBinDir },
      });

      expect(result).toMatchObject({
        invocation: {
          command: await expectedRealPath(globalBinPath),
          commandArgs: [],
          source: 'path',
        },
      });

      expect(result.stdout?.split(path.delimiter)).not.toContain(
        localBinDirectory
      );
      expect(result.stdout?.split(path.delimiter)).toContain(globalBinDir);
    } finally {
      chmodSync(localBinDirectory, 0o755);
    }

    expect(cliPath).toBeTruthy();
  }
);

posixOnlyTest(
  'skips local vercel package bins in unsafe subdirectories',
  async () => {
    const root = createDirectory();
    const cwd = path.join(root, 'apps', 'web');
    const globalBinDir = createDirectory();
    const { cliPath } = writeLocalVercelPackage(
      root,
      "process.stdout.write('local');\n"
    );
    const globalBinPath = path.join(globalBinDir, getVercelBinName());
    const packageDistDirectory = path.dirname(cliPath);

    mkdirSync(cwd, { recursive: true });
    writeExecutable(globalBinPath, {
      win32: '@echo off\r\nnode -e "process.stdout.write(\'global\')"\r\n',
      posix: '#!/bin/sh\necho global\n',
    });
    chmodSync(packageDistDirectory, 0o777);

    try {
      expect(await findVercelCli({ cwd, path: globalBinDir })).toEqual({
        command: await expectedRealPath(globalBinPath),
        commandArgs: [],
        source: 'path',
      });
    } finally {
      chmodSync(packageDistDirectory, 0o755);
    }
  }
);

posixOnlyTest(
  'skips local vercel package bins in group-writable subdirectories',
  async () => {
    const root = createDirectory();
    const cwd = path.join(root, 'apps', 'web');
    const globalBinDir = createDirectory();
    const { cliPath } = writeLocalVercelPackage(
      root,
      "process.stdout.write('local');\n"
    );
    const globalBinPath = path.join(globalBinDir, getVercelBinName());
    const packageDistDirectory = path.dirname(cliPath);

    mkdirSync(cwd, { recursive: true });
    writeExecutable(globalBinPath, {
      win32: '@echo off\r\nnode -e "process.stdout.write(\'global\')"\r\n',
      posix: '#!/bin/sh\necho global\n',
    });
    chmodSync(packageDistDirectory, 0o775);

    try {
      expect(await findVercelCli({ cwd, path: globalBinDir })).toEqual({
        command: await expectedRealPath(globalBinPath),
        commandArgs: [],
        source: 'path',
      });
    } finally {
      chmodSync(packageDistDirectory, 0o755);
    }
  }
);

posixOnlyTest('skips local vercel packages in unsafe directories', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const globalBinDir = createDirectory();
  const { cliPath } = writeLocalVercelPackage(
    root,
    "process.stdout.write('local');\n"
  );
  const globalBinPath = path.join(globalBinDir, getVercelBinName());
  const packageDirectory = path.dirname(path.dirname(cliPath));

  mkdirSync(cwd, { recursive: true });
  writeExecutable(globalBinPath, {
    win32: '@echo off\r\nnode -e "process.stdout.write(\'global\')"\r\n',
    posix: '#!/bin/sh\necho global\n',
  });
  chmodSync(packageDirectory, 0o777);

  try {
    expect(await findVercelCli({ cwd, path: globalBinDir })).toEqual({
      command: await expectedRealPath(globalBinPath),
      commandArgs: [],
      source: 'path',
    });

    await expect(
      execVercelCli([], { cwd, env: { PATH: '' } })
    ).rejects.toMatchObject({
      code: 'VERCEL_CLI_NOT_FOUND',
      message: expect.stringContaining('local vercel package is unsafe'),
    });
  } finally {
    chmodSync(packageDirectory, 0o755);
  }
});

posixOnlyTest('skips unsafe local vercel package.json files', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const globalBinDir = createDirectory();
  const { cliPath } = writeLocalVercelPackage(
    root,
    "process.stdout.write('local');\n"
  );
  const globalBinPath = path.join(globalBinDir, getVercelBinName());
  const packageJsonPath = path.join(
    path.dirname(path.dirname(cliPath)),
    'package.json'
  );

  mkdirSync(cwd, { recursive: true });
  writeExecutable(globalBinPath, {
    win32: '@echo off\r\nnode -e "process.stdout.write(\'global\')"\r\n',
    posix: '#!/bin/sh\necho global\n',
  });
  chmodSync(packageJsonPath, 0o777);

  try {
    expect(await findVercelCli({ cwd, path: globalBinDir })).toEqual({
      command: await expectedRealPath(globalBinPath),
      commandArgs: [],
      source: 'path',
    });

    await expect(
      execVercelCli([], { cwd, env: { PATH: '' } })
    ).rejects.toMatchObject({
      code: 'VERCEL_CLI_NOT_FOUND',
      message: expect.stringContaining('local vercel package.json is unsafe'),
    });
  } finally {
    chmodSync(packageJsonPath, 0o644);
  }
});

posixOnlyTest(
  'reports inaccessible local bin path candidates as skipped candidates',
  async () => {
    const root = createDirectory();
    const cwd = path.join(root, 'apps', 'web');
    const globalBinDir = createDirectory();
    const { cliPath } = writeLocalVercelPackage(
      root,
      "process.stdout.write('local');\n"
    );
    const globalBinPath = path.join(globalBinDir, getVercelBinName());

    mkdirSync(cwd, { recursive: true });
    writeExecutable(globalBinPath, {
      win32: '@echo off\r\nnode -e "process.stdout.write(\'global\')"\r\n',
      posix: '#!/bin/sh\necho global\n',
    });
    chmodSync(cliPath, 0o644);

    expect(await findVercelCli({ cwd, path: globalBinDir })).toEqual({
      command: await expectedRealPath(globalBinPath),
      commandArgs: [],
      source: 'path',
    });

    await expect(
      execVercelCli([], { cwd, env: { PATH: '' } })
    ).rejects.toMatchObject({
      code: 'VERCEL_CLI_NOT_FOUND',
      message: expect.stringContaining(
        `Skipped ${JSON.stringify(
          path.join(
            await expectedRealPath(root),
            'node_modules',
            '.bin',
            getVercelBinName()
          )
        )}`
      ),
    });
    await expect(
      execVercelCli([], { cwd, env: { PATH: '' } })
    ).rejects.toMatchObject({
      message: expect.stringContaining('local bin is not accessible'),
    });
  }
);

posixOnlyTest(
  'reports non-executable declared local vercel package bins as skipped candidates',
  async () => {
    const root = createDirectory();
    const cwd = path.join(root, 'apps', 'web');
    const globalBinDir = createDirectory();
    const { binPath, cliPath: nodeCliPath } = writeLocalVercelPackage(
      root,
      '#!/bin/sh\necho local\n'
    );
    const packageDirectory = path.dirname(path.dirname(nodeCliPath));
    const cliPath = path.join(packageDirectory, 'dist', 'vc');
    const globalBinPath = path.join(globalBinDir, getVercelBinName());

    mkdirSync(cwd, { recursive: true });
    writeFileSync(
      path.join(packageDirectory, 'package.json'),
      JSON.stringify({ name: 'vercel', bin: { vercel: './dist/vc' } })
    );
    writeFileSync(cliPath, '#!/bin/sh\necho local\n');
    writeExecutable(globalBinPath, {
      win32: '@echo off\r\nnode -e "process.stdout.write(\'global\')"\r\n',
      posix: '#!/bin/sh\necho global\n',
    });
    rmSync(binPath, { force: true });
    writeExecutable(binPath, {
      win32: '@echo off\r\n',
      posix: '#!/bin/sh\necho shim\n',
    });
    chmodSync(cliPath, 0o644);

    expect(await findVercelCli({ cwd, path: globalBinDir })).toEqual({
      command: await expectedRealPath(globalBinPath),
      commandArgs: [],
      source: 'path',
    });

    await expect(
      execVercelCli([], { cwd, env: { PATH: '' } })
    ).rejects.toMatchObject({
      code: 'VERCEL_CLI_NOT_FOUND',
      message: expect.stringContaining(
        `Skipped ${JSON.stringify(
          path.join(
            await expectedRealPath(root),
            'node_modules',
            '.bin',
            getVercelBinName()
          )
        )}`
      ),
    });
    await expect(
      execVercelCli([], { cwd, env: { PATH: '' } })
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        'local vercel package bin is not executable'
      ),
    });
  }
);

posixOnlyTest(
  'skips local vercel packages that resolve outside local node_modules',
  async () => {
    const root = createDirectory();
    const cwd = path.join(root, 'apps', 'web');
    const externalPackageDirectory = path.join(
      createDirectory(),
      'vercel-package'
    );
    const cliPath = path.join(externalPackageDirectory, 'dist', 'vc.js');
    const localPackageDirectory = path.join(root, 'node_modules', 'vercel');
    const localBinPath = path.join(root, 'node_modules', '.bin', 'vercel');
    const globalBinDir = createDirectory();
    const globalBinPath = path.join(globalBinDir, 'vercel');

    writeProjectRoot(root);
    mkdirSync(cwd, { recursive: true });
    mkdirSync(path.dirname(localBinPath), { recursive: true });
    mkdirSync(path.dirname(cliPath), { recursive: true });
    writeFileSync(
      path.join(externalPackageDirectory, 'package.json'),
      JSON.stringify({ name: 'vercel', bin: { vercel: './dist/vc.js' } })
    );
    writeFileSync(cliPath, "process.stdout.write('external');\n");
    chmodSync(cliPath, 0o755);
    symlinkSync(externalPackageDirectory, localPackageDirectory, 'dir');
    symlinkSync(cliPath, localBinPath);
    writeExecutable(globalBinPath, {
      win32: '@echo off\r\nnode -e "process.stdout.write(\'global\')"\r\n',
      posix: '#!/bin/sh\necho global\n',
    });

    expect(await findVercelCli({ cwd, path: globalBinDir })).toEqual({
      command: await expectedRealPath(globalBinPath),
      commandArgs: [],
      source: 'path',
    });
  }
);

posixOnlyTest(
  'skips local vercel package bins under unsafe realpath ancestors',
  async () => {
    const root = createDirectory();
    const cwd = path.join(root, 'apps', 'web');
    const storePackageDirectory = path.join(
      root,
      'node_modules',
      '.pnpm',
      'vercel@1.0.0',
      'node_modules',
      'vercel'
    );
    const cliPath = path.join(storePackageDirectory, 'dist', 'vc.js');
    const localPackageDirectory = path.join(root, 'node_modules', 'vercel');
    const localBinPath = path.join(root, 'node_modules', '.bin', 'vercel');
    const globalBinDir = createDirectory();
    const globalBinPath = path.join(globalBinDir, 'vercel');

    writeProjectRoot(root);
    mkdirSync(cwd, { recursive: true });
    mkdirSync(path.dirname(localBinPath), { recursive: true });
    mkdirSync(path.dirname(cliPath), { recursive: true });
    writeFileSync(
      path.join(storePackageDirectory, 'package.json'),
      JSON.stringify({ name: 'vercel', bin: { vercel: './dist/vc.js' } })
    );
    writeFileSync(cliPath, "process.stdout.write('local');\n");
    chmodSync(cliPath, 0o755);
    symlinkSync(storePackageDirectory, localPackageDirectory, 'dir');
    symlinkSync(cliPath, localBinPath);
    writeExecutable(globalBinPath, {
      win32: '@echo off\r\nnode -e "process.stdout.write(\'global\')"\r\n',
      posix: '#!/bin/sh\necho global\n',
    });
    chmodSync(path.join(root, 'node_modules', '.pnpm'), 0o777);

    try {
      expect(await findVercelCli({ cwd, path: globalBinDir })).toEqual({
        command: await expectedRealPath(globalBinPath),
        commandArgs: [],
        source: 'path',
      });
    } finally {
      chmodSync(path.join(root, 'node_modules', '.pnpm'), 0o755);
    }
  }
);

posixOnlyTest(
  'includes local lookup diagnostics when no CLI can be resolved',
  async () => {
    const parent = createDirectory();
    const project = path.join(parent, 'project');
    const cwd = path.join(project, 'apps', 'web');
    const unverifiedBinPath = path.join(
      project,
      'node_modules',
      '.bin',
      getVercelBinName()
    );

    writeLocalVercelPackage(parent, "process.stdout.write('parent');\n");
    writeProjectRoot(project);
    mkdirSync(cwd, { recursive: true });
    writeExecutable(unverifiedBinPath, {
      win32: '@echo off\r\nnode -e "process.stdout.write(\'unverified\')"\r\n',
      posix: '#!/bin/sh\necho unverified\n',
    });
    chmodSync(path.join(project, 'node_modules'), 0o777);

    try {
      const expectedProjectPath = await expectedRealPath(project);

      await expect(
        execVercelCli([], { cwd, env: { PATH: '' } })
      ).rejects.toMatchObject({
        code: 'VERCEL_CLI_NOT_FOUND',
        message: expect.stringContaining('Unable to find a usable Vercel CLI'),
      });

      await expect(
        execVercelCli([], { cwd, env: { PATH: '' } })
      ).rejects.toMatchObject({
        message: expect.stringContaining(
          `Local bin lookup stopped at ${JSON.stringify(expectedProjectPath)}`
        ),
      });
      await expect(
        execVercelCli([], { cwd, env: { PATH: '' } })
      ).rejects.toMatchObject({
        message: expect.stringContaining('world-writable'),
      });
    } finally {
      chmodSync(path.join(project, 'node_modules'), 0o755);
    }
  }
);

test('includes skipped local bin diagnostics when local bin verification fails', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const unverifiedBinPath = path.join(
    root,
    'node_modules',
    '.bin',
    getVercelBinName()
  );

  writeProjectRoot(root);
  mkdirSync(cwd, { recursive: true });
  writeExecutable(unverifiedBinPath, {
    win32: '@echo off\r\nnode -e "process.stdout.write(\'unverified\')"\r\n',
    posix: '#!/bin/sh\necho unverified\n',
  });
  const expectedUnverifiedBinPath = await expectedRealPath(unverifiedBinPath);

  await expect(
    execVercelCli([], { cwd, env: { PATH: '' } })
  ).rejects.toMatchObject({
    code: 'VERCEL_CLI_NOT_FOUND',
    message: expect.stringContaining(
      `Skipped ${JSON.stringify(expectedUnverifiedBinPath)}`
    ),
  });
  await expect(
    execVercelCli([], { cwd, env: { PATH: '' } })
  ).rejects.toMatchObject({
    message: expect.stringContaining('could not validate local vercel package'),
  });
});

test('ignores overwritten local shims when the vercel package is installed', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const { binPath: shimPath, cliPath } = writeLocalVercelPackage(
    root,
    "process.stdout.write('official');\n"
  );

  mkdirSync(cwd, { recursive: true });
  rmSync(shimPath, { force: true });
  writeExecutable(shimPath, {
    win32: '@echo off\r\nnode -e "process.stdout.write(\'spoofed\')"\r\n',
    posix: '#!/bin/sh\necho spoofed\n',
  });

  await expect(execVercelCli([], { cwd })).resolves.toMatchObject({
    invocation: {
      command: process.execPath,
      commandArgs: [await expectedRealPath(cliPath)],
      source: 'local-bin',
    },
    stdout: 'official',
  });
});

test('falls back to PATH when no local binary exists', async () => {
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

  expect(await findVercelCli({ cwd })).toEqual({
    command: await expectedRealPath(binPath),
    commandArgs: [],
    source: 'path',
  });
});

windowsOnlyTest('falls back to Path when PATH is unset', async () => {
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

    expect(await findVercelCli({ cwd })).toEqual({
      command: await expectedRealPath(binPath),
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

  expect(await findVercelCli({ cwd, path: firstEnv.PATH })).toEqual({
    command: await expectedRealPath(firstBinPath),
    commandArgs: [],
    source: 'path',
  });
  expect(await findVercelCli({ cwd, path: secondEnv.PATH })).toEqual({
    command: await expectedRealPath(secondBinPath),
    commandArgs: [],
    source: 'path',
  });

  await expect(
    execVercelCli([], { cwd, env: firstEnv })
  ).resolves.toMatchObject({
    stdout: 'first',
    invocation: {
      command: await expectedRealPath(firstBinPath),
      source: 'path',
    },
  });
  await expect(
    execVercelCli([], { cwd, env: secondEnv })
  ).resolves.toMatchObject({
    stdout: 'second',
    invocation: {
      command: await expectedRealPath(secondBinPath),
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
      command: await expectedRealPath(binPath),
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
      command: await expectedRealPath(binPath),
      source: 'path',
    },
  });
});

test('caches the resolved CLI lookup', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  writeLocalVercelPackage(root);

  mkdirSync(cwd, { recursive: true });

  const first = await findVercelCli({ cwd });
  rmSync(path.join(root, 'node_modules'), { recursive: true, force: true });
  const second = await findVercelCli({ cwd });

  expect(second).toEqual(first);
});

test('skips directory entries while resolving the CLI', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const binName = getVercelBinName();
  const blockedBinPath = path.join(
    root,
    'apps',
    'web',
    'node_modules',
    '.bin',
    binName
  );
  const { cliPath } = writeLocalVercelPackage(root);

  mkdirSync(cwd, { recursive: true });
  mkdirSync(blockedBinPath, { recursive: true });

  expect(await findVercelCli({ cwd, path: '' })).toEqual({
    command: process.execPath,
    commandArgs: [await expectedRealPath(cliPath)],
    source: 'local-bin',
  });
});

test('caches negative CLI lookups until the cache is cleared', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const binPath = path.join(root, 'node_modules', '.bin', getVercelBinName());

  mkdirSync(cwd, { recursive: true });

  expect(await findVercelCli({ cwd, path: '' })).toBeNull();

  writeExecutable(binPath, {
    win32: '@echo off\r\n',
    posix: '#!/bin/sh\n',
  });

  expect(await findVercelCli({ cwd, path: '' })).toBeNull();

  clearVercelCliLookupCache();
  rmSync(binPath, { force: true });
  const { cliPath } = writeLocalVercelPackage(root);

  expect(await findVercelCli({ cwd, path: '' })).toEqual({
    command: process.execPath,
    commandArgs: [await expectedRealPath(cliPath)],
    source: 'local-bin',
  });
});

test('can execute the locally installed vercel package bin', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  writeLocalVercelPackage(root);

  mkdirSync(cwd, { recursive: true });
  const result = await execVercelCli(['project', 'token', 'my-project'], {
    cwd,
  });

  expect(result?.invocation.source).toBe('local-bin');
  expect(JSON.parse(result?.stdout ?? '{}')).toEqual({
    args: ['project', 'token', 'my-project'],
  });
});

test('passes input through to execa', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const { cliPath } = writeLocalVercelPackage(
    root,
    "let data='';process.stdin.on('data',chunk=>data+=chunk);process.stdin.on('end',()=>process.stdout.write(data.toUpperCase()))\n"
  );

  mkdirSync(cwd, { recursive: true });

  await expect(
    execVercelCli([], { cwd, input: 'hello', stdin: 'pipe' })
  ).resolves.toMatchObject({
    stdout: 'HELLO',
    invocation: {
      command: process.execPath,
      commandArgs: [await expectedRealPath(cliPath)],
      source: 'local-bin',
    },
  });
});

test('passes stdout and stderr options through to execa', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const { cliPath } = writeLocalVercelPackage(
    root,
    "process.stdout.write('out');process.stderr.write('err')\n"
  );

  mkdirSync(cwd, { recursive: true });

  await expect(
    execVercelCli([], {
      cwd,
      stdout: 'ignore',
      stderr: 'pipe',
    })
  ).resolves.toMatchObject({
    stdout: undefined,
    stderr: 'err',
    invocation: {
      command: process.execPath,
      commandArgs: [await expectedRealPath(cliPath)],
      source: 'local-bin',
    },
  });
});

test('passes stdio through to execa', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const { cliPath } = writeLocalVercelPackage(
    root,
    "process.stdout.write('out');process.stderr.write('err')\n"
  );

  mkdirSync(cwd, { recursive: true });

  await expect(execVercelCli([], { cwd, stdio: 'ignore' })).resolves.toEqual({
    stdout: undefined,
    stderr: undefined,
    invocation: {
      command: process.execPath,
      commandArgs: [await expectedRealPath(cliPath)],
      source: 'local-bin',
    },
  });
});

test('passes timeout through to execa', async () => {
  const root = createDirectory();
  const binName = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const cwd = tmpdir();
  const binPath = path.join(root, binName);
  let invocation: {
    command: string;
    commandArgs: string[];
    source: 'path';
  };

  mkdirSync(cwd, { recursive: true });

  if (process.platform === 'win32') {
    writeExecutable(binPath, {
      win32: '@echo off\r\n:loop\r\ngoto loop\r\n',
      posix: '#!/bin/sh\nnode -e "setTimeout(() => {}, 5000)"\n',
    });
    invocation = {
      command: await expectedRealPath(binPath),
      commandArgs: [],
      source: 'path',
    };
  } else {
    const cliPath = path.join(root, 'vercel.js');

    writeFileSync(cliPath, 'setTimeout(() => {}, 5000);\n');
    chmodSync(cliPath, 0o755);
    symlinkSync(cliPath, binPath);
    invocation = {
      command: process.execPath,
      commandArgs: [await expectedRealPath(binPath)],
      source: 'path',
    };
  }

  await expect(
    execVercelCli([], { cwd, env: { PATH: root }, timeout: 100 })
  ).rejects.toEqual(
    expect.objectContaining<VercelCliError>({
      code: 'VERCEL_CLI_TIMED_OUT',
      invocation,
    })
  );
});

test('adds node to PATH when executing a local bin with a sanitized env', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const { cliPath } = writeLocalVercelPackage(
    root,
    "process.stdout.write('ok')\n"
  );

  mkdirSync(cwd, { recursive: true });

  await expect(
    execVercelCli([], { cwd, env: { PATH: '' } })
  ).resolves.toMatchObject({
    stdout: 'ok',
    invocation: {
      command: process.execPath,
      commandArgs: [await expectedRealPath(cliPath)],
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

    expect(await findVercelCli({ cwd, path: '' })).toBeNull();

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

test('resolves relative PATH entries from the provided cwd', async () => {
  const cwd = createDirectory();
  const relativeBinDir = path.join(cwd, 'tools');
  const binName = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const binPath = path.join(relativeBinDir, binName);

  writeExecutable(binPath, {
    win32: '@echo off\r\n',
    posix: '#!/bin/sh\n',
  });

  expect(await findVercelCli({ cwd, path: path.join('.', 'tools') })).toEqual({
    command: await expectedRealPath(binPath),
    commandArgs: [],
    source: 'path',
  });
});

posixOnlyTest('finds a local bin from a symlinked cwd', async () => {
  const root = createDirectory();
  const linkRoot = createDirectory();
  const realCwd = path.join(root, 'apps', 'web');
  const symlinkedCwd = path.join(linkRoot, 'apps', 'web');
  const { cliPath } = writeLocalVercelPackage(
    root,
    "process.stdout.write('ok')\n"
  );

  mkdirSync(realCwd, { recursive: true });
  mkdirSync(path.dirname(symlinkedCwd), { recursive: true });
  symlinkSync(realCwd, symlinkedCwd, 'dir');

  expect(await findVercelCli({ cwd: symlinkedCwd, path: '' })).toEqual({
    command: process.execPath,
    commandArgs: [await expectedRealPath(cliPath)],
    source: 'local-bin',
  });

  await expect(
    execVercelCli([], { cwd: symlinkedCwd, env: { PATH: '' } })
  ).resolves.toMatchObject({
    stdout: 'ok',
    invocation: {
      command: process.execPath,
      commandArgs: [await expectedRealPath(cliPath)],
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
    const { cliPath } = writeLocalVercelPackage(
      root,
      "process.stdout.write('real')\n"
    );
    const symlinkBinPath = path.join(
      linkRoot,
      'node_modules',
      '.bin',
      'vercel'
    );

    mkdirSync(realCwd, { recursive: true });
    mkdirSync(path.dirname(symlinkedCwd), { recursive: true });
    writeExecutable(symlinkBinPath, {
      win32: '@echo off\r\nnode -e "process.stdout.write(\'fake\')"\r\n',
      posix: '#!/bin/sh\nnode -e "process.stdout.write(\'fake\')"\n',
    });
    symlinkSync(realCwd, symlinkedCwd, 'dir');

    expect(await findVercelCli({ cwd: symlinkedCwd, path: '' })).toEqual({
      command: process.execPath,
      commandArgs: [await expectedRealPath(cliPath)],
      source: 'local-bin',
    });

    await expect(
      execVercelCli([], { cwd: symlinkedCwd, env: { PATH: '' } })
    ).resolves.toMatchObject({
      stdout: 'real',
      invocation: {
        command: process.execPath,
        commandArgs: [await expectedRealPath(cliPath)],
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
    writeProjectRoot(root);
    writeFileSync(
      path.join(root, 'node_modules', 'vercel', 'package.json'),
      JSON.stringify({ name: 'vercel', bin: { vercel: './dist/index.js' } })
    );
    writeFileSync(
      cliPath,
      'process.stdout.write(JSON.stringify({args:process.argv.slice(2)}));\n'
    );
    chmodSync(cliPath, 0o755);
    symlinkSync(cliPath, binPath);

    expect(await findVercelCli({ cwd })).toEqual({
      command: process.execPath,
      commandArgs: [await expectedRealPath(binPath)],
      source: 'local-bin',
    });

    await expect(
      execVercelCli(['project', 'token', 'my-project'], { cwd })
    ).resolves.toMatchObject({
      stdout: JSON.stringify({ args: ['project', 'token', 'my-project'] }),
      invocation: {
        command: process.execPath,
        commandArgs: [await expectedRealPath(binPath)],
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

test('returns null from lookup when cwd cannot be inspected', async () => {
  const cwd = path.join(createDirectory(), 'missing');

  await expect(findVercelCli({ cwd, path: '' })).resolves.toBeNull();
  await expect(findVercelCli({ cwd, path: '' })).resolves.toBeNull();
});

test('throws an exit-code error when the CLI exits non-zero', async () => {
  const root = createDirectory();
  const cwd = path.join(root, 'apps', 'web');
  const { cliPath } = writeLocalVercelPackage(root, 'process.exit(7);\n');

  mkdirSync(cwd, { recursive: true });

  await expect(execVercelCli(['project', 'token'], { cwd })).rejects.toEqual(
    expect.objectContaining<VercelCliError>({
      code: 'VERCEL_CLI_ERRORED',
      exitCode: 7,
      invocation: {
        command: process.execPath,
        commandArgs: [await expectedRealPath(cliPath)],
        source: 'local-bin',
      },
    })
  );
});
