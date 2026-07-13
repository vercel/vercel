import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { resolveEntrypointAndFormat } from '../src/rolldown/resolve-format';

describe('resolveEntrypointAndFormat', () => {
  it('defaults to ESM for server.ts when no package.json exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'be-fmt-no-pkg-'));
    try {
      await writeFile(join(dir, 'server.ts'), '// server', 'utf-8');
      await expect(
        resolveEntrypointAndFormat({ entrypoint: 'server.ts', workPath: dir })
      ).resolves.toEqual({ format: 'esm', extension: 'mjs' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('defaults to ESM for server.js when no package.json exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'be-fmt-no-pkg-js-'));
    try {
      await writeFile(join(dir, 'server.js'), '// server', 'utf-8');
      await expect(
        resolveEntrypointAndFormat({ entrypoint: 'server.js', workPath: dir })
      ).resolves.toEqual({ format: 'esm', extension: 'mjs' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('honors the explicit defaultFormat when no package.json exists', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'be-fmt-default-'));
    try {
      await writeFile(join(dir, 'server.ts'), '// server', 'utf-8');
      await expect(
        resolveEntrypointAndFormat({
          entrypoint: 'server.ts',
          workPath: dir,
          defaultFormat: 'cjs',
        })
      ).resolves.toEqual({ format: 'cjs', extension: 'cjs' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('infers CJS from package.json without "type": "module"', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'be-fmt-cjs-'));
    try {
      await writeFile(join(dir, 'server.ts'), '// server', 'utf-8');
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'x' }),
        'utf-8'
      );
      await expect(
        resolveEntrypointAndFormat({ entrypoint: 'server.ts', workPath: dir })
      ).resolves.toEqual({ format: 'cjs', extension: 'cjs' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('infers ESM from package.json with "type": "module"', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'be-fmt-esm-'));
    try {
      await writeFile(join(dir, 'server.ts'), '// server', 'utf-8');
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'x', type: 'module' }),
        'utf-8'
      );
      await expect(
        resolveEntrypointAndFormat({ entrypoint: 'server.ts', workPath: dir })
      ).resolves.toEqual({ format: 'esm', extension: 'mjs' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
