import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { EntrypointDetectorFilesystem } from '@vercel/build-utils';
import {
  detectEntrypoint,
  findEntrypoint,
  findEntrypointOrThrow,
} from '../src/find-entrypoint';

/**
 * Minimal in-memory EntrypointDetectorFilesystem for testing.
 */
function createTestFs(
  files: Record<string, string>
): EntrypointDetectorFilesystem {
  const paths = new Set(Object.keys(files));
  for (const p of Object.keys(files)) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) {
      paths.add(parts.slice(0, i).join('/'));
    }
  }
  return {
    hasPath: async (p: string) => paths.has(p),
    isFile: async (p: string) => p in files,
    readFile: async (p: string) => {
      if (!(p in files))
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return Buffer.from(files[p]);
    },
    readdir: async (dirPath: string) => {
      const prefix = dirPath === '.' ? '' : `${dirPath}/`;
      const entries = new Map<string, 'file' | 'dir'>();
      for (const p of Object.keys(files)) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        if (!rest) continue;
        const segment = rest.split('/')[0];
        if (rest.includes('/')) {
          entries.set(segment, 'dir');
        } else {
          entries.set(segment, 'file');
        }
      }
      return [...entries].map(([name, type]) => ({
        name,
        path: prefix + name,
        type,
      }));
    },
  };
}

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

describe('detectEntrypoint (normalized)', () => {
  it('emits a file-kind result wrapping the discovered entrypoint', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'be-detect-'));
    try {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'x', dependencies: { hono: '^4' } }),
        'utf-8'
      );
      await writeFile(
        join(dir, 'index.ts'),
        `import { Hono } from 'hono'\n`,
        'utf-8'
      );
      await expect(detectEntrypoint({ workPath: dir })).resolves.toEqual({
        kind: 'file',
        entrypoint: 'index.ts',
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns null when no entrypoint is discoverable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'be-detect-empty-'));
    try {
      await expect(detectEntrypoint({ workPath: dir })).resolves.toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('detectEntrypoint with virtual filesystem', () => {
  it('detects express entrypoint from package.json + index.ts via virtual fs', async () => {
    const vfs = createTestFs({
      'package.json': JSON.stringify({
        name: 'test',
        dependencies: { express: '^4' },
      }),
      'index.ts': "import express from 'express'\n",
    });
    const result = await detectEntrypoint({ workPath: '.', fs: vfs });
    expect(result).toEqual({ kind: 'file', entrypoint: 'index.ts' });
  });

  it('detects package.json main field via virtual fs', async () => {
    const vfs = createTestFs({
      'package.json': JSON.stringify({
        name: 'test',
        main: 'server.js',
        dependencies: { hono: '^4' },
      }),
      'server.js': "import { Hono } from 'hono'\n",
    });
    const result = await detectEntrypoint({ workPath: '.', fs: vfs });
    expect(result).toEqual({ kind: 'file', entrypoint: 'server.js' });
  });

  it('detects src/index.ts without framework via virtual fs', async () => {
    const vfs = createTestFs({
      'src/index.ts': 'export default {}\n',
    });
    const result = await detectEntrypoint({ workPath: '.', fs: vfs });
    expect(result).toEqual({ kind: 'file', entrypoint: 'src/index.ts' });
  });

  it('returns null when no candidate exists via virtual fs', async () => {
    const vfs = createTestFs({ 'README.md': '# Hello' });
    const result = await detectEntrypoint({ workPath: '.', fs: vfs });
    expect(result).toBeNull();
  });
});
