import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, expect, test } from 'vitest';
import {
  LocalFileSystemDetector,
  resolveWorkspacePackageTargets,
} from '../src';

const roots: string[] = [];

async function createPackage(root: string, path: string, name: string) {
  const directory = join(root, path);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name }));
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(root => rm(root, { recursive: true, force: true }))
  );
});

test('resolves package.json workspace targets without expanding every workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workspace-resolver-'));
  roots.push(root);
  await Promise.all([
    writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'root', workspaces: ['./services/*'] })
    ),
    createPackage(root, 'services/alpha', '@fixture/alpha'),
    createPackage(root, 'services/beta', '@fixture/beta'),
  ]);

  await expect(
    resolveWorkspacePackageTargets({
      fs: new LocalFileSystemDetector(root),
      targetPaths: ['services/alpha/api', 'services/beta'],
      type: 'npm',
    })
  ).resolves.toEqual([
    {
      isRoot: true,
      name: 'root',
      packageJsonPath: 'package.json',
      relativePath: '.',
    },
    {
      name: '@fixture/alpha',
      packageJsonPath: 'services/alpha/package.json',
      relativePath: 'services/alpha',
    },
    {
      name: '@fixture/beta',
      packageJsonPath: 'services/beta/package.json',
      relativePath: 'services/beta',
    },
  ]);
});

test('rejects targets outside the workspace root', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workspace-resolver-'));
  roots.push(root);
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'root', workspaces: ['../*'] })
  );

  await expect(
    resolveWorkspacePackageTargets({
      fs: new LocalFileSystemDetector(root),
      targetPaths: ['../outside'],
      type: 'npm',
    })
  ).resolves.toBeNull();
});

test('honors pnpm negative workspace patterns', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workspace-resolver-'));
  roots.push(root);
  await Promise.all([
    writeFile(join(root, 'package.json'), JSON.stringify({ name: 'root' })),
    writeFile(
      join(root, 'pnpm-workspace.yaml'),
      "packages:\n  - 'services/*'\n  - '!services/excluded'\n"
    ),
    createPackage(root, 'services/excluded', '@fixture/excluded'),
  ]);

  await expect(
    resolveWorkspacePackageTargets({
      fs: new LocalFileSystemDetector(root),
      targetPaths: ['services/excluded'],
      type: 'pnpm',
    })
  ).resolves.toBeNull();
});
