import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ejectSnapshot } from '../../../native-eject.js';
import { compareEject } from '../../../scripts/verify-native-eject.mjs';

let root: string;
let distRoot: string;
let snapshot: string;
let ejectedRoot: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'vercel-verify-eject-'));
  distRoot = join(root, 'dist');
  snapshot = join(root, 'snapshot');
  ejectedRoot = join(root, 'ejected');
  await mkdir(distRoot, { recursive: true });
  await writeFile(join(distRoot, 'vc.js'), '#!/usr/bin/env node\nrun();');
  await writeFile(join(distRoot, 'index.js'), 'cli();');
  await mkdir(join(snapshot, 'dist', 'builders'), { recursive: true });
  await mkdir(join(snapshot, 'node_modules'));
  await writeFile(join(snapshot, 'package.json'), '{"version":"64.1.0"}');
  await writeFile(join(snapshot, 'dist', 'vc.js'), '\nrun();');
  await writeFile(join(snapshot, 'dist', 'index.js'), 'cli();');
  for (const file of ['builder-graph.json.br', 'builder-index.json']) {
    await writeFile(join(snapshot, 'dist', 'builders', file), '{}');
  }
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('compareEject', () => {
  it('accepts the built dist plus the Builder graphs', () => {
    ejectSnapshot(snapshot, ejectedRoot);

    expect(compareEject({ ejectedRoot, distRoot, version: '64.1.0' })).toEqual(
      []
    );
  });

  it('reports a version mismatch', () => {
    ejectSnapshot(snapshot, ejectedRoot);

    expect(compareEject({ ejectedRoot, distRoot, version: '64.2.0' })).toEqual([
      'eject-manifest.json version 64.1.0 does not match 64.2.0',
    ]);
  });

  it('reports dist files that differ, are missing or are extra', async () => {
    await writeFile(join(snapshot, 'dist', 'index.js'), 'changed();');
    await writeFile(join(snapshot, 'dist', 'extra.js'), '');
    await writeFile(join(distRoot, 'help.js'), '');
    ejectSnapshot(snapshot, ejectedRoot);

    expect(
      compareEject({ ejectedRoot, distRoot, version: '64.1.0' }).sort()
    ).toEqual([
      'dist/extra.js is only in the eject',
      'dist/help.js is missing from the eject',
      'dist/index.js differs from the built dist',
    ]);
  });

  it('reports files changed after the eject', async () => {
    ejectSnapshot(snapshot, ejectedRoot);
    await writeFile(join(ejectedRoot, 'package.json'), '{}');

    expect(compareEject({ ejectedRoot, distRoot, version: '64.1.0' })).toEqual([
      'package.json does not match its eject-manifest.json hash',
    ]);
  });

  it('reports missing Builder graphs', async () => {
    await rm(join(snapshot, 'dist', 'builders'), { recursive: true });
    ejectSnapshot(snapshot, ejectedRoot);

    expect(compareEject({ ejectedRoot, distRoot, version: '64.1.0' })).toEqual([
      'dist/builders/builder-graph.json.br is missing from the eject',
      'dist/builders/builder-index.json is missing from the eject',
    ]);
  });
});
