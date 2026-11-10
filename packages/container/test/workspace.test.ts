import { FileBlob, FileFsRef } from '@vercel/build-utils';
import type { Files } from '@vercel/build-utils';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stageWorkspace } from '../src/buildpacks/lifecycle/lifecycle';

const link = (data: string) => new FileBlob({ data, mode: 0o120777 });

describe('buildpack source snapshot', () => {
  let root: string;
  let workPath: string;
  let destination: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vercel-cnb-workspace-test-'));
    workPath = join(root, 'source');
    destination = join(root, 'snapshot');
    mkdirSync(workPath);
    mkdirSync(destination);
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('materializes only selected files, preserving source contents and executable modes', async () => {
    writeFileSync(join(workPath, 'Gemfile'), 'source gemfile');
    for (const name of ['.env.production.local', 'credentials.json']) {
      writeFileSync(join(workPath, name), 'must not ship');
    }
    for (const name of ['.git', '.vercel', 'node_modules', 'nested/.vercel']) {
      mkdirSync(join(workPath, name), { recursive: true });
      writeFileSync(join(workPath, name, 'private'), 'must not ship');
    }
    const files: Files = {
      Gemfile: new FileFsRef({ fsPath: join(workPath, 'Gemfile') }),
      'bin/rails': new FileBlob({
        data: '#!/usr/bin/env ruby\n',
        mode: 0o100755,
      }),
    };
    await stageWorkspace({ workPath, files }, destination);
    expect(readdirSync(destination).sort()).toEqual(['Gemfile', 'bin']);
    expect(readFileSync(join(destination, 'Gemfile'), 'utf8')).toBe(
      'source gemfile'
    );
    // Windows does not expose POSIX executable permission bits.
    if (process.platform !== 'win32') {
      expect(
        statSync(join(destination, 'bin/rails')).mode & 0o111
      ).toBeTruthy();
    }
    writeFileSync(join(destination, 'Gemfile'), 'build mutation');
    expect(readFileSync(join(workPath, 'Gemfile'), 'utf8')).toBe(
      'source gemfile'
    );
    expect(files.Gemfile.type).toBe('FileFsRef');
  });

  it('materializes file references even when the original work directory is empty', async () => {
    const filePath = join(root, 'download-source');
    writeFileSync(filePath, 'selected input');
    await stageWorkspace(
      {
        workPath,
        files: { Gemfile: new FileFsRef({ fsPath: filePath }) },
      },
      destination
    );
    expect(readFileSync(join(destination, 'Gemfile'), 'utf8')).toBe(
      'selected input'
    );
    expect(readdirSync(workPath)).toEqual([]);
  });

  it.each([
    'file',
    'directory',
  ])('rejects ignored files reached through a stat-followed %s symlink', async kind => {
    mkdirSync(join(workPath, '.vercel'));
    writeFileSync(join(workPath, '.vercel', 'secret'), 'must not ship');
    symlinkSync(
      kind === 'file' ? '.vercel/secret' : '.vercel',
      join(workPath, 'alias')
    );
    const name = kind === 'file' ? 'alias' : 'alias/secret';
    const file = new FileFsRef({
      fsPath: join(workPath, name),
      mode: statSync(join(workPath, name)).mode,
    });
    await expect(
      stageWorkspace({ workPath, files: { [name]: file } }, destination)
    ).rejects.toThrow(/excluded or outside-root/);
    expect(readdirSync(destination)).toEqual([]);
  });

  it('rejects stat-followed symlinks outside the service root', async () => {
    writeFileSync(join(root, 'secret'), 'must not ship');
    symlinkSync('../secret', join(workPath, 'alias'));
    await expect(
      stageWorkspace(
        {
          workPath,
          files: { alias: new FileFsRef({ fsPath: join(workPath, 'alias') }) },
        },
        destination
      )
    ).rejects.toThrow(/excluded or outside-root/);
  });

  it('accepts stat-followed links to included service files', async () => {
    writeFileSync(join(workPath, 'app.rb'), 'included');
    symlinkSync('app.rb', join(workPath, 'alias'));
    await stageWorkspace(
      {
        workPath,
        files: {
          'app.rb': new FileFsRef({ fsPath: join(workPath, 'app.rb') }),
          alias: new FileFsRef({ fsPath: join(workPath, 'alias') }),
        },
      },
      destination
    );
    expect(readFileSync(join(destination, 'alias'), 'utf8')).toBe('included');
  });

  it.each([
    '../escape',
    'dir/../../escape',
    '/escape',
    'C:\\escape',
    '..\\escape',
    '.',
    '',
  ])('rejects escaping or empty source path %j', async name => {
    await expect(
      stageWorkspace(
        {
          workPath,
          files: { [name]: new FileBlob({ data: 'must not write' }) },
        },
        destination
      )
    ).rejects.toThrow(/source path/);
    expect(readdirSync(destination)).toEqual([]);
  });

  it('rejects aliases of the same source path before writing', async () => {
    await expect(
      stageWorkspace(
        {
          workPath,
          files: {
            'dir/file': new FileBlob({ data: 'one' }),
            'dir/./file': new FileBlob({ data: 'two' }),
          },
        },
        destination
      )
    ).rejects.toThrow(/source path/);
    expect(readdirSync(destination)).toEqual([]);
  });

  it('preserves internal relative links and rewrites internal absolute links', async () => {
    await stageWorkspace(
      {
        workPath,
        files: {
          'lib/app.rb': new FileBlob({ data: 'app' }),
          'bin/relative': link('../lib/app.rb'),
          'bin/absolute': link(join(workPath, 'lib/app.rb')),
          parent: link(workPath),
        },
      },
      destination
    );
    for (const name of ['relative', 'absolute']) {
      expect(readlinkSync(join(destination, 'bin', name))).toBe(
        join('..', 'lib', 'app.rb')
      );
      expect(readFileSync(join(destination, 'bin', name), 'utf8')).toBe('app');
    }
    expect(readlinkSync(join(destination, 'parent'))).toBe('.');
  });

  it.each([
    '../../outside',
    '/outside',
  ])('rejects an outside-root symlink target %s', async target => {
    await expect(
      stageWorkspace(
        {
          workPath,
          files: { 'lib/link': link(target) },
        },
        destination
      )
    ).rejects.toThrow(/escapes the service root/);
    expect(readdirSync(destination)).toEqual([]);
  });

  it('never writes files through source symlinks', async () => {
    await expect(
      stageWorkspace(
        {
          workPath,
          files: {
            alias: link('real'),
            'alias/file': new FileBlob({ data: 'no' }),
            'real/file': new FileBlob({ data: 'yes' }),
          },
        },
        destination
      )
    ).rejects.toThrow(/inside symlink/);
    expect(readdirSync(destination)).toEqual([]);
  });

  it('validates symlink chains using native filesystem resolution', async () => {
    const staging = stageWorkspace(
      {
        workPath,
        files: { alias: link('.'), outside: link('alias/..') },
      },
      destination
    );
    if (process.platform === 'win32') {
      // Windows reduces alias/.. before following alias; POSIX follows it first.
      await expect(staging).resolves.toBeUndefined();
      expect(readlinkSync(join(destination, 'outside'))).toBe('alias\\..');
      expect(realpathSync.native(join(destination, 'outside'))).toBe(
        realpathSync.native(destination)
      );
    } else {
      await expect(staging).rejects.toThrow(/escapes the staged service/);
    }
  });

  it('rejects targets that were not included in the source map', async () => {
    writeFileSync(join(workPath, 'ignored'), 'host-only input');
    await expect(
      stageWorkspace(
        {
          workPath,
          files: { alias: link('ignored') },
        },
        destination
      )
    ).rejects.toThrow(/no target in the staged service/);
  });
});
