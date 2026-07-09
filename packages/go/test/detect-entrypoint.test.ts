import fs from 'fs-extra';
import { tmpdir } from 'os';
import path from 'path';
import { detectEntrypoint } from '../src/entrypoint';

async function makeTmp(name: string): Promise<string> {
  const dir = path.join(tmpdir(), `vc-go-detect-${name}-${Date.now()}`);
  await fs.mkdirp(dir);
  return dir;
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
