import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  detectEntrypoint,
  findEntrypoint,
  findEntrypointOrThrow,
} from '../src/find-entrypoint';

const makeDir = () => mkdtemp(join(tmpdir(), 'be-entry-'));

describe('findEntrypoint', () => {
  it('resolves package.json main when no well-known file exists (no framework)', async () => {
    const dir = await makeDir();
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

  it('prefers a framework-importing well-known file over package.json main', async () => {
    // Matches the wrapper builders: root glob wins, `main` is a fallback.
    const dir = await makeDir();
    try {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({
          name: 'x',
          main: './other.js',
          dependencies: { express: '^4' },
        }),
        'utf-8'
      );
      await writeFile(join(dir, 'other.js'), `require('express')`, 'utf-8');
      await writeFile(
        join(dir, 'server.js'),
        `const express = require('express')`,
        'utf-8'
      );
      await expect(findEntrypoint(dir)).resolves.toBe('server.js');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('accepts package.json main without a framework import (historical backends behavior)', async () => {
    // More permissive than the wrapper builders, which gate `main` on the
    // framework regex — kept so existing @vercel/backends users don't break.
    const dir = await makeDir();
    try {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({
          name: 'x',
          main: './cli.js',
          dependencies: { express: '^4' },
        }),
        'utf-8'
      );
      await writeFile(
        join(dir, 'cli.js'),
        `console.log('not a server')`,
        'utf-8'
      );
      await expect(findEntrypoint(dir)).resolves.toBe('cli.js');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('still finds main/src/main for non-nest frameworks (historical backends behavior)', async () => {
    const dir = await makeDir();
    try {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'x', dependencies: { hono: '^4' } }),
        'utf-8'
      );
      await writeFile(
        join(dir, 'main.ts'),
        `import { Hono } from 'hono'\n`,
        'utf-8'
      );
      await expect(findEntrypoint(dir)).resolves.toBe('main.ts');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('falls through when main points to a missing file', async () => {
    const dir = await makeDir();
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
    const dir = await makeDir();
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

  it('requires framework import for well-known files when a framework is present', async () => {
    const dir = await makeDir();
    try {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'x', dependencies: { fastify: '^4' } }),
        'utf-8'
      );
      await writeFile(join(dir, 'index.js'), `// no import here`, 'utf-8');
      await writeFile(
        join(dir, 'server.js'),
        `import fastify from 'fastify'`,
        'utf-8'
      );
      await expect(findEntrypoint(dir)).resolves.toBe('server.js');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('prefers src/main for nestjs projects', async () => {
    const dir = await makeDir();
    try {
      await writeFile(
        join(dir, 'package.json'),
        JSON.stringify({
          name: 'x',
          dependencies: { '@nestjs/core': '^10', express: '^4' },
        }),
        'utf-8'
      );
      await mkdir(join(dir, 'src'), { recursive: true });
      await writeFile(
        join(dir, 'src', 'main.ts'),
        `import { NestFactory } from '@nestjs/core'`,
        'utf-8'
      );
      await writeFile(
        join(dir, 'index.ts'),
        `import { NestFactory } from '@nestjs/core'`,
        'utf-8'
      );
      await expect(findEntrypoint(dir)).resolves.toBe('src/main.ts');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  describe('outputDirectory', () => {
    it('searches only the output directory when configured', async () => {
      const dir = await makeDir();
      try {
        await writeFile(
          join(dir, 'package.json'),
          JSON.stringify({ name: 'x', dependencies: { express: '^4' } }),
          'utf-8'
        );
        // Root entrypoint exists but must be ignored.
        await writeFile(join(dir, 'server.js'), `require('express')`, 'utf-8');
        await mkdir(join(dir, 'dist'), { recursive: true });
        await writeFile(
          join(dir, 'dist', 'index.js'),
          `require('express')`,
          'utf-8'
        );
        await expect(
          findEntrypoint(dir, { outputDirectory: 'dist' })
        ).resolves.toBe('dist/index.js');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('falls through to the source tree when the output directory has no entrypoint', async () => {
      // More permissive than the wrapper builders (which error out here) —
      // historical backends never let `outputDirectory` block detection.
      const dir = await makeDir();
      try {
        await writeFile(
          join(dir, 'package.json'),
          JSON.stringify({ name: 'x', dependencies: { express: '^4' } }),
          'utf-8'
        );
        await writeFile(join(dir, 'server.js'), `require('express')`, 'utf-8');
        await mkdir(join(dir, 'dist'), { recursive: true });
        await expect(
          findEntrypointOrThrow(dir, { outputDirectory: 'dist' })
        ).resolves.toBe('server.js');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe('error messages (wrapper-builder parity)', () => {
    it('reports candidates that do not import the framework', async () => {
      const dir = await makeDir();
      try {
        await writeFile(
          join(dir, 'package.json'),
          JSON.stringify({ name: 'x', dependencies: { express: '^4' } }),
          'utf-8'
        );
        await writeFile(join(dir, 'index.js'), `// nope`, 'utf-8');
        await expect(findEntrypointOrThrow(dir)).rejects.toThrow(
          'No entrypoint found which imports express. Found possible entrypoint: index.js'
        );
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });

    it('lists searched filenames when no candidates exist', async () => {
      const dir = await makeDir();
      try {
        await writeFile(
          join(dir, 'package.json'),
          JSON.stringify({ name: 'x', dependencies: { hono: '^4' } }),
          'utf-8'
        );
        await expect(findEntrypointOrThrow(dir)).rejects.toThrow(
          /No entrypoint found\. Searched for:\n- app\.\{js,cjs,mjs,ts,cts,mts\}/
        );
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  });
});

describe('findEntrypointOrThrow', () => {
  it('throws a message that mentions package.json main (no framework)', async () => {
    const dir = await makeDir();
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
    const dir = await makeDir();
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
    const dir = await makeDir();
    try {
      await expect(detectEntrypoint({ workPath: dir })).resolves.toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
