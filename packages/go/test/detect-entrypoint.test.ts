import fs from 'fs-extra';
import { tmpdir } from 'os';
import path from 'path';
import type { EntrypointDetectorFilesystem } from '@vercel/build-utils';
import { detectEntrypoint } from '../src/entrypoint';

async function makeTmp(name: string): Promise<string> {
  const dir = path.join(tmpdir(), `vc-go-detect-${name}-${Date.now()}`);
  await fs.mkdirp(dir);
  return dir;
}

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

describe('detectEntrypoint (normalized)', () => {
  it('emits a file-kind result for main.go at the workPath root', async () => {
    const dir = await makeTmp('main');
    try {
      await fs.writeFile(path.join(dir, 'main.go'), 'package main\n');
      await expect(detectEntrypoint({ workPath: dir })).resolves.toEqual({
        kind: 'file',
        entrypoint: 'main.go',
      });
    } finally {
      await fs.remove(dir);
    }
  });

  it('discovers nested cmd/api/main.go', async () => {
    const dir = await makeTmp('nested');
    try {
      await fs.mkdirp(path.join(dir, 'cmd', 'api'));
      await fs.writeFile(
        path.join(dir, 'cmd', 'api', 'main.go'),
        'package main\n'
      );
      await expect(detectEntrypoint({ workPath: dir })).resolves.toEqual({
        kind: 'file',
        entrypoint: 'cmd/api/main.go',
      });
    } finally {
      await fs.remove(dir);
    }
  });

  it('returns null when no candidate file is present', async () => {
    const dir = await makeTmp('empty');
    try {
      await expect(detectEntrypoint({ workPath: dir })).resolves.toBeNull();
    } finally {
      await fs.remove(dir);
    }
  });
});

describe('detectEntrypoint with virtual filesystem', () => {
  it('detects main.go via virtual fs', async () => {
    const vfs = createTestFs({ 'main.go': 'package main\n' });
    const result = await detectEntrypoint({ workPath: '.', fs: vfs });
    expect(result).toEqual({ kind: 'file', entrypoint: 'main.go' });
  });

  it('detects cmd/api/main.go via virtual fs', async () => {
    const vfs = createTestFs({ 'cmd/api/main.go': 'package main\n' });
    const result = await detectEntrypoint({ workPath: '.', fs: vfs });
    expect(result).toEqual({ kind: 'file', entrypoint: 'cmd/api/main.go' });
  });

  it('returns null when no candidate exists via virtual fs', async () => {
    const vfs = createTestFs({ 'README.md': '# Hello' });
    const result = await detectEntrypoint({ workPath: '.', fs: vfs });
    expect(result).toBeNull();
  });
});
