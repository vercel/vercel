import { describe, expect, it, vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, readdir, mkdirp, stat, remove, readFile } from 'fs-extra';
import { isErrnoException } from '@vercel/error-utils';

const renameControl: { failNextWith?: string } = {};
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      if (renameControl.failNextWith) {
        const code = renameControl.failNextWith;
        renameControl.failNextWith = undefined;
        const err = new Error(`${code}: mocked rename failure`);
        (err as NodeJS.ErrnoException).code = code;
        throw err;
      }
      return actual.rename(from, to);
    },
  };
});

import { merge } from '../../src/merge';

describe('merge()', () => {
  it('should move source to non-existent destination', async () => {
    const source = join(tmpdir(), 'src');
    const dest = join(tmpdir(), 'dest');
    try {
      await mkdirp(source);
      await writeFile(join(source, 'a.txt'), 'a');
      await merge(source, dest);
      const destContents = await readdir(dest);
      expect(destContents.sort()).toEqual(['a.txt']);
      const sourceStat: Error = await stat(source).then(
        () => {},
        err => err
      );
      expect(isErrnoException(sourceStat) && sourceStat.code).toEqual('ENOENT');
    } finally {
      await Promise.all([source, dest].map(p => remove(p)));
    }
  });

  it('should merge source into existing destination', async () => {
    const source = join(tmpdir(), 'src');
    const dest = join(tmpdir(), 'dest');
    try {
      await mkdirp(source);
      await mkdirp(dest);
      await writeFile(join(source, 'a.txt'), 'a');
      await writeFile(join(source, 'c.txt'), 'c');
      await writeFile(join(dest, 'b.txt'), 'b');
      await writeFile(join(dest, 'c.txt'), 'original');
      await merge(source, dest);
      const destContents = await readdir(dest);
      expect(destContents.sort()).toEqual(['a.txt', 'b.txt', 'c.txt']);
      const sourceStat: Error = await stat(source).then(
        () => {},
        err => err
      );
      expect(isErrnoException(sourceStat) && sourceStat.code).toEqual('ENOENT');
      expect(await readFile(join(dest, 'c.txt'), 'utf8')).toEqual('c');
    } finally {
      await Promise.all([source, dest].map(p => remove(p)));
    }
  });

  it('should overwrite dest directory when source is a file', async () => {
    const source = join(tmpdir(), 'src');
    const dest = join(tmpdir(), 'dest');
    try {
      await mkdirp(source);
      await mkdirp(join(dest, 'a'));
      await writeFile(join(source, 'a'), 'a');
      await merge(source, dest);
      const destContents = await readdir(dest);
      expect(destContents.sort()).toEqual(['a']);
      const sourceStat: Error = await stat(source).then(
        () => {},
        err => err
      );
      expect(isErrnoException(sourceStat) && sourceStat.code).toEqual('ENOENT');
      expect(await readFile(join(dest, 'a'), 'utf8')).toEqual('a');
    } finally {
      await Promise.all([source, dest].map(p => remove(p)));
    }
  });

  it('leaves no tmp intermediates next to overwritten entries', async () => {
    const source = join(tmpdir(), 'src-tmpcheck');
    const dest = join(tmpdir(), 'dest-tmpcheck');
    try {
      await mkdirp(source);
      await mkdirp(dest);
      await writeFile(join(source, 'config.json'), '{"v":2}');
      await writeFile(join(dest, 'config.json'), '{"v":1}');
      await merge(source, dest);
      expect((await readdir(dest)).sort()).toEqual(['config.json']);
      expect(await readFile(join(dest, 'config.json'), 'utf8')).toEqual(
        '{"v":2}'
      );
    } finally {
      await Promise.all([source, dest].map(p => remove(p)));
    }
  });

  it('publishes through a private tmp sibling on cross-device moves', async () => {
    const source = join(tmpdir(), 'exdev-src');
    const parent = join(tmpdir(), 'exdev-parent');
    const dest = join(parent, 'dest');
    try {
      await mkdirp(source);
      await mkdirp(parent);
      await writeFile(join(source, 'a.txt'), 'a');
      renameControl.failNextWith = 'EXDEV';
      await merge(source, dest);
      expect((await readdir(dest)).sort()).toEqual(['a.txt']);
      expect(await readFile(join(dest, 'a.txt'), 'utf8')).toEqual('a');
      expect((await readdir(parent)).sort()).toEqual(['dest']);
    } finally {
      renameControl.failNextWith = undefined;
      await Promise.all([source, parent].map(p => remove(p)));
    }
  });

  it('merges two concurrent writers into an existing destination without losing either side', async () => {
    const sourceA = join(tmpdir(), 'exist-src-a');
    const sourceB = join(tmpdir(), 'exist-src-b');
    const dest = join(tmpdir(), 'exist-dest');
    try {
      await mkdirp(join(sourceA, 'functions'));
      await mkdirp(join(sourceB, 'functions'));
      await writeFile(join(sourceA, 'functions', 'a.func'), 'a');
      await writeFile(join(sourceB, 'functions', 'b.func'), 'b');
      await mkdirp(join(dest, 'functions'));
      await writeFile(join(dest, 'functions', 'pre.func'), 'pre');
      await Promise.all([merge(sourceA, dest), merge(sourceB, dest)]);
      expect((await readdir(join(dest, 'functions'))).sort()).toEqual([
        'a.func',
        'b.func',
        'pre.func',
      ]);
    } finally {
      await Promise.all([sourceA, sourceB, dest].map(p => remove(p)));
    }
  });

  it('merges when two writers race the same fresh destination', async () => {
    const sourceA = join(tmpdir(), 'race-src-a');
    const sourceB = join(tmpdir(), 'race-src-b');
    const dest = join(tmpdir(), 'race-dest');
    try {
      await mkdirp(join(sourceA, 'functions'));
      await mkdirp(join(sourceB, 'functions'));
      await writeFile(join(sourceA, 'functions', 'a.func'), 'a');
      await writeFile(join(sourceB, 'functions', 'b.func'), 'b');
      await Promise.all([merge(sourceA, dest), merge(sourceB, dest)]);
      expect((await readdir(join(dest, 'functions'))).sort()).toEqual([
        'a.func',
        'b.func',
      ]);
    } finally {
      await Promise.all([sourceA, sourceB, dest].map(p => remove(p)));
    }
  });
});
