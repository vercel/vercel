import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { Meta } from '../src';
import {
  resetCustomInstallCommandSet,
  runCustomInstallCommand,
  runNpmInstall,
  type WorkspaceInstallTarget,
} from '../src/fs/run-user-scripts';

const roots: string[] = [];
const isolatedEnvKeys = [
  'NPM_ONLY_PRODUCTION',
  'VERCEL_EXPERIMENTAL_WORKSPACE_SCOPED_INSTALLS',
  'VERCEL_INSTALL_COMPLETED',
  'VERCEL_INSTALL_COMPLETED_PATH',
] as const;
const originalEnv = Object.fromEntries(
  isolatedEnvKeys.map(key => [key, process.env[key]])
);

async function exists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resetInstallState(root: string): Promise<void> {
  await Promise.all([
    rm(path.join(root, 'node_modules'), { recursive: true, force: true }),
    rm(path.join(root, 'apps/project/node_modules'), {
      recursive: true,
      force: true,
    }),
    rm(path.join(root, 'packages/unrelated/node_modules'), {
      recursive: true,
      force: true,
    }),
    rm(path.join(root, 'unrelated-installed.txt'), { force: true }),
    rm(path.join(root, 'yarn-commands.jsonl'), { force: true }),
  ]);
  resetCustomInstallCommandSet();
}

async function createFixture(): Promise<{
  apiPath: string;
  env: NodeJS.ProcessEnv;
  installCommand: string;
  root: string;
  targets: WorkspaceInstallTarget[];
}> {
  const root = await realpath(
    await mkdtemp(path.join(tmpdir(), 'workspace-install-flow-'))
  );
  roots.push(root);
  const project = path.join(root, 'apps/project');
  const unrelated = path.join(root, 'packages/unrelated');
  const bin = path.join(root, 'bin');
  await Promise.all([
    mkdir(path.join(project, 'api'), { recursive: true }),
    mkdir(unrelated, { recursive: true }),
    mkdir(bin, { recursive: true }),
  ]);

  await Promise.all([
    writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'workspace-focus-repro-root',
        packageManager: 'yarn@4.9.2',
        private: true,
        workspaces: ['apps/*', 'packages/*'],
      })
    ),
    writeFile(path.join(root, 'yarn.lock'), '__metadata:\n  version: 8\n'),
    writeFile(
      path.join(project, 'package.json'),
      JSON.stringify({
        name: '@repro/project',
        private: true,
        scripts: {
          'install:focused': 'yarn workspaces focus @repro/project',
        },
      })
    ),
    writeFile(
      path.join(project, 'vercel.json'),
      JSON.stringify({
        installCommand: 'yarn install:focused',
        buildCommand: 'yarn build',
        outputDirectory: 'dist',
      })
    ),
    writeFile(path.join(project, 'api/index.js'), 'module.exports = {}'),
    writeFile(
      path.join(unrelated, 'package.json'),
      JSON.stringify({ name: '@repro/unrelated', private: true })
    ),
  ]);

  const fakeYarnPath = path.join(bin, 'yarn');
  await writeFile(
    fakeYarnPath,
    `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = process.env.REPRO_ROOT;
const args = process.argv.slice(2);
fs.appendFileSync(
  path.join(root, 'yarn-commands.jsonl'),
  JSON.stringify({ args, cwd: process.cwd() }) + '\\n'
);
const touch = file => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{}');
};
const installProject = () => touch(path.join(root, 'apps/project/node_modules/is-number/package.json'));
const installRoot = () => touch(path.join(root, 'node_modules/picocolors/package.json'));
const installUnrelated = () => {
  touch(path.join(root, 'node_modules/@repro/unrelated/package.json'));
  touch(path.join(root, 'packages/unrelated/node_modules/lodash/package.json'));
  fs.writeFileSync(path.join(root, 'unrelated-installed.txt'), 'installed');
};
if (args[0] === 'config') {
  process.exitCode = 0;
} else if (args[0] === 'install:focused') {
  installProject();
} else if (args[0] === 'install') {
  installProject();
  installRoot();
  installUnrelated();
} else if (args[0] === 'workspaces' && args[1] === 'focus') {
  if (args.includes('@repro/project')) installProject();
  if (args.includes('workspace-focus-repro-root')) installRoot();
} else {
  process.exitCode = 1;
}
`
  );
  await chmod(fakeYarnPath, 0o755);

  const vercelConfig = JSON.parse(
    await readFile(path.join(project, 'vercel.json'), 'utf8')
  );
  return {
    apiPath: path.join(project, 'api'),
    env: {
      ...process.env,
      ENABLE_EXPERIMENTAL_COREPACK: '1',
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
      REPRO_ROOT: root,
    },
    installCommand: vercelConfig.installCommand,
    root,
    targets: [
      {
        installRoot: root,
        isRoot: true,
        name: 'workspace-focus-repro-root',
        packageJsonPath: path.join(root, 'package.json'),
        relativePath: '.',
      },
      {
        installRoot: root,
        name: '@repro/project',
        packageJsonPath: path.join(project, 'package.json'),
        relativePath: 'apps/project',
      },
    ],
  };
}

beforeEach(() => {
  for (const key of isolatedEnvKeys) delete process.env[key];
});

afterEach(async () => {
  for (const key of isolatedEnvKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetCustomInstallCommandSet();
  await Promise.all(
    roots.splice(0).map(root => rm(root, { recursive: true, force: true }))
  );
});

test.skipIf(process.platform === 'win32')(
  'keeps unrelated Yarn workspaces out of the flagged Node install',
  async () => {
    const fixture = await createFixture();

    await resetInstallState(fixture.root);
    expect(await exists(path.join(fixture.root, 'node_modules'))).toBe(false);
    await runCustomInstallCommand({
      destPath: path.join(fixture.root, 'apps/project'),
      installCommand: fixture.installCommand,
      spawnOpts: { env: fixture.env },
    });
    expect(
      await exists(
        path.join(
          fixture.root,
          'apps/project/node_modules/is-number/package.json'
        )
      )
    ).toBe(true);
    expect(
      await exists(path.join(fixture.root, 'unrelated-installed.txt'))
    ).toBe(false);

    await runNpmInstall(fixture.apiPath, [], { env: fixture.env }, {} as Meta);
    expect(
      await exists(path.join(fixture.root, 'unrelated-installed.txt'))
    ).toBe(true);
    expect(
      (await readFile(path.join(fixture.root, 'yarn-commands.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line))
    ).toEqual([
      {
        args: ['install:focused'],
        cwd: path.join(fixture.root, 'apps/project'),
      },
      {
        args: ['config', 'set', 'enableGlobalCache', 'false'],
        cwd: fixture.apiPath,
      },
      { args: ['install'], cwd: fixture.apiPath },
    ]);

    await resetInstallState(fixture.root);
    process.env.VERCEL_EXPERIMENTAL_WORKSPACE_SCOPED_INSTALLS = '1';
    await runCustomInstallCommand({
      destPath: path.join(fixture.root, 'apps/project'),
      installCommand: fixture.installCommand,
      spawnOpts: { env: fixture.env },
    });
    await runNpmInstall(
      fixture.apiPath,
      [],
      { env: fixture.env },
      {} as Meta,
      undefined,
      undefined,
      { targets: fixture.targets }
    );

    expect(
      await exists(
        path.join(fixture.root, 'node_modules/picocolors/package.json')
      )
    ).toBe(true);
    expect(
      await exists(path.join(fixture.root, 'unrelated-installed.txt'))
    ).toBe(false);
    expect(
      await exists(
        path.join(
          fixture.root,
          'packages/unrelated/node_modules/lodash/package.json'
        )
      )
    ).toBe(false);
    expect(
      (await readFile(path.join(fixture.root, 'yarn-commands.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line))
    ).toEqual([
      {
        args: ['install:focused'],
        cwd: path.join(fixture.root, 'apps/project'),
      },
      {
        args: ['config', 'set', 'enableGlobalCache', 'false'],
        cwd: fixture.apiPath,
      },
      {
        args: [
          'workspaces',
          'focus',
          'workspace-focus-repro-root',
          '@repro/project',
        ],
        cwd: fixture.root,
      },
    ]);
  }
);
