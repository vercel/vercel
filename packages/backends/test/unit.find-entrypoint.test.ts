import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { findEntrypoint, findEntrypointOrThrow } from '../src/find-entrypoint';

describe('findEntrypoint', () => {
  it('resolves package.json main when the file exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'be-main-'));
    try {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({
          name: 'x',
          main: './server/api.js',
        }),
        'utf-8'
      );
      await mkdir(join(dir, 'server'), { recursive: true });
      await writeFile(join(dir, 'server', 'api.js'), '// api', 'utf-8');
      await expect(findEntrypoint(dir)).resolves.toBe('server/api.js');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('falls through when main points to a missing file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'be-main-miss-'));
    try {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({
          name: 'x',
          main: './nope.js',
          dependencies: { hono: '^4' },
        }),
        'utf-8'
      );
      await writeFile(
        join(dir, 'index.ts'),
        `import { Hono } from 'hono'\n`,
        'utf-8'
      );
      await expect(findEntrypoint(dir)).resolves.toBe('index.ts');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects main paths outside cwd', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'be-main-out-'));
    try {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({
          name: 'x',
          main: '../../../etc/passwd',
        }),
        'utf-8'
      );
      await expect(findEntrypoint(dir)).resolves.toBeUndefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('findEntrypointOrThrow', () => {
  it('throws a message that mentions package.json main', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'be-throw-'));
    try {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'x' }),
        'utf-8'
      );
      await expect(findEntrypointOrThrow(dir)).rejects.toThrow(
        /package\.json "main"/
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
