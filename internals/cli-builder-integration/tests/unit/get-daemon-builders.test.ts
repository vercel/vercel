import { mkdir, mkdtemp, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { DaemonConfig } from '@vercel/build-utils';
import {
  getDaemonBuilders,
  isContainerPresetFromDaemons,
  validateDaemonImageRepositories,
} from '../../src/get-daemon-builders';

let root: string;
let outside: string;
const scheduler: DaemonConfig = {
  root: 'backend',
  entrypoint: 'Dockerfile.vercel',
  command: ['python', '-m', 'scheduler'],
  instances: { sfo1: 1 },
};
const options = {
  daemons: { scheduler },
  files: ['backend/Dockerfile.vercel'],
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'daemon-build-'));
  outside = await mkdtemp(join(tmpdir(), 'daemon-build-outside-'));
  await writeFile(join(outside, 'Dockerfile'), 'FROM python:3.12-slim');
  await mkdir(join(root, 'backend'));
  await writeFile(
    join(root, 'backend/Dockerfile.vercel'),
    'FROM python:3.12-slim'
  );
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

it('creates a container build for each daemon', async () => {
  expect(await getDaemonBuilders({ workPath: root, ...options })).toEqual([
    {
      src: 'backend/Dockerfile.vercel',
      use: '@vercel/container',
      config: { daemon: { name: 'scheduler', ...scheduler } },
    },
  ]);
  expect(
    await getDaemonBuilders({ workPath: root, ...options, daemons: undefined })
  ).toEqual([]);
});

it('rejects daemons that share an image repository', () => {
  expect(() =>
    validateDaemonImageRepositories({ 'a--b': scheduler, 'a-b': scheduler })
  ).toThrow(
    expect.objectContaining({
      code: 'INVALID_DAEMONS',
      message:
        'Can\'t build daemon "a-b": daemon "a--b" uses the same image repository "daemon.a-b". Rename one of them.',
    })
  );
});

it('allows distinct image repositories', () => {
  expect(() =>
    validateDaemonImageRepositories({ worker: scheduler, a_b: scheduler })
  ).not.toThrow();
  expect(() => validateDaemonImageRepositories(undefined)).not.toThrow();
});

it('rejects Dockerfiles excluded from the project source', async () => {
  await expect(
    getDaemonBuilders({ workPath: root, ...options, files: [] })
  ).rejects.toMatchObject({ code: 'INVALID_DAEMON_ROOT' });
});

it('rejects Dockerfiles missing from disk', async () => {
  await expect(
    getDaemonBuilders({
      workPath: root,
      ...options,
      daemons: { scheduler: { ...scheduler, root: 'missing' } },
      files: ['missing/Dockerfile.vercel'],
    })
  ).rejects.toMatchObject({ code: 'INVALID_DAEMON_ROOT' });
});

it('rejects Dockerfiles that escape the project through symlinks', async () => {
  await symlink(outside, join(root, 'outside'));
  await expect(
    getDaemonBuilders({
      workPath: root,
      ...options,
      daemons: {
        daemon: { ...scheduler, root: 'outside', entrypoint: 'Dockerfile' },
      },
      files: ['outside/Dockerfile'],
    })
  ).rejects.toMatchObject({ code: 'INVALID_DAEMON_ROOT' });
});

it('builds Dockerfiles above the project inside the repository', async () => {
  const workPath = join(root, 'apps/web');
  await mkdir(workPath, { recursive: true });
  const daemon = { ...scheduler, root: '../../backend' };
  expect(
    await getDaemonBuilders({
      workPath,
      repoRootPath: root,
      daemons: { scheduler: daemon },
      files: [],
    })
  ).toEqual([
    {
      src: '../../backend/Dockerfile.vercel',
      use: '@vercel/container',
      config: { daemon: { name: 'scheduler', ...daemon } },
    },
  ]);
});

it('rejects Dockerfiles above the repository', async () => {
  await expect(
    getDaemonBuilders({
      workPath: root,
      daemons: {
        daemon: {
          ...scheduler,
          root: join('..', basename(outside)),
          entrypoint: 'Dockerfile',
        },
      },
      files: [],
    })
  ).rejects.toMatchObject({ code: 'INVALID_DAEMON_ROOT' });
  await symlink(outside, join(root, 'outside'));
  await mkdir(join(root, 'app'));
  await expect(
    getDaemonBuilders({
      workPath: join(root, 'app'),
      repoRootPath: root,
      daemons: {
        daemon: { ...scheduler, root: '../outside', entrypoint: 'Dockerfile' },
      },
      files: [],
    })
  ).rejects.toMatchObject({ code: 'INVALID_DAEMON_ROOT' });
});

it.each([
  ['no container files', [], [], false],
  [
    'a daemon Dockerfile.vercel',
    ['Dockerfile.vercel'],
    ['Dockerfile.vercel'],
    true,
  ],
  ['a daemon Containerfile', ['Containerfile'], ['Containerfile'], true],
  ['an app Dockerfile', ['Dockerfile'], [], false],
  [
    'an app Dockerfile next to a daemon Containerfile',
    ['Dockerfile', 'Containerfile'],
    ['Containerfile'],
    false,
  ],
  [
    'a daemon marker built over an app Dockerfile',
    ['Dockerfile.vercel', 'Dockerfile'],
    ['Dockerfile.vercel'],
    true,
  ],
])('detects the Container preset from daemons with %s', async (_case, present, daemonFiles, expected) => {
  for (const name of present) {
    await writeFile(join(root, name), 'FROM scratch');
  }
  const daemons = Object.fromEntries(
    daemonFiles.map((entrypoint, i) => [
      `daemon-${'abcdefgh'[i]}`,
      { ...scheduler, root: '.', entrypoint },
    ])
  );
  expect(isContainerPresetFromDaemons(root, daemons)).toBe(expected);
});
